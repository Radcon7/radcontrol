#!/usr/bin/env python3
"""Fail-closed matched O2/RadControl promotion, rollback, and reinstall."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import stat
import subprocess
import sys
from pathlib import Path
from typing import Any


PRODUCTION_LIVE = {
    "o2Root": Path("/home/chris/.local/share/radcontrol/o2-runtime"),
    "binary": Path("/home/chris/.local/bin/radcontrol-app"),
    "launcher": Path("/home/chris/.local/bin/radcontrol-launch.sh"),
    "desktop": Path("/home/chris/.local/share/applications/radcontrol-o2.desktop"),
    "icon": Path("/home/chris/.local/share/icons/hicolor/128x128/apps/radcontrol-app.png"),
}
PRODUCTION_STAGE_PARENT = Path("/home/chris/.local/share/radcontrol")
PRODUCTION_PRIMARY_O2 = Path("/home/chris/dev/o2")
FILE_KEYS = ("binary", "launcher", "desktop", "icon")
PAIR_KEYS = {"o2Commit", "o2Tree"}


class TransactionError(RuntimeError):
    pass


def fail(message: str) -> TransactionError:
    return TransactionError(message)


def run(*args: str, cwd: Path | None = None) -> str:
    completed = subprocess.run(args, cwd=cwd, capture_output=True, text=True)
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout).strip()[:400]
        raise fail(f"{' '.join(args)} failed: {detail}")
    return completed.stdout.strip()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    try:
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
    except OSError as error:
        raise fail(f"cannot hash {path}: {error}") from error
    return digest.hexdigest()


def require_absolute(path: Path, label: str) -> Path:
    if not path.is_absolute() or ".." in path.parts:
        raise fail(f"{label} must be an absolute lexical path")
    return path


def existing_directory(path: Path, label: str) -> Path:
    require_absolute(path, label)
    try:
        metadata = path.lstat()
        canonical = path.resolve(strict=True)
    except OSError as error:
        raise fail(f"{label} is unavailable: {error}") from error
    if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISDIR(metadata.st_mode) or canonical != path:
        raise fail(f"{label} must be a canonical non-symlink directory")
    return path


def existing_file(path: Path, label: str) -> Path:
    require_absolute(path, label)
    try:
        metadata = path.lstat()
        canonical = path.resolve(strict=True)
    except OSError as error:
        raise fail(f"{label} is unavailable: {error}") from error
    if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISREG(metadata.st_mode) or metadata.st_nlink != 1 or canonical != path:
        raise fail(f"{label} must be one canonical regular file")
    return path


def inside(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
        return path != parent
    except ValueError:
        return False


def fsync_directory(path: Path) -> None:
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def load_manifest(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise fail(f"transaction manifest is unavailable or malformed: {error}") from error
    if not isinstance(payload, dict) or payload.get("schemaVersion") != 1:
        raise fail("transaction manifest schemaVersion must be 1")
    expected = {"schemaVersion", "transactionId", "primaryO2Repository", "processName", "live", "stage", "oldPair", "newPair"}
    if set(payload) != expected:
        raise fail("transaction manifest has an unexpected top-level shape")
    if not isinstance(payload["transactionId"], str) or not payload["transactionId"].replace("-", "").isalnum():
        raise fail("transactionId must contain only letters, numbers, and hyphens")
    if not isinstance(payload["processName"], str) or not payload["processName"]:
        raise fail("processName is required")
    for name in ("oldPair", "newPair"):
        pair = payload.get(name)
        if not isinstance(pair, dict) or set(pair) != PAIR_KEYS:
            raise fail(f"{name} must contain exact O2 commit and tree identities")
        if any(not isinstance(value, str) or len(value) != 40 for value in pair.values()):
            raise fail(f"{name} identities must be full 40-character Git hashes")
    return payload


class Transaction:
    def __init__(self, manifest: dict[str, Any], test_root: Path | None):
        try:
            self.manifest = manifest
            self.transaction_id = manifest["transactionId"]
            self.primary = Path(manifest["primaryO2Repository"])
            self.process_name = manifest["processName"]
            self.live = manifest["live"]
            self.stage = manifest["stage"]
            self.old_pair = manifest["oldPair"]
            self.new_pair = manifest["newPair"]
            self.live_o2 = Path(self.live["o2Root"])
            self.live_files = {key: Path(self.live["files"][key]["path"]) for key in FILE_KEYS}
            self.live_modes = {key: int(self.live["files"][key]["mode"], 8) for key in FILE_KEYS}
            self.stage_root = Path(self.stage["root"])
            self.candidate_o2 = Path(self.stage["candidateO2"])
            self.new_parked_o2 = Path(self.stage["newParkedO2"])
            self.new_failed_o2 = Path(self.stage["newFailedO2"])
            self.old_parked_o2 = Path(self.stage["oldParkedO2"])
            self.state_backups = Path(self.stage["stateBackups"])
            self.state_file = Path(self.stage["stateFile"])
            self.candidate_files = self._file_set(self.stage["candidateFiles"], "candidateFiles")
            self.rollback_files = self._file_set(self.stage["rollbackFiles"], "rollbackFiles")
            self.evidence = self._evidence(self.stage["evidence"])
        except (KeyError, TypeError, ValueError) as error:
            raise fail(f"transaction manifest has an invalid nested shape: {error}") from error
        self.test_root = test_root
        self._validate_shape_and_scope()

    def _file_set(self, raw: Any, label: str) -> dict[str, dict[str, Any]]:
        if not isinstance(raw, dict) or set(raw) != set(FILE_KEYS):
            raise fail(f"{label} must contain exactly {', '.join(FILE_KEYS)}")
        result: dict[str, dict[str, Any]] = {}
        for key in FILE_KEYS:
            row = raw[key]
            if not isinstance(row, dict) or set(row) != {"path", "sha256"}:
                raise fail(f"{label}.{key} must contain path and sha256")
            if not isinstance(row["sha256"], str) or len(row["sha256"]) != 64:
                raise fail(f"{label}.{key}.sha256 must be a full SHA-256")
            result[key] = {"path": Path(row["path"]), "sha256": row["sha256"]}
        return result

    def _evidence(self, raw: Any) -> list[dict[str, Any]]:
        if not isinstance(raw, list) or not raw:
            raise fail("stage.evidence must contain at least one fixed evidence file")
        result = []
        for index, row in enumerate(raw):
            if not isinstance(row, dict) or set(row) != {"path", "sha256"}:
                raise fail(f"stage.evidence[{index}] must contain path and sha256")
            result.append({"path": Path(row["path"]), "sha256": row["sha256"]})
        return result

    def _validate_shape_and_scope(self) -> None:
        if not isinstance(self.live, dict) or set(self.live) != {"o2Root", "files"}:
            raise fail("live must contain o2Root and files")
        if not isinstance(self.live.get("files"), dict) or set(self.live["files"]) != set(FILE_KEYS):
            raise fail("live.files has an unexpected shape")
        for key, row in self.live["files"].items():
            if not isinstance(row, dict) or set(row) != {"path", "mode"}:
                raise fail(f"live.files.{key} must contain path and mode")
            if row["mode"] not in {"0644", "0755"}:
                raise fail(f"live.files.{key}.mode is unsupported")

        paths = [
            self.primary, self.live_o2, *self.live_files.values(), self.stage_root,
            self.candidate_o2, self.new_parked_o2, self.new_failed_o2,
            self.old_parked_o2, self.state_backups, self.state_file,
            *(row["path"] for row in self.candidate_files.values()),
            *(row["path"] for row in self.rollback_files.values()),
            *(row["path"] for row in self.evidence),
        ]
        for candidate in paths:
            require_absolute(candidate, "transaction path")
        if self.test_root:
            root = existing_directory(self.test_root, "test transaction root")
            if any(candidate != root and not inside(candidate, root) for candidate in paths):
                raise fail("test transaction paths must stay under --test-root")
        else:
            if self.primary != PRODUCTION_PRIMARY_O2:
                raise fail("production primary O2 repository is not canonical")
            if self.live_o2 != PRODUCTION_LIVE["o2Root"]:
                raise fail("production live O2 path is not canonical")
            for key in FILE_KEYS:
                if self.live_files[key] != PRODUCTION_LIVE[key]:
                    raise fail(f"production live {key} path is not canonical")
            if not inside(self.stage_root, PRODUCTION_STAGE_PARENT):
                raise fail("production stage root must stay beneath the RadControl data root")
            for candidate in [
                self.candidate_o2, self.new_parked_o2, self.new_failed_o2,
                self.old_parked_o2, self.state_backups, self.state_file,
                *(row["path"] for row in self.candidate_files.values()),
                *(row["path"] for row in self.rollback_files.values()),
                *(row["path"] for row in self.evidence),
            ]:
                if not inside(candidate, self.stage_root):
                    raise fail("all production transaction material must stay under stage.root")

    def assert_stopped(self) -> None:
        completed = subprocess.run(["pgrep", "-x", self.process_name], capture_output=True, text=True)
        if completed.returncode == 0 and completed.stdout.strip():
            raise fail(f"refusing transaction: {self.process_name} is running")
        if completed.returncode not in {0, 1}:
            raise fail(f"could not determine whether {self.process_name} is running")

    def assert_worktree(self, root: Path, pair: dict[str, str], label: str) -> None:
        existing_directory(root, label)
        if run("git", "-C", str(root), "rev-parse", "HEAD") != pair["o2Commit"]:
            raise fail(f"{label} commit does not match the manifest")
        if run("git", "-C", str(root), "rev-parse", "HEAD^{tree}") != pair["o2Tree"]:
            raise fail(f"{label} tree does not match the manifest")
        if run("git", "-C", str(root), "status", "--porcelain"):
            raise fail(f"{label} worktree is dirty")

    def assert_private_state_directory(self, state_root: Path) -> None:
        state_root = existing_directory(state_root, f"{state_root} private state")
        for current, directories, files in os.walk(state_root, followlinks=False):
            current_path = Path(current)
            for name in [*directories, *files]:
                candidate = current_path / name
                metadata = candidate.lstat()
                if stat.S_ISLNK(metadata.st_mode):
                    raise fail(f"private state contains a symlink: {candidate}")
                if metadata.st_mode & 0o077:
                    raise fail(f"private state is group/world accessible: {candidate}")
        if state_root.stat().st_mode & 0o077:
            raise fail(f"private state is group/world accessible: {state_root}")

    def assert_private_state(self, root: Path) -> None:
        self.assert_private_state_directory(root / ".state")

    def assert_file_set(self, rows: dict[str, dict[str, Any]], label: str) -> None:
        for key, row in rows.items():
            candidate = existing_file(row["path"], f"{label} {key}")
            if sha256(candidate) != row["sha256"]:
                raise fail(f"{label} {key} SHA-256 does not match")

    def assert_evidence(self) -> None:
        for index, row in enumerate(self.evidence):
            candidate = existing_file(row["path"], f"release evidence {index}")
            if sha256(candidate) != row["sha256"]:
                raise fail(f"release evidence {index} SHA-256 does not match")

    def assert_pair(self, pair: dict[str, str], rows: dict[str, dict[str, Any]], label: str) -> None:
        self.assert_worktree(self.live_o2, pair, f"live {label} O2")
        self.assert_private_state(self.live_o2)
        for key in FILE_KEYS:
            candidate = existing_file(self.live_files[key], f"live {label} {key}")
            if sha256(candidate) != rows[key]["sha256"]:
                raise fail(f"live {label} {key} SHA-256 does not match")
            if stat.S_IMODE(candidate.stat().st_mode) != self.live_modes[key]:
                raise fail(f"live {label} {key} mode does not match")

    def repair_worktrees(self, *paths: Path) -> None:
        existing_directory(self.primary, "primary O2 repository")
        run("git", "-C", str(self.primary), "worktree", "repair", *(str(path) for path in paths if path.exists()))

    def atomic_install(self, source: Path, target: Path, mode: int) -> None:
        existing_file(source, "transaction install source")
        if target.exists() or target.is_symlink():
            existing_file(target, "transaction install target")
        temporary = target.with_name(f"{target.name}.{self.transaction_id}-next")
        if temporary.exists() or temporary.is_symlink():
            raise fail(f"atomic install temporary already exists: {temporary}")
        existing_directory(target.parent, "transaction install target directory")
        try:
            with source.open("rb") as source_handle, temporary.open("xb") as target_handle:
                shutil.copyfileobj(source_handle, target_handle)
                target_handle.flush()
                os.fsync(target_handle.fileno())
            os.chmod(temporary, mode)
            os.replace(temporary, target)
            fsync_directory(target.parent)
        except Exception:
            temporary.unlink(missing_ok=True)
            raise

    def install_files(self, rows: dict[str, dict[str, Any]]) -> None:
        for key in FILE_KEYS:
            self.atomic_install(rows[key]["path"], self.live_files[key], self.live_modes[key])

    def write_state(self, value: str) -> None:
        existing_directory(self.state_file.parent, "transaction state directory")
        temporary = self.state_file.with_name(f"{self.state_file.name}.next")
        if temporary.exists() or temporary.is_symlink():
            raise fail("transaction state temporary already exists")
        with temporary.open("x", encoding="utf-8") as handle:
            handle.write(f"{value}\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, self.state_file)
        fsync_directory(self.state_file.parent)

    def sync_private_state(self, source_root: Path, target_root: Path, backup: Path) -> None:
        self.assert_private_state(source_root)
        self.assert_private_state(target_root)
        temporary = target_root / f".state.{self.transaction_id}-next"
        if temporary.exists() or backup.exists():
            raise fail("private-state temporary or backup already exists")
        backup.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chmod(backup.parent, 0o700)
        shutil.copytree(source_root / ".state", temporary, symlinks=False)
        self.assert_private_state_directory(temporary)
        moved_old_state = False
        try:
            os.replace(target_root / ".state", backup)
            moved_old_state = True
            os.replace(temporary, target_root / ".state")
        except Exception:
            if moved_old_state and backup.exists() and not (target_root / ".state").exists():
                os.replace(backup, target_root / ".state")
            if temporary.exists():
                shutil.rmtree(temporary)
            raise
        fsync_directory(target_root)
        fsync_directory(backup.parent)
        self.assert_private_state(target_root)

    def preflight(self) -> None:
        self.assert_stopped()
        existing_directory(self.stage_root, "transaction stage root")
        if self.stage_root.stat().st_mode & 0o077:
            raise fail("transaction stage root must be private (0700)")
        self.assert_pair(self.old_pair, self.rollback_files, "old pair")
        self.assert_worktree(self.candidate_o2, self.new_pair, "candidate O2")
        self.assert_private_state(self.candidate_o2)
        self.assert_file_set(self.candidate_files, "candidate")
        self.assert_file_set(self.rollback_files, "rollback")
        self.assert_evidence()
        for candidate in (self.old_parked_o2, self.new_parked_o2, self.new_failed_o2):
            if candidate.exists():
                raise fail(f"preflight destination already exists: {candidate}")

    def recover_old_pair(self) -> None:
        try:
            self.install_files(self.rollback_files)
            if self.old_parked_o2.exists():
                if self.live_o2.exists() and not self.new_failed_o2.exists():
                    os.replace(self.live_o2, self.new_failed_o2)
                if not self.live_o2.exists():
                    os.replace(self.old_parked_o2, self.live_o2)
            self.repair_worktrees(self.live_o2, self.new_failed_o2)
            self.assert_pair(self.old_pair, self.rollback_files, "recovered old pair")
            self.write_state("old-live-recovered")
        except Exception as error:
            raise fail(f"automatic old-pair recovery did not verify: {error}") from error

    def promote(self) -> None:
        self.preflight()
        try:
            self.write_state("promotion-started")
            os.replace(self.live_o2, self.old_parked_o2)
            os.replace(self.candidate_o2, self.live_o2)
            self.repair_worktrees(self.live_o2, self.old_parked_o2)
            self.install_files(self.candidate_files)
            self.assert_pair(self.new_pair, self.candidate_files, "new pair")
            self.write_state("new-live")
        except Exception:
            self.recover_old_pair()
            raise

    def rollback(self) -> None:
        self.assert_stopped()
        self.assert_pair(self.new_pair, self.candidate_files, "new pair")
        self.assert_worktree(self.old_parked_o2, self.old_pair, "parked old O2")
        self.assert_private_state(self.old_parked_o2)
        if self.new_parked_o2.exists():
            raise fail("new parked O2 already exists")
        self.sync_private_state(
            self.live_o2,
            self.old_parked_o2,
            self.state_backups / "old-before-rollback",
        )
        try:
            self.write_state("rollback-started")
            os.replace(self.live_o2, self.new_parked_o2)
            os.replace(self.old_parked_o2, self.live_o2)
            self.repair_worktrees(self.live_o2, self.new_parked_o2)
            self.install_files(self.rollback_files)
            self.assert_pair(self.old_pair, self.rollback_files, "old pair")
            self.write_state("old-live")
        except Exception:
            self.recover_old_pair()
            raise

    def reinstall(self) -> None:
        self.assert_stopped()
        self.assert_pair(self.old_pair, self.rollback_files, "old pair")
        self.assert_worktree(self.new_parked_o2, self.new_pair, "parked new O2")
        self.assert_private_state(self.new_parked_o2)
        if self.old_parked_o2.exists():
            raise fail("old parked O2 already exists")
        self.sync_private_state(
            self.live_o2,
            self.new_parked_o2,
            self.state_backups / "new-before-reinstall",
        )
        try:
            self.write_state("reinstall-started")
            os.replace(self.live_o2, self.old_parked_o2)
            os.replace(self.new_parked_o2, self.live_o2)
            self.repair_worktrees(self.live_o2, self.old_parked_o2)
            self.install_files(self.candidate_files)
            self.assert_pair(self.new_pair, self.candidate_files, "new pair")
            self.write_state("new-live-final")
        except Exception:
            self.recover_old_pair()
            raise


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser()
    result.add_argument("manifest", type=Path)
    result.add_argument("action", choices=("preflight", "promote", "rollback", "reinstall"))
    result.add_argument("--test-root", type=Path)
    return result


def main() -> int:
    args = parser().parse_args()
    try:
        transaction = Transaction(load_manifest(args.manifest), args.test_root)
        getattr(transaction, args.action)()
        print(json.dumps({"ok": True, "action": args.action, "transactionId": transaction.transaction_id}, sort_keys=True))
        return 0
    except TransactionError as error:
        print(json.dumps({"ok": False, "action": args.action, "error": str(error)}, sort_keys=True), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

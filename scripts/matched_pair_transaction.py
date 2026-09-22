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

from release_evidence import (
    COMPATIBILITY_PATH,
    WORKFLOW_PATH,
    ReleaseEvidenceError,
    capture_evidence_bytes,
    capture_evidence_json,
    validate_release_manifest,
)


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
OLD_PAIR_KEYS = {"o2Commit", "o2Tree", "binarySha256"}
NEW_PAIR_KEYS = {"o2Commit", "o2Tree", "radcontrolSourceSha", "radcontrolSourceTree", "binarySha256"}
V1_PAIR_KEYS = {"o2Commit", "o2Tree"}
SHA256_KEYS = {"binarySha256"}
TRUSTED_GIT = "/usr/bin/git"
TRUSTED_PGREP = "/usr/bin/pgrep"
PRODUCTION_ARTIFACT_FILENAME = "radcontrol-app"
PRODUCTION_PROCESS_NAME = "radcontrol-app"
TEST_PROCESS_NAME = "radcontrol-test"
TRUSTED_GIT_ENV = {
    "PATH": "/usr/local/bin:/usr/bin:/bin",
    "LANG": "C.UTF-8",
    "LC_ALL": "C.UTF-8",
    "GIT_CONFIG_NOSYSTEM": "1",
    "GIT_CONFIG_GLOBAL": "/dev/null",
    "GIT_TERMINAL_PROMPT": "0",
    "GIT_OPTIONAL_LOCKS": "0",
    "GIT_NO_REPLACE_OBJECTS": "1",
}
TRUSTED_PROCESS_ENV = {
    "PATH": "/usr/bin:/bin",
    "LANG": "C.UTF-8",
    "LC_ALL": "C.UTF-8",
}


class TransactionError(RuntimeError):
    pass


def fail(message: str) -> TransactionError:
    return TransactionError(message)


def git_run(repository: Path, *args: str) -> str:
    completed = subprocess.run(
        [TRUSTED_GIT, "-C", str(repository), *args],
        env=TRUSTED_GIT_ENV,
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout).strip()[:400]
        raise fail(f"trusted git {' '.join(args)} failed: {detail}")
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


def load_manifest(path: Path, action: str) -> dict[str, Any]:
    try:
        payload, _ = capture_evidence_json(
            path, "transaction manifest", maximum=1024 * 1024
        )
    except ReleaseEvidenceError as error:
        raise fail(str(error)) from error
    if not isinstance(payload, dict) or payload.get("schemaVersion") not in {1, 2}:
        raise fail("transaction manifest schemaVersion must be 1 or 2")
    schema_version = payload["schemaVersion"]
    if schema_version == 1 and action != "rollback":
        raise fail("transaction schemaVersion 1 is recovery-only and supports only rollback")
    expected = {
        "schemaVersion", "transactionId", "primaryO2Repository", "live", "stage",
        "oldPair", "newPair",
    }
    if schema_version == 1:
        expected.add("processName")
    if set(payload) != expected:
        raise fail("transaction manifest has an unexpected top-level shape")
    if not isinstance(payload["transactionId"], str) or not payload["transactionId"].replace("-", "").isalnum():
        raise fail("transactionId must contain only letters, numbers, and hyphens")
    if schema_version == 1 and payload["processName"] != PRODUCTION_PROCESS_NAME:
        raise fail("legacy transaction processName must be exactly radcontrol-app")
    pair_keys = (
        {"oldPair": OLD_PAIR_KEYS, "newPair": NEW_PAIR_KEYS}
        if schema_version == 2
        else {"oldPair": V1_PAIR_KEYS, "newPair": V1_PAIR_KEYS}
    )
    for name in ("oldPair", "newPair"):
        pair = payload.get(name)
        allowed = [pair_keys[name]]
        if schema_version == 2 and name == "oldPair":
            # Historical manifests remain readable; active private Work still
            # requires the explicit provenance below, never a candidate fallback.
            allowed.append(OLD_PAIR_KEYS | {"radcontrolSourceSha"})
        if not isinstance(pair, dict) or set(pair) not in allowed:
            raise fail(f"{name} has an unexpected identity shape for schemaVersion {schema_version}")
        for key, value in pair.items():
            expected_length = 64 if key in SHA256_KEYS else 40
            if not isinstance(value, str) or len(value) != expected_length or any(character not in "0123456789abcdef" for character in value):
                raise fail(f"{name}.{key} must be a full lowercase {expected_length}-character hash")
    return payload


class Transaction:
    def __init__(self, manifest: dict[str, Any], test_root: Path | None, manifest_path: Path):
        try:
            self.manifest = manifest
            self.schema_version = manifest["schemaVersion"]
            self.transaction_id = manifest["transactionId"]
            self.primary = Path(manifest["primaryO2Repository"])
            self.manifest_path = manifest_path
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
        paths: set[Path] = set()
        for index, row in enumerate(raw):
            if not isinstance(row, dict) or set(row) != {"path", "sha256"}:
                raise fail(f"stage.evidence[{index}] must contain path and sha256")
            path = Path(row["path"])
            if path in paths:
                raise fail("stage.evidence must not contain duplicate paths")
            if not isinstance(row["sha256"], str) or len(row["sha256"]) != 64 or any(character not in "0123456789abcdef" for character in row["sha256"]):
                raise fail(f"stage.evidence[{index}].sha256 must be a full lowercase SHA-256")
            paths.add(path)
            result.append({"path": path, "sha256": row["sha256"]})
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
            self.manifest_path, self.primary, self.live_o2, *self.live_files.values(), self.stage_root,
            self.candidate_o2, self.new_parked_o2, self.new_failed_o2,
            self.old_parked_o2, self.state_backups, self.state_file,
            *(row["path"] for row in self.candidate_files.values()),
            *(row["path"] for row in self.rollback_files.values()),
            *(row["path"] for row in self.evidence),
        ]
        for candidate in paths:
            require_absolute(candidate, "transaction path")
        expected_stage_paths = {
            self.manifest_path: self.stage_root / "transaction-manifest.json",
            self.candidate_o2: self.stage_root / "candidate-o2",
            self.new_parked_o2: self.stage_root / "new-parked-o2",
            self.new_failed_o2: self.stage_root / "new-failed-o2",
            self.old_parked_o2: self.stage_root / "old-parked-o2",
            self.state_backups: self.stage_root / "state-backups",
            self.state_file: self.stage_root / "transaction-state",
        }
        for actual, expected in expected_stage_paths.items():
            if actual != expected:
                raise fail(f"transaction stage lineage path is not canonical: {actual}")
        for key in FILE_KEYS:
            if self.candidate_files[key]["path"] != self.stage_root / "candidate-files" / key:
                raise fail(f"candidateFiles.{key} path is not canonical for the transaction stage")
            if self.rollback_files[key]["path"] != self.stage_root / "rollback-files" / key:
                raise fail(f"rollbackFiles.{key} path is not canonical for the transaction stage")
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
        process_name = TEST_PROCESS_NAME if self.test_root else PRODUCTION_PROCESS_NAME
        completed = subprocess.run(
            [TRUSTED_PGREP, "-x", process_name],
            env=TRUSTED_PROCESS_ENV,
            capture_output=True,
            text=True,
        )
        if completed.returncode == 0 and completed.stdout.strip():
            raise fail(f"refusing transaction: {process_name} is running")
        if completed.returncode not in {0, 1}:
            raise fail(f"could not determine whether {process_name} is running")

    def assert_stage_private(self) -> None:
        existing_directory(self.stage_root, "transaction stage root")
        if self.stage_root.stat().st_mode & 0o077:
            raise fail("transaction stage root must be private (0700)")

    def assert_worktree(self, root: Path, pair: dict[str, str], label: str) -> None:
        existing_directory(root, label)
        if git_run(root, "rev-parse", "HEAD") != pair["o2Commit"]:
            raise fail(f"{label} commit does not match the manifest")
        if git_run(root, "rev-parse", "HEAD^{tree}") != pair["o2Tree"]:
            raise fail(f"{label} tree does not match the manifest")
        if git_run(root, "status", "--porcelain"):
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

    def assert_operator_work_pair(self, root: Path, pair: dict, label: str) -> None:
        """Require the versioned explicit-activation contract on both sides."""
        if not (root / "scripts/o2_operator_work_store.py").is_file():
            raise fail(f"operator-work {label} incompatible: O2 cannot recognize private work")
        required = {"operator.work.list", "operator.work.mutate", "operator.work.private-v1"}
        provider = existing_file(root / "scripts/o2_contract_info.sh", "work provider").read_text()
        if not required <= set(provider.split()):
            raise fail(f"operator-work {label} provider capability missing")
        compatibility, _ = capture_evidence_json(
            root / COMPATIBILITY_PATH, f"{label} work compatibility", maximum=64_000)
        if not pair.get("radcontrolSourceSha") or pair["radcontrolSourceSha"] != compatibility.get("radcontrolSourceSha"):
            raise fail(f"operator-work {label} source provenance missing or mismatched")
        repository = Path(__file__).resolve().parents[1]
        try:
            client = json.loads(git_run(repository, "show", pair["radcontrolSourceSha"] + ":contracts/o2-radcontrol/v1/client.json"))
        except (RuntimeError, ValueError, KeyError) as error:
            raise fail(f"operator-work {label} client proof unavailable") from error
        if not required <= set(client.get("requiredCapabilities", [])):
            raise fail(f"operator-work {label} client cannot display current authority")

    def assert_operator_work_rollback(self, new_root: Path, old_root: Path) -> None:
        """Inactive explicit bridge may roll back; private bytes never may be
        exposed to a legacy-only pair, even if its activation marker is damaged.
        The fixed private store is never copied by generation exchanges.
        """
        work_root = (self.test_root / "operator-work" if self.test_root else
                     Path("/home/chris/.local/share/radcontrol/operator-work"))
        marker = work_root.parent / "operator-work.activated"
        present = work_root.exists() or work_root.is_symlink() or marker.exists() or marker.is_symlink()
        if not (new_root / "scripts/o2_operator_work_store.py").exists() and not present:
            return
        self.assert_operator_work_pair(new_root, self.new_pair, "candidate")
        if not present:
            # Only explicit private-v1 code promises noncreating, read-only
            # legacy operation. Earlier auto-importing Wave 2A is not exempt.
            return
        self.assert_operator_work_pair(old_root, self.old_pair, "rollback")

    def assert_private_state(self, root: Path) -> None:
        self.assert_private_state_directory(root / ".state")

    def assert_file_set(self, rows: dict[str, dict[str, Any]], label: str) -> None:
        for key, row in rows.items():
            candidate = existing_file(row["path"], f"{label} {key}")
            if sha256(candidate) != row["sha256"]:
                raise fail(f"{label} {key} SHA-256 does not match")

    def assert_evidence(self) -> None:
        for index, row in enumerate(self.evidence):
            try:
                capture_evidence_bytes(
                    row["path"], f"release evidence {index}", expected_sha256=row["sha256"]
                )
            except ReleaseEvidenceError as error:
                raise fail(str(error)) from error

    def release_manifest_path(self) -> Path:
        canonical = [row["path"] for row in self.evidence if row["path"].name == "release-manifest.json"]
        if not canonical:
            raise fail("stage.evidence is missing the canonical release-manifest.json")
        if len(canonical) != 1:
            raise fail("stage.evidence contains duplicate release-manifest.json entries")
        authoritative = list(canonical)
        for row in self.evidence:
            path = row["path"]
            if path in canonical or path.suffix != ".json":
                continue
            try:
                payload, _ = capture_evidence_json(
                    path, f"release evidence {path.name}", expected_sha256=row["sha256"]
                )
            except ReleaseEvidenceError:
                continue
            schema = payload.get("schema") if isinstance(payload, dict) else None
            if isinstance(schema, str) and schema.startswith("radcontrol-release-candidate/"):
                authoritative.append(path)
        if len(authoritative) != 1:
            raise fail("stage.evidence contains ambiguous authoritative release manifests")
        return canonical[0]

    def assert_release_admission(self, candidate_root: Path) -> None:
        release_path = self.release_manifest_path()
        release_rows = [row for row in self.evidence if row["path"] == release_path]
        try:
            manifest, _ = capture_evidence_json(
                release_path,
                "release manifest",
                expected_sha256=release_rows[0]["sha256"],
            )
        except ReleaseEvidenceError as error:
            raise fail(str(error)) from error
        binary = self.candidate_files["binary"]
        try:
            validate_release_manifest(
                manifest,
                o2_sha=self.new_pair["o2Commit"],
                radcontrol_sha=self.new_pair["radcontrolSourceSha"],
                artifact_filename=PRODUCTION_ARTIFACT_FILENAME,
                artifact_sha256=binary["sha256"],
            )
        except ReleaseEvidenceError as error:
            raise fail(str(error)) from error

        admission = manifest["lifecycleAdmission"]
        review = admission["reviewEvidence"]
        publication = admission["publicationEvidence"]
        if publication["o2Source"]["protectedTree"] != self.new_pair["o2Tree"]:
            raise fail("release admission O2 tree does not match transaction newPair")
        if review["radcontrolSource"]["tree"] != self.new_pair["radcontrolSourceTree"]:
            raise fail("release admission RadControl tree does not match transaction newPair")
        if binary["sha256"] != self.new_pair["binarySha256"]:
            raise fail("candidate binary does not match transaction newPair binary identity")

        compatibility_path = candidate_root / COMPATIBILITY_PATH
        try:
            compatibility, _ = capture_evidence_json(
                compatibility_path,
                "candidate O2 compatibility manifest",
                expected_sha256=admission["compatibilitySha256"],
            )
        except ReleaseEvidenceError as error:
            raise fail(str(error)) from error
        expected_compatibility_keys = {
            "schemaVersion", "protocol", "radcontrolSourceSha", "clientContractPath", "clientContractSha256"
        }
        if set(compatibility) != expected_compatibility_keys or compatibility.get("schemaVersion") != 1 or compatibility.get("protocol") != "o2-radcontrol":
            raise fail("candidate O2 compatibility manifest has an unsupported shape")
        if compatibility.get("clientContractPath") != "contracts/o2-radcontrol/v1/client.json":
            raise fail("candidate O2 compatibility client contract path is not canonical")
        client_digest = compatibility.get("clientContractSha256")
        if not isinstance(client_digest, str) or len(client_digest) != 64 or any(character not in "0123456789abcdef" for character in client_digest):
            raise fail("candidate O2 compatibility client contract SHA-256 is malformed")
        if compatibility.get("radcontrolSourceSha") != self.new_pair["radcontrolSourceSha"]:
            raise fail("candidate O2 compatibility pin does not match transaction newPair RadControl source")

        try:
            capture_evidence_bytes(
                candidate_root / WORKFLOW_PATH,
                "candidate O2 release workflow",
                expected_sha256=admission["workflowCorrelation"]["fileSha256"],
            )
        except ReleaseEvidenceError as error:
            raise fail(str(error)) from error

        dependency_path = release_path.parent / manifest["dependencyManifest"]["filename"]
        dependency_rows = [row for row in self.evidence if row["path"] == dependency_path]
        if len(dependency_rows) != 1:
            raise fail("stage.evidence must contain exactly one release dependency manifest")
        if dependency_rows[0]["sha256"] != manifest["dependencyManifest"]["sha256"]:
            raise fail("release dependency manifest hash claims conflict")
        try:
            dependency, _ = capture_evidence_json(
                dependency_path,
                "release dependency manifest",
                expected_sha256=dependency_rows[0]["sha256"],
            )
        except ReleaseEvidenceError as error:
            raise fail(str(error)) from error
        if dependency.get("schema") != "radcontrol-dependencies/v1":
            raise fail("release dependency manifest schema is unsupported")
        if dependency.get("compatibleO2SourceSha") != self.new_pair["o2Commit"] or dependency.get("radcontrolSourceSha") != self.new_pair["radcontrolSourceSha"]:
            raise fail("release dependency manifest source identity mismatch")

    def assert_pair(self, pair: dict[str, str], rows: dict[str, dict[str, Any]], label: str) -> None:
        if self.schema_version == 2 and rows["binary"]["sha256"] != pair["binarySha256"]:
            raise fail(f"{label} binary identity conflicts with the transaction pair")
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
        git_run(self.primary, "worktree", "repair", *(str(path) for path in paths if path.exists()))

    def transaction_state(self) -> str:
        try:
            payload, _ = capture_evidence_bytes(
                self.state_file, "transaction state", maximum=128
            )
            value = payload.decode("utf-8").strip()
        except (ReleaseEvidenceError, UnicodeDecodeError) as error:
            raise fail(f"transaction state is unavailable or invalid: {error}") from error
        return value

    def assert_transaction_state(self, expected: str) -> None:
        if self.transaction_state() != expected:
            raise fail(f"transaction state must be exactly {expected}")

    def assert_native_receipt(self, phase: str) -> None:
        """Consume the production harness result, bound to this immutable manifest.

        Receipts are retained transaction evidence under the existing same-UID
        trust model, not a new source admission or authorization mechanism.
        """
        expected_state = "new-live" if phase == "first" else "new-live-awaiting-final"
        try:
            receipt, _ = capture_evidence_json(
                self.stage_root / "evidence" / f"native-{phase}.json",
                f"{phase} native acceptance", maximum=64_000,
            )
        except ReleaseEvidenceError as error:
            raise fail(str(error)) from error
        if (not isinstance(receipt, dict) or receipt.get("ok") is not True
                or receipt.get("acceptance") != "production-artifact-read-only"
                or receipt.get("phase") != phase
                or receipt.get("transactionId") != self.transaction_id
                or receipt.get("manifestSha256") != sha256(self.manifest_path)
                or receipt.get("transactionState") != expected_state
                or receipt.get("o2Sha") != self.new_pair["o2Commit"]
                or receipt.get("radcontrolSha") != self.new_pair["radcontrolSourceSha"]
                or receipt.get("artifactSha256") != self.new_pair["binarySha256"]):
            raise fail(f"{phase} native acceptance receipt does not match this transaction")
        matrix_path = Path(__file__).resolve().parent / "native_wave11_matrix.json"
        matrix = json.loads(matrix_path.read_text(encoding="utf-8"))
        wave11 = receipt.get("wave11")
        files = [*matrix["harnessFiles"], "scripts/tauri_production_readonly.mjs"]
        harness = {name: sha256(Path(__file__).resolve().parents[1] / name) for name in files}
        if (not isinstance(wave11, dict) or wave11.get("ok") is not True
                or wave11.get("schema") != matrix["schema"]
                or wave11.get("kind") != "synthetic-ui-contract"
                or wave11.get("realRepair") is not False
                or wave11.get("simulatedApplyCount") != 2
                or wave11.get("scenarios") != matrix["scenarios"]
                or wave11.get("harnessDigests") != harness
                or any(wave11.get(key) != receipt.get(key)
                       for key in ("o2Sha", "radcontrolSha", "artifactSha256"))):
            raise fail(f"{phase} complete bound Wave 1.1 native receipt required")
        wave2a = wave11.get("wave2a", {})
        width = wave2a.get("width", {})
        window = json.loads((Path(__file__).resolve().parents[1] / "src-tauri/tauri.conf.json").read_text())["app"]["windows"][0]
        expected = [window["width"], window["minWidth"]]
        observations = width.get("observations", [])
        if (wave2a.get("ok") is not True or wave2a.get("bridgeReadOnly") is not True
                or wave2a.get("readiness") != matrix["workReadinessScenarios"]
                or width.get("kind") != "production-supported-width"
                or width.get("minimum") != window["minWidth"] or width.get("widths") != expected
                or not isinstance(observations, list) or len(observations) != len(expected)
                or any(not isinstance(row, dict) or row.get("requested") != requested
                       or type(row.get("observed")) not in (int, float)
                       or not requested - 2 <= row["observed"] <= requested + 2
                       for row, requested in zip(observations, expected))):
            raise fail(f"{phase} production-supported-width and bridge native receipt required")
        task_progress = wave2a.get("taskProgress", {})
        if (task_progress.get("ok") is not True
                or task_progress.get("checks") != matrix["taskProgressScenarios"]
                or task_progress.get("width") != width):
            raise fail(f"{phase} complete task progress native receipt required")


    def accept_first(self) -> None:
        self.accept_native("first", "new-live", "new-live-first-accepted")

    def accept_final(self) -> None:
        self.assert_native_receipt("first")
        for name in ("old-before-rollback", "new-before-reinstall"):
            self.assert_private_state_directory(self.state_backups / name)
        self.accept_native("final", "new-live-awaiting-final", "new-live-final")

    def accept_native(self, phase: str, expected: str, target: str) -> None:
        self.assert_stopped()
        self.assert_stage_private()
        self.assert_transaction_state(expected)
        self.assert_pair(self.new_pair, self.candidate_files, "new pair")
        self.assert_worktree(self.old_parked_o2, self.old_pair, "parked old O2")
        self.assert_private_state(self.old_parked_o2)
        self.assert_file_set(self.rollback_files, "rollback")
        self.assert_file_set(self.candidate_files, "candidate")
        self.assert_evidence()
        self.assert_release_admission(self.live_o2)
        self.assert_native_receipt(phase)
        self.write_state(target)

    def verify_rollback(self) -> None:
        self.assert_stopped()
        self.assert_stage_private()
        self.assert_transaction_state("old-live")
        self.assert_pair(self.old_pair, self.rollback_files, "old pair")
        self.assert_worktree(self.new_parked_o2, self.new_pair, "parked new O2")
        self.assert_private_state(self.new_parked_o2)
        self.assert_file_set(self.candidate_files, "candidate")
        self.assert_file_set(self.rollback_files, "rollback")
        self.assert_evidence()
        self.assert_release_admission(self.new_parked_o2)
        self.assert_native_receipt("first")
        self.rollback_native_smoke()
        self.write_state("old-live-verified")

    def rollback_native_smoke(self) -> None:
        # Existing test-root transactions contain non-native fixture executables.
        # Production always launches the actual restored binary before advancing.
        if self.test_root is not None:
            return
        compatibility, _ = capture_evidence_json(
            self.live_o2 / COMPATIBILITY_PATH, "restored compatibility", maximum=64_000)
        completed = subprocess.run(
            ["node", str(Path(__file__).resolve().parent / "tauri_production_readonly.mjs"),
             "--expected-o2-sha", self.old_pair["o2Commit"],
             "--expected-radcontrol-sha", compatibility["radcontrolSourceSha"],
             "--expected-artifact-sha", self.old_pair["binarySha256"],
             "--transaction-manifest", str(self.manifest_path), "--phase", "rollback"],
            capture_output=True, text=True)
        if completed.returncode != 0:
            raise fail("restored prior native launch failed: " + completed.stderr[-1500:])
        receipt, _ = capture_evidence_json(
            self.stage_root / "evidence" / "native-rollback.json", "rollback native launch", maximum=64_000)
        expected = dict(ok=True, acceptance="rollback-native-smoke", diagnosticsVerified=True,
                        phase="rollback", transactionId=self.transaction_id,
                        manifestSha256=sha256(self.manifest_path), transactionState="old-live",
                        o2Sha=self.old_pair["o2Commit"], radcontrolSha=compatibility["radcontrolSourceSha"],
                        artifactSha256=self.old_pair["binarySha256"])
        if any(receipt.get(key) != value for key, value in expected.items()):
            raise fail("rollback native receipt does not match restored pair")
        if (self.live_o2.parent / "operator-work").exists() and receipt.get("privateWorkVerified") is not True:
            raise fail("rollback native receipt must verify current private Work")
        self.assert_stopped()
        self.assert_pair(self.old_pair, self.rollback_files, "restored prior native pair")

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
            os.chmod(temporary, 0o600)
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
        self.assert_operator_work_rollback(self.candidate_o2, self.live_o2)
        self.assert_stopped()
        self.assert_stage_private()
        self.assert_pair(self.old_pair, self.rollback_files, "old pair")
        self.assert_worktree(self.candidate_o2, self.new_pair, "candidate O2")
        self.assert_private_state(self.candidate_o2)
        self.assert_file_set(self.candidate_files, "candidate")
        self.assert_file_set(self.rollback_files, "rollback")
        self.assert_evidence()
        self.assert_release_admission(self.candidate_o2)
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
        self.assert_operator_work_rollback(self.live_o2, self.old_parked_o2)
        self.assert_stopped()
        self.assert_stage_private()
        state = self.transaction_state()
        if self.schema_version == 2:
            if state not in {"new-live", "new-live-first-accepted", "new-live-awaiting-final"}:
                raise fail("transaction state must be exactly new-live, new-live-first-accepted, or new-live-awaiting-final")
            if state == "new-live-awaiting-final":
                self.assert_native_receipt("first")
                for name in ("old-before-rollback", "new-before-reinstall"):
                    self.assert_private_state_directory(self.state_backups / name)
        else:
            self.assert_transaction_state("new-live-final")
            if self.candidate_o2.exists() or self.new_parked_o2.exists():
                raise fail("legacy rollback requires the retained final-cycle stage layout")
            self.assert_private_state_directory(
                self.state_backups / "old-before-rollback"
            )
            self.assert_private_state_directory(
                self.state_backups / "new-before-reinstall"
            )
        self.assert_pair(self.new_pair, self.candidate_files, "new pair")
        self.assert_worktree(self.old_parked_o2, self.old_pair, "parked old O2")
        self.assert_private_state(self.old_parked_o2)
        self.assert_file_set(self.candidate_files, "candidate")
        self.assert_file_set(self.rollback_files, "rollback")
        self.assert_evidence()
        if self.schema_version == 2:
            self.assert_release_admission(self.live_o2)
        if self.new_parked_o2.exists():
            raise fail("new parked O2 already exists")
        self.sync_private_state(
            self.live_o2,
            self.old_parked_o2,
            self.state_backups / (
                ("old-before-final-rejection" if state == "new-live-awaiting-final" else "old-before-rollback")
                if self.schema_version == 2
                else "old-before-legacy-final-rollback"
            ),
        )
        try:
            self.write_state("rollback-started")
            os.replace(self.live_o2, self.new_parked_o2)
            os.replace(self.old_parked_o2, self.live_o2)
            self.repair_worktrees(self.live_o2, self.new_parked_o2)
            self.install_files(self.rollback_files)
            self.assert_pair(self.old_pair, self.rollback_files, "old pair")
            self.write_state("old-live-final-rejected" if state == "new-live-awaiting-final" else "old-live")
        except Exception:
            self.recover_old_pair()
            raise

    def reinstall(self) -> None:
        self.assert_operator_work_rollback(self.new_parked_o2, self.live_o2)
        self.assert_stopped()
        if self.schema_version != 2:
            raise fail("reinstall requires transaction schemaVersion 2")
        self.assert_stage_private()
        self.assert_transaction_state("old-live-verified")
        self.assert_native_receipt("first")
        self.assert_pair(self.old_pair, self.rollback_files, "old pair")
        self.assert_worktree(self.new_parked_o2, self.new_pair, "parked new O2")
        self.assert_private_state(self.new_parked_o2)
        self.assert_file_set(self.candidate_files, "candidate")
        self.assert_file_set(self.rollback_files, "rollback")
        self.assert_evidence()
        self.assert_release_admission(self.new_parked_o2)
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
            self.write_state("new-live-awaiting-final")
        except Exception:
            self.recover_old_pair()
            raise


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser()
    result.add_argument("manifest", type=Path)
    result.add_argument("action", choices=("preflight", "promote", "rollback", "verify-rollback", "reinstall", "accept-first", "accept-final"))
    result.add_argument("--test-root", type=Path)
    return result


def main() -> int:
    args = parser().parse_args()
    try:
        transaction = Transaction(
            load_manifest(args.manifest, args.action), args.test_root, args.manifest
        )
        getattr(transaction, args.action.replace("-", "_"))()
        print(json.dumps({"ok": True, "action": args.action, "transactionId": transaction.transaction_id}, sort_keys=True))
        return 0
    except TransactionError as error:
        print(json.dumps({"ok": False, "action": args.action, "error": str(error)}, sort_keys=True), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

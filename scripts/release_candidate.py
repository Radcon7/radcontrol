#!/usr/bin/env python3
"""Create and independently verify RadControl release-candidate evidence."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import stat
import sys
from pathlib import Path
from typing import Any

from release_evidence import (
    RELEASE_MANIFEST_SCHEMA,
    ReleaseEvidenceError,
    capture_evidence_json,
    validate_release_admission,
    validate_release_manifest,
)


ROOT = Path(__file__).resolve().parents[1]
SHA = re.compile(r"^[0-9a-f]{40}$")
ACTION = re.compile(r"^\s*-?\s*uses:\s*([^\s@]+)@([0-9a-f]{40})\s*(?:#\s*(.+))?$", re.MULTILINE)
MAX_ARTIFACT_BYTES = 1024 * 1024 * 1024


EvidenceError = ReleaseEvidenceError


def sha256(path: Path, maximum: int | None = None) -> str:
    try:
        metadata = path.lstat()
    except OSError as error:
        raise EvidenceError(f"required file is unavailable: {path}") from error
    if path.is_symlink() or not stat.S_ISREG(metadata.st_mode):
        raise EvidenceError(f"required file is not a regular file: {path}")
    if maximum is not None and metadata.st_size > maximum:
        raise EvidenceError(f"required file exceeds its size bound: {path}")
    digest = hashlib.sha256()
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(descriptor, "rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def validate_sha(value: str, label: str) -> str:
    if not SHA.fullmatch(value):
        raise EvidenceError(f"{label} must be one lowercase 40-character Git SHA")
    return value


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def npm_evidence() -> dict[str, Any]:
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    lock = json.loads((ROOT / "package-lock.json").read_text(encoding="utf-8"))
    packages = []
    for package_path, record in sorted(lock.get("packages", {}).items()):
        if package_path == "":
            continue
        packages.append(
            {
                key: record[key]
                for key in ("name", "version", "resolved", "integrity", "dev", "optional")
                if key in record
            }
            | {"path": package_path}
        )
    return {
        "lockfileVersion": lock.get("lockfileVersion"),
        "directRuntime": dict(sorted(package.get("dependencies", {}).items())),
        "directDevelopment": dict(sorted(package.get("devDependencies", {}).items())),
        "lockedPackages": packages,
    }


def cargo_evidence() -> dict[str, Any]:
    manifest_text = (ROOT / "src-tauri/Cargo.toml").read_text(encoding="utf-8")
    direct: dict[str, dict[str, str]] = {"build-dependencies": {}, "dependencies": {}}
    active = ""
    for raw in manifest_text.splitlines():
        line = raw.strip()
        if line.startswith("[") and line.endswith("]"):
            active = line[1:-1]
            continue
        if active in direct and line and not line.startswith("#") and "=" in line:
            name, specification = line.split("=", 1)
            direct[active][name.strip()] = specification.strip()
    direct = {group: dict(sorted(values.items())) for group, values in direct.items()}

    lock_text = (ROOT / "src-tauri/Cargo.lock").read_text(encoding="utf-8")
    packages = []
    for block in lock_text.split("[[package]]")[1:]:
        record = {}
        for key in ("name", "version", "source", "checksum"):
            match = re.search(rf'^\s*{key}\s*=\s*"([^"]+)"', block, re.MULTILINE)
            if match:
                record[key] = match.group(1)
        if "name" not in record or "version" not in record:
            raise EvidenceError("Cargo.lock contains a malformed package record")
        packages.append(record)
    packages.sort(key=lambda item: (item["name"], item["version"], item.get("source", "")))
    return {"direct": direct, "lockedPackages": packages}


def action_evidence(o2_root: Path | None = None) -> list[dict[str, str]]:
    actions: set[tuple[str, str, str, str]] = set()
    roots = [("Radcon7/radcontrol", ROOT)]
    if o2_root is not None:
        roots.append(("Radcon7/o2", o2_root.resolve()))
    for repository, root in roots:
        workflow_root = root / ".github/workflows"
        if not workflow_root.is_dir():
            raise EvidenceError(f"workflow evidence root is unavailable: {repository}")
        for workflow in sorted(workflow_root.glob("*.yml")):
            text = workflow.read_text(encoding="utf-8")
            for match in ACTION.finditer(text):
                actions.add(
                    (repository, match.group(1), match.group(2), (match.group(3) or "").strip())
                )
    return [
        {
            "repository": repository,
            "action": action,
            "sha": commit,
            "reviewedRelease": release,
        }
        for repository, action, commit, release in sorted(actions)
    ]


def dependency_manifest(rad_sha: str, o2_sha: str, o2_root: Path | None = None) -> dict[str, Any]:
    return {
        "schema": "radcontrol-dependencies/v1",
        "radcontrolSourceSha": rad_sha,
        "compatibleO2SourceSha": o2_sha,
        "npm": npm_evidence(),
        "cargo": cargo_evidence(),
        "githubActions": action_evidence(o2_root),
    }


def create(args: argparse.Namespace) -> None:
    rad_sha = validate_sha(args.radcontrol_sha, "RadControl source SHA")
    o2_sha = validate_sha(args.o2_sha, "O2 source SHA")
    artifact = Path(args.artifact).resolve()
    output = Path(args.output).resolve()
    artifact_hash = sha256(artifact, MAX_ARTIFACT_BYTES)
    admission, _ = capture_evidence_json(
        Path(args.lifecycle_admission).resolve(), "lifecycle admission"
    )
    validate_release_admission(
        admission,
        o2_sha=o2_sha,
        radcontrol_sha=rad_sha,
        artifact_sha256=artifact_hash,
    )
    dependencies = dependency_manifest(rad_sha, o2_sha, Path(args.o2_root) if args.o2_root else None)
    dependency_path = output / "dependency-manifest.json"
    write_json(dependency_path, dependencies)
    system_packages = [line.strip() for line in Path(args.system_packages).read_text().splitlines() if line.strip()]
    manifest = {
        "schema": RELEASE_MANIFEST_SCHEMA,
        "radcontrolSourceSha": rad_sha,
        "compatibleO2SourceSha": o2_sha,
        "artifact": {"filename": artifact.name, "sha256": artifact_hash},
        "buildTimestamp": args.timestamp,
        "toolchain": {"node": args.node_version, "rust": args.rust_version},
        "lockfiles": {
            "package-lock.json": sha256(ROOT / "package-lock.json"),
            "src-tauri/Cargo.lock": sha256(ROOT / "src-tauri/Cargo.lock"),
        },
        "systemPackages": sorted(system_packages),
        "dependencyManifest": {
            "filename": dependency_path.name,
            "sha256": sha256(dependency_path),
            "format": "deterministic dependency manifest; not a formal SBOM",
        },
        "lifecycleAdmission": admission,
    }
    validate_release_manifest(
        manifest,
        o2_sha=o2_sha,
        radcontrol_sha=rad_sha,
        artifact_filename=artifact.name,
        artifact_sha256=artifact_hash,
    )
    write_json(output / "release-manifest.json", manifest)
    print(json.dumps({"ok": True, "artifactSha256": artifact_hash}, sort_keys=True))


def verify(args: argparse.Namespace) -> None:
    rad_sha = validate_sha(args.radcontrol_sha, "RadControl source SHA")
    o2_sha = validate_sha(args.o2_sha, "O2 source SHA")
    artifact = Path(args.artifact).resolve()
    evidence = Path(args.evidence).resolve()
    manifest, _ = capture_evidence_json(
        evidence / "release-manifest.json", "release manifest"
    )
    artifact_hash = sha256(artifact, MAX_ARTIFACT_BYTES)
    validate_release_manifest(
        manifest,
        o2_sha=o2_sha,
        radcontrol_sha=rad_sha,
        artifact_filename=artifact.name,
        artifact_sha256=artifact_hash,
    )
    expected_artifact = manifest["artifact"]
    dep_record = manifest.get("dependencyManifest")
    if not isinstance(dep_record, dict) or dep_record.get("filename") != "dependency-manifest.json":
        raise EvidenceError("dependency evidence identity mismatch")
    dependencies, _ = capture_evidence_json(
        evidence / "dependency-manifest.json",
        "dependency evidence",
        expected_sha256=dep_record.get("sha256"),
    )
    if dependencies.get("radcontrolSourceSha") != rad_sha or dependencies.get("compatibleO2SourceSha") != o2_sha:
        raise EvidenceError("dependency evidence source identity mismatch")
    for path, expected in manifest.get("lockfiles", {}).items():
        if expected != sha256(ROOT / path):
            raise EvidenceError(f"release lockfile evidence mismatch: {path}")
    print(json.dumps({"ok": True, "artifactSha256": expected_artifact["sha256"]}, sort_keys=True))


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser()
    commands = result.add_subparsers(dest="command", required=True)
    create_parser = commands.add_parser("create")
    create_parser.add_argument("--artifact", required=True)
    create_parser.add_argument("--output", required=True)
    create_parser.add_argument("--radcontrol-sha", required=True)
    create_parser.add_argument("--o2-sha", required=True)
    create_parser.add_argument("--timestamp", required=True)
    create_parser.add_argument("--lifecycle-admission", required=True)
    create_parser.add_argument("--node-version", required=True)
    create_parser.add_argument("--rust-version", required=True)
    create_parser.add_argument("--system-packages", required=True)
    create_parser.add_argument("--o2-root")
    verify_parser = commands.add_parser("verify")
    verify_parser.add_argument("--artifact", required=True)
    verify_parser.add_argument("--evidence", required=True)
    verify_parser.add_argument("--radcontrol-sha", required=True)
    verify_parser.add_argument("--o2-sha", required=True)
    return result


def main() -> int:
    args = parser().parse_args()
    try:
        (create if args.command == "create" else verify)(args)
        return 0
    except (EvidenceError, OSError, ValueError, KeyError) as error:
        print(json.dumps({"ok": False, "error": str(error)}, sort_keys=True))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

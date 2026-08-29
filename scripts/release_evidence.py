#!/usr/bin/env python3
"""Shared semantic validation for governed RadControl release evidence."""

from __future__ import annotations

import re
from typing import Any


RELEASE_MANIFEST_SCHEMA = "radcontrol-release-candidate/v2"
ADMISSION_SCHEMA = "o2-radcontrol-release-admission/v1"
COMPATIBILITY_PATH = "contracts/o2-radcontrol/v1/compatibility.json"
WORKFLOW_REPOSITORY = "Radcon7/o2"
WORKFLOW_PATH = ".github/workflows/radcontrol-release-candidate.yml"
WORKFLOW_REF = "refs/heads/main"
DEPENDENCY_FORMAT = "deterministic dependency manifest; not a formal SBOM"

SHA40 = re.compile(r"^[0-9a-f]{40}$")
SHA256 = re.compile(r"^[0-9a-f]{64}$")
UTC_TIMESTAMP = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
POSITIVE_INTEGER = re.compile(r"^[1-9][0-9]*$")


class ReleaseEvidenceError(ValueError):
    pass


def _object(value: Any, keys: set[str], label: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != keys:
        raise ReleaseEvidenceError(f"{label} has an unexpected shape")
    return value


def _text(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ReleaseEvidenceError(f"{label} must be a non-empty string")
    return value


def _sha40(value: Any, label: str) -> str:
    if not isinstance(value, str) or not SHA40.fullmatch(value):
        raise ReleaseEvidenceError(f"{label} must be one lowercase 40-character Git SHA")
    return value


def _sha256(value: Any, label: str) -> str:
    if not isinstance(value, str) or not SHA256.fullmatch(value):
        raise ReleaseEvidenceError(f"{label} must be one lowercase SHA-256")
    return value


def _source(value: Any, label: str) -> dict[str, str]:
    source = _object(value, {"commit", "tree"}, label)
    return {
        "commit": _sha40(source["commit"], f"{label}.commit"),
        "tree": _sha40(source["tree"], f"{label}.tree"),
    }


def validate_release_admission(
    value: Any,
    *,
    o2_sha: str | None = None,
    radcontrol_sha: str | None = None,
    artifact_sha256: str | None = None,
) -> dict[str, Any]:
    admission = _object(
        value,
        {
            "schema",
            "state",
            "admittedFrom",
            "reviewEvidence",
            "publicationEvidence",
            "compatibility",
            "artifactSha256",
            "workflow",
        },
        "lifecycleAdmission",
    )
    if admission["schema"] != ADMISSION_SCHEMA:
        raise ReleaseEvidenceError("lifecycle admission schema is unsupported")
    if admission["state"] != "RELEASE_CANDIDATE":
        raise ReleaseEvidenceError("lifecycle admission state must be RELEASE_CANDIDATE")
    if admission["admittedFrom"] != "REMOTE_SOURCE_ACCEPTED":
        raise ReleaseEvidenceError("release candidate must be admitted from REMOTE_SOURCE_ACCEPTED")

    review = _object(
        admission["reviewEvidence"],
        {"state", "o2Source", "radcontrolSource"},
        "lifecycleAdmission.reviewEvidence",
    )
    if review["state"] != "SOURCE_ACCEPTED":
        raise ReleaseEvidenceError("review evidence state must be SOURCE_ACCEPTED")
    reviewed_o2 = _source(review["o2Source"], "lifecycleAdmission.reviewEvidence.o2Source")
    reviewed_radcontrol = _source(
        review["radcontrolSource"], "lifecycleAdmission.reviewEvidence.radcontrolSource"
    )

    publication = _object(
        admission["publicationEvidence"],
        {"state", "o2Source", "radcontrolSource"},
        "lifecycleAdmission.publicationEvidence",
    )
    if publication["state"] != "REMOTE_SOURCE_ACCEPTED":
        raise ReleaseEvidenceError("publication evidence state must be REMOTE_SOURCE_ACCEPTED")
    published_o2 = _object(
        publication["o2Source"],
        {"acceptedCommit", "acceptedTree", "protectedCommit", "protectedTree"},
        "lifecycleAdmission.publicationEvidence.o2Source",
    )
    published_radcontrol = _object(
        publication["radcontrolSource"],
        {"acceptedCommit", "acceptedTree", "protectedCommit", "protectedTree"},
        "lifecycleAdmission.publicationEvidence.radcontrolSource",
    )
    for label, source in (("o2Source", published_o2), ("radcontrolSource", published_radcontrol)):
        for key, value in source.items():
            _sha40(value, f"lifecycleAdmission.publicationEvidence.{label}.{key}")

    if published_o2["acceptedCommit"] != reviewed_o2["commit"] or published_o2["acceptedTree"] != reviewed_o2["tree"]:
        raise ReleaseEvidenceError("O2 review and publication accepted identities conflict")
    if published_radcontrol["acceptedCommit"] != reviewed_radcontrol["commit"] or published_radcontrol["acceptedTree"] != reviewed_radcontrol["tree"]:
        raise ReleaseEvidenceError("RadControl review and publication accepted identities conflict")
    if published_o2["protectedTree"] != published_o2["acceptedTree"]:
        raise ReleaseEvidenceError("protected O2 publication tree does not equal the accepted tree")
    if published_radcontrol["protectedTree"] != published_radcontrol["acceptedTree"]:
        raise ReleaseEvidenceError("protected RadControl publication tree does not equal the accepted tree")

    compatibility = _object(
        admission["compatibility"],
        {"path", "sha256", "radcontrolSourceSha"},
        "lifecycleAdmission.compatibility",
    )
    if compatibility["path"] != COMPATIBILITY_PATH:
        raise ReleaseEvidenceError("lifecycle admission compatibility path is not canonical")
    _sha256(compatibility["sha256"], "lifecycleAdmission.compatibility.sha256")
    _sha40(compatibility["radcontrolSourceSha"], "lifecycleAdmission.compatibility.radcontrolSourceSha")
    if compatibility["radcontrolSourceSha"] != reviewed_radcontrol["commit"]:
        raise ReleaseEvidenceError("lifecycle admission compatibility pin conflicts with accepted RadControl source")

    admitted_artifact = _sha256(admission["artifactSha256"], "lifecycleAdmission.artifactSha256")
    workflow = _object(
        admission["workflow"],
        {"repository", "path", "ref", "sourceCommit", "fileSha256", "runId", "runAttempt"},
        "lifecycleAdmission.workflow",
    )
    if workflow["repository"] != WORKFLOW_REPOSITORY or workflow["path"] != WORKFLOW_PATH or workflow["ref"] != WORKFLOW_REF:
        raise ReleaseEvidenceError("lifecycle admission workflow provenance is not canonical")
    _sha40(workflow["sourceCommit"], "lifecycleAdmission.workflow.sourceCommit")
    _sha256(workflow["fileSha256"], "lifecycleAdmission.workflow.fileSha256")
    if not isinstance(workflow["runId"], str) or not POSITIVE_INTEGER.fullmatch(workflow["runId"]):
        raise ReleaseEvidenceError("lifecycle admission workflow runId must be a positive integer string")
    if not isinstance(workflow["runAttempt"], str) or not POSITIVE_INTEGER.fullmatch(workflow["runAttempt"]):
        raise ReleaseEvidenceError("lifecycle admission workflow runAttempt must be a positive integer string")
    if workflow["sourceCommit"] != published_o2["protectedCommit"]:
        raise ReleaseEvidenceError("workflow source commit conflicts with protected O2 publication")

    if o2_sha is not None and published_o2["protectedCommit"] != o2_sha:
        raise ReleaseEvidenceError("lifecycle admission O2 source identity mismatch")
    if radcontrol_sha is not None and reviewed_radcontrol["commit"] != radcontrol_sha:
        raise ReleaseEvidenceError("lifecycle admission RadControl source identity mismatch")
    if artifact_sha256 is not None and admitted_artifact != artifact_sha256:
        raise ReleaseEvidenceError("lifecycle admission artifact identity mismatch")
    return admission


def validate_release_manifest(
    value: Any,
    *,
    o2_sha: str | None = None,
    radcontrol_sha: str | None = None,
    artifact_filename: str | None = None,
    artifact_sha256: str | None = None,
) -> dict[str, Any]:
    manifest = _object(
        value,
        {
            "schema",
            "radcontrolSourceSha",
            "compatibleO2SourceSha",
            "artifact",
            "buildTimestamp",
            "toolchain",
            "lockfiles",
            "systemPackages",
            "dependencyManifest",
            "lifecycleAdmission",
        },
        "release manifest",
    )
    if manifest["schema"] != RELEASE_MANIFEST_SCHEMA:
        raise ReleaseEvidenceError("release manifest schema is unsupported")
    manifest_radcontrol_sha = _sha40(manifest["radcontrolSourceSha"], "release manifest RadControl source")
    manifest_o2_sha = _sha40(manifest["compatibleO2SourceSha"], "release manifest O2 source")

    artifact = _object(manifest["artifact"], {"filename", "sha256"}, "release manifest artifact")
    filename = _text(artifact["filename"], "release manifest artifact filename")
    if "/" in filename or filename in {".", ".."}:
        raise ReleaseEvidenceError("release manifest artifact filename must be a basename")
    artifact_digest = _sha256(artifact["sha256"], "release manifest artifact sha256")
    if not isinstance(manifest["buildTimestamp"], str) or not UTC_TIMESTAMP.fullmatch(manifest["buildTimestamp"]):
        raise ReleaseEvidenceError("release manifest buildTimestamp must be an explicit UTC timestamp")

    toolchain = _object(manifest["toolchain"], {"node", "rust"}, "release manifest toolchain")
    _text(toolchain["node"], "release manifest Node toolchain")
    _text(toolchain["rust"], "release manifest Rust toolchain")
    lockfiles = _object(
        manifest["lockfiles"],
        {"package-lock.json", "src-tauri/Cargo.lock"},
        "release manifest lockfiles",
    )
    for path, digest in lockfiles.items():
        _sha256(digest, f"release manifest lockfile {path}")
    packages = manifest["systemPackages"]
    if not isinstance(packages, list) or not packages or any(not isinstance(row, str) or not row.strip() for row in packages):
        raise ReleaseEvidenceError("release manifest systemPackages must be a non-empty string list")
    if packages != sorted(set(packages)):
        raise ReleaseEvidenceError("release manifest systemPackages must be sorted and unique")
    dependency = _object(
        manifest["dependencyManifest"],
        {"filename", "sha256", "format"},
        "release manifest dependencyManifest",
    )
    if dependency["filename"] != "dependency-manifest.json" or dependency["format"] != DEPENDENCY_FORMAT:
        raise ReleaseEvidenceError("release manifest dependency evidence identity is unsupported")
    _sha256(dependency["sha256"], "release manifest dependency evidence sha256")

    validate_release_admission(
        manifest["lifecycleAdmission"],
        o2_sha=manifest_o2_sha,
        radcontrol_sha=manifest_radcontrol_sha,
        artifact_sha256=artifact_digest,
    )
    if o2_sha is not None and manifest_o2_sha != o2_sha:
        raise ReleaseEvidenceError("release manifest O2 source identity mismatch")
    if radcontrol_sha is not None and manifest_radcontrol_sha != radcontrol_sha:
        raise ReleaseEvidenceError("release manifest RadControl source identity mismatch")
    if artifact_filename is not None and filename != artifact_filename:
        raise ReleaseEvidenceError("release manifest artifact filename mismatch")
    if artifact_sha256 is not None and artifact_digest != artifact_sha256:
        raise ReleaseEvidenceError("release artifact SHA-256 mismatch")
    return manifest

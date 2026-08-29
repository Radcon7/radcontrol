from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from release_evidence import (  # noqa: E402
    ReleaseEvidenceError,
    capture_evidence_json,
    validate_release_admission,
)

SCRIPT = ROOT / "scripts/release_candidate.py"
RAD_SHA = "4" * 40
O2_SHA = "d" * 40
RAD_TREE = "5" * 40
O2_TREE = "e" * 40
PROTECTED_RAD_SHA = "6" * 40


def digest_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def admission(artifact_sha256: str) -> dict[str, object]:
    reviewed_o2 = {"commit": O2_SHA, "tree": O2_TREE}
    reviewed_radcontrol = {"commit": RAD_SHA, "tree": RAD_TREE}
    return {
        "schema": "o2-radcontrol-release-admission/v1",
        "state": "RELEASE_CANDIDATE",
        "admittedFrom": "REMOTE_SOURCE_ACCEPTED",
        "reviewEvidence": {
            "state": "SOURCE_ACCEPTED",
            "o2Source": reviewed_o2,
            "radcontrolSource": reviewed_radcontrol,
        },
        "publicationEvidence": {
            "state": "REMOTE_SOURCE_ACCEPTED",
            "o2Source": {
                "acceptedCommit": O2_SHA,
                "acceptedTree": O2_TREE,
                "protectedCommit": O2_SHA,
                "protectedTree": O2_TREE,
            },
            "radcontrolSource": {
                "acceptedCommit": RAD_SHA,
                "acceptedTree": RAD_TREE,
                "protectedCommit": PROTECTED_RAD_SHA,
                "protectedTree": RAD_TREE,
            },
        },
        "compatibilitySha256": "7" * 64,
        "artifactSha256": artifact_sha256,
        "workflowCorrelation": {
            "sourceCommit": O2_SHA,
            "fileSha256": "8" * 64,
            "runId": "12345",
            "runAttempt": "1",
        },
    }


class ReleaseCandidateEvidenceTests(unittest.TestCase):
    def run_script(self, *arguments: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["python3", str(SCRIPT), *arguments], cwd=ROOT, capture_output=True, text=True
        )

    def create(self, temporary: Path, o2_root: Path | None = None) -> tuple[Path, Path]:
        artifact = temporary / "radcontrol-app"
        artifact.write_bytes(b"reviewed release candidate\n")
        admission_path = temporary / "lifecycle-admission.json"
        admission_path.write_text(
            json.dumps(admission(digest_bytes(artifact.read_bytes()))), encoding="utf-8"
        )
        packages = temporary / "system-packages.txt"
        packages.write_text("libwebkit2gtk-4.1-dev=1\npatchelf=2\n", encoding="utf-8")
        evidence = temporary / "evidence"
        arguments = [
            "create", "--artifact", str(artifact), "--output", str(evidence),
            "--radcontrol-sha", RAD_SHA, "--o2-sha", O2_SHA,
            "--timestamp", "2026-08-16T00:00:00Z", "--lifecycle-admission", str(admission_path),
            "--node-version", "v24.12.0", "--rust-version", "rustc 1.93.0",
            "--system-packages", str(packages),
        ]
        if o2_root is not None:
            arguments.extend(["--o2-root", str(o2_root)])
        result = self.run_script(*arguments)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return artifact, evidence

    def verify(self, artifact: Path, evidence: Path, rad_sha: str = RAD_SHA) -> subprocess.CompletedProcess[str]:
        return self.run_script(
            "verify", "--artifact", str(artifact), "--evidence", str(evidence),
            "--radcontrol-sha", rad_sha, "--o2-sha", O2_SHA,
        )

    def test_valid_evidence_identifies_sources_and_verifies(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            artifact, evidence = self.create(Path(directory))
            manifest = json.loads((evidence / "release-manifest.json").read_text())
            self.assertEqual(manifest["radcontrolSourceSha"], RAD_SHA)
            self.assertEqual(manifest["compatibleO2SourceSha"], O2_SHA)
            self.assertEqual(manifest["schema"], "radcontrol-release-candidate/v2")
            self.assertEqual(manifest["lifecycleAdmission"]["state"], "RELEASE_CANDIDATE")
            self.assertEqual(
                set(manifest["lifecycleAdmission"]["workflowCorrelation"]),
                {"sourceCommit", "fileSha256", "runId", "runAttempt"},
            )
            self.assertNotIn("workflow", manifest["lifecycleAdmission"])
            self.assertEqual(self.verify(artifact, evidence).returncode, 0)

    def test_workflow_run_metadata_is_correlation_not_authentication(self) -> None:
        payload = admission("9" * 64)
        payload["workflowCorrelation"]["runId"] = "999999999999999999"
        validate_release_admission(payload)
        self.assertNotIn("providerAttestation", payload)
        self.assertNotIn("repository", payload["workflowCorrelation"])
        self.assertNotIn("ref", payload["workflowCorrelation"])

    def test_tampered_artifact_fails(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            artifact, evidence = self.create(Path(directory))
            artifact.write_bytes(b"tampered\n")
            result = self.verify(artifact, evidence)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("artifact SHA-256 mismatch", result.stdout)

    def test_o2_workflow_actions_are_included_when_orchestrated_by_o2(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            temporary = Path(directory)
            workflow = temporary / "o2/.github/workflows/ci.yml"
            workflow.parent.mkdir(parents=True)
            workflow.write_text(
                "steps:\n  - uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6\n",
                encoding="utf-8",
            )
            _artifact, evidence = self.create(temporary, temporary / "o2")
            dependencies = json.loads((evidence / "dependency-manifest.json").read_text())
            self.assertTrue(
                any(row["repository"] == "Radcon7/o2" for row in dependencies["githubActions"])
            )

    def test_wrong_source_and_modified_dependency_evidence_fail(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            artifact, evidence = self.create(Path(directory))
            self.assertNotEqual(self.verify(artifact, evidence, "5" * 40).returncode, 0)
            dependency = evidence / "dependency-manifest.json"
            dependency.write_text(dependency.read_text() + " ", encoding="utf-8")
            self.assertNotEqual(self.verify(artifact, evidence).returncode, 0)

    def test_unadmitted_lifecycle_states_fail_closed(self) -> None:
        for state in (
            "SOURCE_CANDIDATE",
            "SOURCE_ACCEPTED",
            "REMOTE_SOURCE_ACCEPTED",
            "INSTALLED",
            "LIVE",
            "arbitrary",
            "",
        ):
            with self.subTest(state=state), tempfile.TemporaryDirectory() as directory:
                temporary = Path(directory)
                artifact = temporary / "radcontrol-app"
                artifact.write_bytes(b"reviewed release candidate\n")
                payload = admission(digest_bytes(artifact.read_bytes()))
                payload["state"] = state
                admission_path = temporary / "lifecycle-admission.json"
                admission_path.write_text(json.dumps(payload), encoding="utf-8")
                packages = temporary / "system-packages.txt"
                packages.write_text("patchelf=2\n", encoding="utf-8")
                result = self.run_script(
                    "create", "--artifact", str(artifact), "--output", str(temporary / "evidence"),
                    "--radcontrol-sha", RAD_SHA, "--o2-sha", O2_SHA,
                    "--timestamp", "2026-08-16T00:00:00Z",
                    "--lifecycle-admission", str(admission_path),
                    "--node-version", "v24.12.0", "--rust-version", "rustc 1.93.0",
                    "--system-packages", str(packages),
                )
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("state must be RELEASE_CANDIDATE", result.stdout)

    def test_evidence_capture_hashes_and_parses_one_open_descriptor(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "evidence.json"
            original = b'{"identity":"retained"}\n'
            replacement = b'{"identity":"replacement"}\n'
            path.write_bytes(original)
            moved = path.with_name("evidence-opened.json")
            real_open = os.open

            def replace_after_open(target, flags):
                descriptor = real_open(target, flags)
                path.rename(moved)
                path.write_bytes(replacement)
                return descriptor

            with patch("release_evidence.os.open", side_effect=replace_after_open):
                value, actual = capture_evidence_json(
                    path,
                    "test evidence",
                    expected_sha256=digest_bytes(original),
                )
            self.assertEqual(value, {"identity": "retained"})
            self.assertEqual(actual, digest_bytes(original))
            self.assertEqual(path.read_bytes(), replacement)

    def test_evidence_capture_rejects_symlink(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / "target.json"
            target.write_text("{}\n", encoding="utf-8")
            link = root / "evidence.json"
            link.symlink_to(target)
            with self.assertRaisesRegex(ReleaseEvidenceError, "non-symlink"):
                capture_evidence_json(link, "test evidence")


if __name__ == "__main__":
    unittest.main()

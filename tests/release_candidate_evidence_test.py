from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/release_candidate.py"
RAD_SHA = "4" * 40
O2_SHA = "d" * 40


class ReleaseCandidateEvidenceTests(unittest.TestCase):
    def run_script(self, *arguments: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["python3", str(SCRIPT), *arguments], cwd=ROOT, capture_output=True, text=True
        )

    def create(self, temporary: Path, o2_root: Path | None = None) -> tuple[Path, Path]:
        artifact = temporary / "radcontrol-app"
        artifact.write_bytes(b"reviewed release candidate\n")
        packages = temporary / "system-packages.txt"
        packages.write_text("libwebkit2gtk-4.1-dev=1\npatchelf=2\n", encoding="utf-8")
        evidence = temporary / "evidence"
        arguments = [
            "create", "--artifact", str(artifact), "--output", str(evidence),
            "--radcontrol-sha", RAD_SHA, "--o2-sha", O2_SHA,
            "--timestamp", "2026-08-16T00:00:00Z", "--workflow", "Radcon7/radcontrol/release-candidate@refs/heads/main",
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
            self.assertEqual(self.verify(artifact, evidence).returncode, 0)

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


if __name__ == "__main__":
    unittest.main()

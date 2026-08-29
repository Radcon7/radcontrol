import hashlib
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TOOL = ROOT / "scripts/matched_pair_transaction.py"
FILE_KEYS = ("binary", "launcher", "desktop", "icon")


def run(*args: str, cwd: Path | None = None) -> str:
    completed = subprocess.run(args, cwd=cwd, capture_output=True, text=True)
    if completed.returncode != 0:
        raise AssertionError(completed.stderr or completed.stdout)
    return completed.stdout.strip()


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class MatchedPairTransactionTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="radcontrol-pair-transaction-")
        self.root = Path(self.temporary.name)
        self.primary = self.root / "o2-primary"
        self.primary.mkdir()
        run("git", "init", "-q", cwd=self.primary)
        run("git", "config", "user.name", "Fixture", cwd=self.primary)
        run("git", "config", "user.email", "fixture@example.test", cwd=self.primary)
        (self.primary / ".gitignore").write_text(".state/\n", encoding="utf-8")
        (self.primary / "identity.txt").write_text("old\n", encoding="utf-8")
        run("git", "add", ".", cwd=self.primary)
        run("git", "commit", "-qm", "old", cwd=self.primary)
        self.old_commit = run("git", "rev-parse", "HEAD", cwd=self.primary)
        self.old_tree = run("git", "rev-parse", "HEAD^{tree}", cwd=self.primary)
        self.old_radcontrol_sha = "1" * 40
        self.old_radcontrol_tree = "2" * 40
        self.new_radcontrol_sha = "3" * 40
        self.new_radcontrol_tree = "4" * 40
        self.protected_radcontrol_sha = "5" * 40
        (self.primary / "identity.txt").write_text("new\n", encoding="utf-8")
        compatibility = self.primary / "contracts/o2-radcontrol/v1/compatibility.json"
        compatibility.parent.mkdir(parents=True)
        compatibility.write_text(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "protocol": "o2-radcontrol",
                    "radcontrolSourceSha": self.new_radcontrol_sha,
                    "clientContractPath": "contracts/o2-radcontrol/v1/client.json",
                    "clientContractSha256": "6" * 64,
                },
                sort_keys=True,
            )
            + "\n",
            encoding="utf-8",
        )
        workflow = self.primary / ".github/workflows/radcontrol-release-candidate.yml"
        workflow.parent.mkdir(parents=True)
        workflow.write_text("name: RadControl release candidate\n", encoding="utf-8")
        run("git", "add", ".", cwd=self.primary)
        run("git", "commit", "-qm", "new", cwd=self.primary)
        self.new_commit = run("git", "rev-parse", "HEAD", cwd=self.primary)
        self.new_tree = run("git", "rev-parse", "HEAD^{tree}", cwd=self.primary)
        self.compatibility_sha256 = digest(compatibility)
        self.workflow_sha256 = digest(workflow)

        self.stage = self.root / "stage"
        self.stage.mkdir(mode=0o700)
        self.live_o2 = self.root / "live-o2"
        self.candidate_o2 = self.stage / "candidate-o2"
        run("git", "worktree", "add", "-q", "--detach", str(self.live_o2), self.old_commit, cwd=self.primary)
        run("git", "worktree", "add", "-q", "--detach", str(self.candidate_o2), self.new_commit, cwd=self.primary)
        self._state(self.live_o2, "old-state")
        self._state(self.candidate_o2, "candidate-state")

        self.live_files = {}
        self.candidate_files = {}
        self.rollback_files = {}
        for key in FILE_KEYS:
            live = self.root / "live" / key
            candidate = self.stage / "candidate-files" / key
            rollback = self.stage / "rollback-files" / key
            for path, contents in ((live, f"old-{key}\n"), (candidate, f"new-{key}\n"), (rollback, f"old-{key}\n")):
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(contents, encoding="utf-8")
            live.chmod(0o755 if key in {"binary", "launcher"} else 0o644)
            self.live_files[key] = live
            self.candidate_files[key] = candidate
            self.rollback_files[key] = rollback
        self.release_manifest = self.stage / "evidence" / "release-manifest.json"
        self.release_manifest.parent.mkdir()
        self.dependency_manifest = self.release_manifest.parent / "dependency-manifest.json"
        self.dependency_manifest.write_text(
            json.dumps(
                {
                    "schema": "radcontrol-dependencies/v1",
                    "radcontrolSourceSha": self.new_radcontrol_sha,
                    "compatibleO2SourceSha": self.new_commit,
                    "npm": {},
                    "cargo": {},
                    "githubActions": [],
                },
                sort_keys=True,
            )
            + "\n",
            encoding="utf-8",
        )
        lifecycle_admission = {
            "schema": "o2-radcontrol-release-admission/v1",
            "state": "RELEASE_CANDIDATE",
            "admittedFrom": "REMOTE_SOURCE_ACCEPTED",
            "reviewEvidence": {
                "state": "SOURCE_ACCEPTED",
                "o2Source": {"commit": self.new_commit, "tree": self.new_tree},
                "radcontrolSource": {
                    "commit": self.new_radcontrol_sha,
                    "tree": self.new_radcontrol_tree,
                },
            },
            "publicationEvidence": {
                "state": "REMOTE_SOURCE_ACCEPTED",
                "o2Source": {
                    "acceptedCommit": self.new_commit,
                    "acceptedTree": self.new_tree,
                    "protectedCommit": self.new_commit,
                    "protectedTree": self.new_tree,
                },
                "radcontrolSource": {
                    "acceptedCommit": self.new_radcontrol_sha,
                    "acceptedTree": self.new_radcontrol_tree,
                    "protectedCommit": self.protected_radcontrol_sha,
                    "protectedTree": self.new_radcontrol_tree,
                },
            },
            "compatibility": {
                "path": "contracts/o2-radcontrol/v1/compatibility.json",
                "sha256": self.compatibility_sha256,
                "radcontrolSourceSha": self.new_radcontrol_sha,
            },
            "artifactSha256": digest(self.candidate_files["binary"]),
            "workflow": {
                "repository": "Radcon7/o2",
                "path": ".github/workflows/radcontrol-release-candidate.yml",
                "ref": "refs/heads/main",
                "sourceCommit": self.new_commit,
                "fileSha256": self.workflow_sha256,
                "runId": "12345",
                "runAttempt": "1",
            },
        }
        self.release_manifest.write_text(
            json.dumps(
                {
                    "schema": "radcontrol-release-candidate/v2",
                    "radcontrolSourceSha": self.new_radcontrol_sha,
                    "compatibleO2SourceSha": self.new_commit,
                    "artifact": {
                        "filename": self.candidate_files["binary"].name,
                        "sha256": digest(self.candidate_files["binary"]),
                    },
                    "buildTimestamp": "2026-08-29T00:00:00Z",
                    "toolchain": {"node": "v24.12.0", "rust": "rustc 1.93.0"},
                    "lockfiles": {
                        "package-lock.json": "7" * 64,
                        "src-tauri/Cargo.lock": "8" * 64,
                    },
                    "systemPackages": ["patchelf=2"],
                    "dependencyManifest": {
                        "filename": self.dependency_manifest.name,
                        "sha256": digest(self.dependency_manifest),
                        "format": "deterministic dependency manifest; not a formal SBOM",
                    },
                    "lifecycleAdmission": lifecycle_admission,
                },
                sort_keys=True,
            )
            + "\n",
            encoding="utf-8",
        )

        manifest = {
            "schemaVersion": 2,
            "transactionId": "fixture-transaction",
            "primaryO2Repository": str(self.primary),
            "processName": "radcontrol-transaction-fixture-never-running",
            "live": {
                "o2Root": str(self.live_o2),
                "files": {
                    key: {"path": str(self.live_files[key]), "mode": "0755" if key in {"binary", "launcher"} else "0644"}
                    for key in FILE_KEYS
                },
            },
            "stage": {
                "root": str(self.stage),
                "candidateO2": str(self.candidate_o2),
                "newParkedO2": str(self.stage / "new-parked-o2"),
                "newFailedO2": str(self.stage / "new-failed-o2"),
                "oldParkedO2": str(self.stage / "old-parked-o2"),
                "stateBackups": str(self.stage / "state-backups"),
                "stateFile": str(self.stage / "transaction-state"),
                "candidateFiles": {key: {"path": str(self.candidate_files[key]), "sha256": digest(self.candidate_files[key])} for key in FILE_KEYS},
                "rollbackFiles": {key: {"path": str(self.rollback_files[key]), "sha256": digest(self.rollback_files[key])} for key in FILE_KEYS},
                "evidence": [
                    {"path": str(self.release_manifest), "sha256": digest(self.release_manifest)},
                    {"path": str(self.dependency_manifest), "sha256": digest(self.dependency_manifest)},
                ],
            },
            "oldPair": {
                "o2Commit": self.old_commit,
                "o2Tree": self.old_tree,
                "radcontrolSourceSha": self.old_radcontrol_sha,
                "radcontrolSourceTree": self.old_radcontrol_tree,
                "binarySha256": digest(self.rollback_files["binary"]),
            },
            "newPair": {
                "o2Commit": self.new_commit,
                "o2Tree": self.new_tree,
                "radcontrolSourceSha": self.new_radcontrol_sha,
                "radcontrolSourceTree": self.new_radcontrol_tree,
                "binarySha256": digest(self.candidate_files["binary"]),
            },
        }
        self.manifest = self.root / "transaction.json"
        self.manifest.write_text(json.dumps(manifest), encoding="utf-8")

    def tearDown(self):
        self.temporary.cleanup()

    def _state(self, root: Path, value: str):
        state = root / ".state"
        state.mkdir(mode=0o700)
        record = state / "operator-state.txt"
        record.write_text(value, encoding="utf-8")
        record.chmod(0o600)

    def action(self, name: str):
        return run("python3", str(TOOL), str(self.manifest), name, "--test-root", str(self.root))

    def preflight_result(self) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["python3", str(TOOL), str(self.manifest), "preflight", "--test-root", str(self.root)],
            capture_output=True,
            text=True,
        )

    def transaction_payload(self) -> dict:
        return json.loads(self.manifest.read_text(encoding="utf-8"))

    def write_transaction(self, payload: dict) -> None:
        self.manifest.write_text(json.dumps(payload), encoding="utf-8")

    def release_payload(self) -> dict:
        return json.loads(self.release_manifest.read_text(encoding="utf-8"))

    def write_release(self, payload: dict) -> None:
        self.release_manifest.write_text(json.dumps(payload), encoding="utf-8")
        transaction = self.transaction_payload()
        for row in transaction["stage"]["evidence"]:
            if row["path"] == str(self.release_manifest):
                row["sha256"] = digest(self.release_manifest)
        self.write_transaction(transaction)

    def assert_live(self, commit: str, prefix: str):
        self.assertEqual(run("git", "rev-parse", "HEAD", cwd=self.live_o2), commit)
        self.assertEqual(run("git", "status", "--porcelain", cwd=self.live_o2), "")
        for key in FILE_KEYS:
            self.assertEqual(self.live_files[key].read_text(encoding="utf-8"), f"{prefix}-{key}\n")

    def test_preflight_promote_rollback_and_reinstall(self):
        self.action("preflight")
        self.action("promote")
        self.assert_live(self.new_commit, "new")
        self.assertEqual((self.stage / "transaction-state").read_text().strip(), "new-live")

        live_state = self.live_o2 / ".state/operator-state.txt"
        live_state.write_text("state-after-promotion", encoding="utf-8")
        live_state.chmod(0o600)
        self.action("rollback")
        self.assert_live(self.old_commit, "old")
        self.assertEqual((self.live_o2 / ".state/operator-state.txt").read_text(), "state-after-promotion")
        self.assertEqual((self.stage / "transaction-state").read_text().strip(), "old-live")

        live_state = self.live_o2 / ".state/operator-state.txt"
        live_state.write_text("state-before-reinstall", encoding="utf-8")
        live_state.chmod(0o600)
        self.action("reinstall")
        self.assert_live(self.new_commit, "new")
        self.assertEqual((self.live_o2 / ".state/operator-state.txt").read_text(), "state-before-reinstall")
        self.assertEqual((self.stage / "transaction-state").read_text().strip(), "new-live-final")

    def test_preflight_rejects_dirty_live_o2_before_swap(self):
        (self.live_o2 / "identity.txt").write_text("dirty\n", encoding="utf-8")
        completed = subprocess.run(
            ["python3", str(TOOL), str(self.manifest), "preflight", "--test-root", str(self.root)],
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn("worktree is dirty", completed.stderr)
        self.assertTrue(self.live_o2.exists())
        self.assertFalse((self.stage / "old-parked-o2").exists())

    def test_preflight_rejects_dummy_release_manifest(self):
        self.write_release({"fixture": True})
        completed = self.preflight_result()
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn("release manifest has an unexpected shape", completed.stderr)

    def test_preflight_rejects_malformed_release_manifest_json(self):
        self.release_manifest.write_text("{not-json\n", encoding="utf-8")
        transaction = self.transaction_payload()
        for row in transaction["stage"]["evidence"]:
            if row["path"] == str(self.release_manifest):
                row["sha256"] = digest(self.release_manifest)
        self.write_transaction(transaction)
        completed = self.preflight_result()
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn("release manifest is malformed JSON", completed.stderr)

    def test_preflight_rejects_missing_lifecycle_admission(self):
        payload = self.release_payload()
        del payload["lifecycleAdmission"]
        self.write_release(payload)
        completed = self.preflight_result()
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn("release manifest has an unexpected shape", completed.stderr)

    def test_preflight_rejects_missing_release_manifest(self):
        transaction = self.transaction_payload()
        transaction["stage"]["evidence"] = [
            row for row in transaction["stage"]["evidence"] if row["path"] != str(self.release_manifest)
        ]
        self.write_transaction(transaction)
        completed = self.preflight_result()
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn("missing the canonical release-manifest.json", completed.stderr)

    def test_preflight_rejects_ambiguous_release_manifests(self):
        duplicate = self.release_manifest.parent / "candidate-copy.json"
        duplicate.write_bytes(self.release_manifest.read_bytes())
        transaction = self.transaction_payload()
        transaction["stage"]["evidence"].append({"path": str(duplicate), "sha256": digest(duplicate)})
        self.write_transaction(transaction)
        completed = self.preflight_result()
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn("ambiguous authoritative release manifests", completed.stderr)

    def test_preflight_rejects_unsupported_release_schema(self):
        payload = self.release_payload()
        payload["schema"] = "radcontrol-release-candidate/v1"
        self.write_release(payload)
        completed = self.preflight_result()
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn("release manifest schema is unsupported", completed.stderr)

    def test_preflight_rejects_non_release_candidate_states(self):
        for state in (
            "SOURCE_CANDIDATE",
            "SOURCE_ACCEPTED",
            "REMOTE_SOURCE_ACCEPTED",
            "INSTALLED",
            "LIVE",
            "arbitrary",
            "",
        ):
            with self.subTest(state=state):
                payload = self.release_payload()
                payload["lifecycleAdmission"]["state"] = state
                self.write_release(payload)
                completed = self.preflight_result()
                self.assertNotEqual(completed.returncode, 0)
                self.assertIn("state must be RELEASE_CANDIDATE", completed.stderr)
                payload["lifecycleAdmission"]["state"] = "RELEASE_CANDIDATE"
                self.write_release(payload)

    def test_preflight_rejects_cross_boundary_identity_conflicts(self):
        mutations = (
            ("O2 source", lambda payload: payload.__setitem__("compatibleO2SourceSha", "9" * 40)),
            ("RadControl source", lambda payload: payload.__setitem__("radcontrolSourceSha", "9" * 40)),
            ("artifact", lambda payload: payload["artifact"].__setitem__("sha256", "9" * 64)),
            ("workflow", lambda payload: payload["lifecycleAdmission"]["workflow"].__setitem__("fileSha256", "9" * 64)),
            ("compatibility", lambda payload: payload["lifecycleAdmission"]["compatibility"].__setitem__("sha256", "9" * 64)),
        )
        original = self.release_payload()
        for label, mutate in mutations:
            with self.subTest(label=label):
                payload = json.loads(json.dumps(original))
                mutate(payload)
                self.write_release(payload)
                completed = self.preflight_result()
                self.assertNotEqual(completed.returncode, 0)
        self.write_release(original)

    def test_preflight_rejects_transaction_pair_artifact_mismatch(self):
        transaction = self.transaction_payload()
        transaction["newPair"]["binarySha256"] = "9" * 64
        self.write_transaction(transaction)
        completed = self.preflight_result()
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn("candidate binary does not match transaction newPair", completed.stderr)


if __name__ == "__main__":
    unittest.main()

import hashlib
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import matched_pair_transaction as transaction_module  # noqa: E402

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
            "compatibilitySha256": self.compatibility_sha256,
            "artifactSha256": digest(self.candidate_files["binary"]),
            "workflowCorrelation": {
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
                        "filename": "radcontrol-app",
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
        self.manifest = self.stage / "transaction-manifest.json"
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

    def action_result(self, name: str, *, environment: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["python3", str(TOOL), str(self.manifest), name, "--test-root", str(self.root)],
            capture_output=True,
            text=True,
            env=environment,
        )

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

    def convert_to_v1(self) -> None:
        payload = self.transaction_payload()
        payload["schemaVersion"] = 1
        payload["processName"] = "radcontrol-app"
        payload["oldPair"] = {
            "o2Commit": payload["oldPair"]["o2Commit"],
            "o2Tree": payload["oldPair"]["o2Tree"],
        }
        payload["newPair"] = {
            "o2Commit": payload["newPair"]["o2Commit"],
            "o2Tree": payload["newPair"]["o2Tree"],
        }
        self.write_transaction(payload)

    def start_named_process(self, name: str) -> subprocess.Popen[str]:
        process = subprocess.Popen(
            [
                "/usr/bin/python3",
                "-c",
                (
                    "import ctypes,time; "
                    f"ctypes.CDLL(None).prctl(15, {name.encode()!r}, 0, 0, 0); "
                    "time.sleep(30)"
                ),
            ],
            text=True,
        )
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            found = subprocess.run(
                ["/usr/bin/pgrep", "-x", name], capture_output=True, text=True
            )
            if str(process.pid) in found.stdout.split():
                return process
            if process.poll() is not None:
                break
            time.sleep(0.05)
        process.terminate()
        process.wait(timeout=3)
        self.fail(f"fixture process did not acquire name {name}")

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

    def test_failed_promotion_recovers_and_verifies_old_pair(self):
        transaction = transaction_module.Transaction(
            transaction_module.load_manifest(self.manifest, "promote"),
            self.root,
            self.manifest,
        )
        original_install = transaction_module.Transaction.install_files
        failed = False

        def fail_candidate_install(active, rows):
            nonlocal failed
            if rows is active.candidate_files and not failed:
                failed = True
                raise transaction_module.TransactionError("injected candidate install failure")
            return original_install(active, rows)

        with patch.object(transaction_module.Transaction, "install_files", fail_candidate_install):
            with self.assertRaisesRegex(transaction_module.TransactionError, "injected candidate"):
                transaction.promote()
        self.assertTrue(failed)
        self.assert_live(self.old_commit, "old")
        self.assertEqual(
            (self.stage / "transaction-state").read_text().strip(), "old-live-recovered"
        )

    def test_direct_reinstall_requires_exact_old_live_state(self):
        completed = self.action_result("reinstall")
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn("transaction state is unavailable or invalid", completed.stderr)
        self.assert_live(self.old_commit, "old")

    def test_reinstall_revalidates_retained_admission(self):
        self.action("promote")
        self.action("rollback")
        payload = self.release_payload()
        payload["lifecycleAdmission"]["state"] = "LIVE"
        self.write_release(payload)
        completed = self.action_result("reinstall")
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn("state must be RELEASE_CANDIDATE", completed.stderr)
        self.assert_live(self.old_commit, "old")

    def test_reinstall_rejects_changed_retained_evidence(self):
        self.action("promote")
        self.action("rollback")
        self.release_manifest.write_text(
            self.release_manifest.read_text(encoding="utf-8") + " ", encoding="utf-8"
        )
        completed = self.action_result("reinstall")
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn("SHA-256 does not match", completed.stderr)
        self.assert_live(self.old_commit, "old")

    def test_direct_v2_rollback_requires_new_live_state(self):
        self.action("promote")
        (self.stage / "transaction-state").unlink()
        completed = self.action_result("rollback")
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn("transaction state is unavailable or invalid", completed.stderr)
        self.assert_live(self.new_commit, "new")

    def test_v2_rollback_rejects_arbitrary_transaction_state(self):
        self.action("promote")
        (self.stage / "transaction-state").write_text("caller-authored\n", encoding="utf-8")
        completed = self.action_result("rollback")
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn("transaction state must be exactly new-live", completed.stderr)
        self.assert_live(self.new_commit, "new")

    def test_v2_rollback_rejects_live_pair_outside_retained_lineage(self):
        self.action("promote")
        payload = self.transaction_payload()
        payload["newPair"]["o2Commit"] = self.old_commit
        payload["newPair"]["o2Tree"] = self.old_tree
        self.write_transaction(payload)
        completed = self.action_result("rollback")
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn("live new pair O2 commit does not match", completed.stderr)
        self.assert_live(self.new_commit, "new")

    def test_v2_rollback_rejects_changed_retained_release_evidence(self):
        self.action("promote")
        self.release_manifest.write_text(
            self.release_manifest.read_text(encoding="utf-8") + " ", encoding="utf-8"
        )
        completed = self.action_result("rollback")
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn("SHA-256 does not match", completed.stderr)
        self.assert_live(self.new_commit, "new")

    def test_fresh_swapped_v2_rollback_with_invalid_admission_fails(self):
        payload = self.transaction_payload()
        payload["oldPair"] = {
            "o2Commit": self.new_commit,
            "o2Tree": self.new_tree,
            "binarySha256": digest(self.candidate_files["binary"]),
        }
        payload["newPair"] = {
            "o2Commit": self.old_commit,
            "o2Tree": self.old_tree,
            "radcontrolSourceSha": self.old_radcontrol_sha,
            "radcontrolSourceTree": self.old_radcontrol_tree,
            "binarySha256": digest(self.rollback_files["binary"]),
        }
        self.write_transaction(payload)
        os.replace(self.candidate_o2, self.stage / "old-parked-o2")
        (self.stage / "transaction-state").write_text("new-live\n", encoding="utf-8")
        release = self.release_payload()
        release["lifecycleAdmission"]["state"] = "LIVE"
        self.write_release(release)
        completed = self.action_result("rollback")
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn("binary identity conflicts with the transaction pair", completed.stderr)
        self.assert_live(self.old_commit, "old")

    def test_schema_v1_is_recovery_only(self):
        self.convert_to_v1()
        for action in ("preflight", "promote", "reinstall"):
            with self.subTest(action=action):
                completed = self.action_result(action)
                self.assertNotEqual(completed.returncode, 0)
                self.assertIn("recovery-only and supports only rollback", completed.stderr)

    def test_fresh_fabricated_v1_rollback_without_historical_state_fails(self):
        self.convert_to_v1()
        completed = self.action_result("rollback")
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn("transaction state is unavailable or invalid", completed.stderr)
        self.assert_live(self.old_commit, "old")

    def test_swapped_v1_rollback_without_retained_final_cycle_fails(self):
        payload = self.transaction_payload()
        payload["schemaVersion"] = 1
        payload["processName"] = "radcontrol-app"
        payload["oldPair"] = {"o2Commit": self.new_commit, "o2Tree": self.new_tree}
        payload["newPair"] = {"o2Commit": self.old_commit, "o2Tree": self.old_tree}
        self.write_transaction(payload)
        (self.stage / "transaction-state").write_text("new-live-final\n", encoding="utf-8")
        completed = self.action_result("rollback")
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn("retained final-cycle stage layout", completed.stderr)
        self.assert_live(self.old_commit, "old")

    def test_schema_v1_rolls_back_an_existing_new_live_pair(self):
        self.action("promote")
        self.action("rollback")
        self.action("reinstall")
        self.convert_to_v1()
        self.action("rollback")
        self.assert_live(self.old_commit, "old")
        self.assertEqual((self.stage / "transaction-state").read_text().strip(), "old-live")

    def test_running_transaction_fixture_blocks_preflight_even_with_poisoned_path(self):
        fake_bin = self.root / "fake-bin"
        fake_bin.mkdir()
        fake_pgrep = fake_bin / "pgrep"
        fake_pgrep.write_text("#!/bin/sh\nexit 1\n", encoding="utf-8")
        fake_pgrep.chmod(0o755)
        process = self.start_named_process("radcontrol-test")
        try:
            environment = dict(os.environ)
            environment["PATH"] = f"{fake_bin}:{environment.get('PATH', '')}"
            completed = self.action_result("preflight", environment=environment)
            self.assertNotEqual(completed.returncode, 0)
            self.assertIn("radcontrol-test is running", completed.stderr)
            self.assert_live(self.old_commit, "old")
        finally:
            process.terminate()
            process.wait(timeout=3)

    def test_schema_v2_rejects_manifest_controlled_process_name(self):
        self.assertEqual(transaction_module.PRODUCTION_PROCESS_NAME, "radcontrol-app")
        payload = self.transaction_payload()
        payload["processName"] = "caller-selected-name"
        self.write_transaction(payload)
        completed = self.action_result("preflight")
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn("unexpected top-level shape", completed.stderr)

    def test_unrelated_process_name_does_not_block_preflight(self):
        process = self.start_named_process("unrelated-test")
        try:
            completed = self.action_result("preflight")
            self.assertEqual(completed.returncode, 0, completed.stderr)
        finally:
            process.terminate()
            process.wait(timeout=3)

    def test_preflight_accepts_semantic_artifact_filename_in_internal_binary_slot(self):
        self.assertEqual(transaction_module.PRODUCTION_ARTIFACT_FILENAME, "radcontrol-app")
        self.assertEqual(self.release_payload()["artifact"]["filename"], "radcontrol-app")
        self.assertEqual(self.candidate_files["binary"].name, "binary")
        completed = self.action_result("preflight")
        self.assertEqual(completed.returncode, 0, completed.stderr)

    def test_preflight_rejects_internal_staging_slot_as_artifact_filename(self):
        payload = self.release_payload()
        payload["artifact"]["filename"] = "binary"
        self.write_release(payload)
        completed = self.preflight_result()
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn("release manifest artifact filename mismatch", completed.stderr)

    def test_preflight_rejects_wrong_semantic_artifact_filename(self):
        payload = self.release_payload()
        payload["artifact"]["filename"] = "radcontrol-app-wrong"
        self.write_release(payload)
        completed = self.preflight_result()
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn("release manifest artifact filename mismatch", completed.stderr)

    def test_preflight_rejects_wrong_staged_binary_digest(self):
        self.candidate_files["binary"].write_text("wrong-staged-binary\n", encoding="utf-8")
        staged_digest = digest(self.candidate_files["binary"])
        transaction = self.transaction_payload()
        transaction["stage"]["candidateFiles"]["binary"]["sha256"] = staged_digest
        transaction["newPair"]["binarySha256"] = staged_digest
        self.write_transaction(transaction)
        completed = self.preflight_result()
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn("release artifact SHA-256 mismatch", completed.stderr)

    def test_trusted_git_ignores_replace_refs_and_ambient_configuration(self):
        run("git", "replace", self.new_commit, self.old_commit, cwd=self.primary)
        environment = dict(os.environ)
        environment.update(
            {
                "GIT_DIR": str(self.primary / ".git/invalid"),
                "GIT_WORK_TREE": str(self.root / "invalid"),
                "GIT_CONFIG_COUNT": "1",
                "GIT_CONFIG_KEY_0": "core.repositoryformatversion",
                "GIT_CONFIG_VALUE_0": "999",
            }
        )
        completed = self.action_result("preflight", environment=environment)
        self.assertEqual(completed.returncode, 0, completed.stderr)

    def test_schema_v2_rejects_removed_old_pair_duplicates(self):
        payload = self.transaction_payload()
        payload["oldPair"]["radcontrolSourceSha"] = self.old_radcontrol_sha
        payload["oldPair"]["radcontrolSourceTree"] = self.old_radcontrol_tree
        self.write_transaction(payload)
        completed = self.preflight_result()
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn("unexpected identity shape", completed.stderr)

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

    def test_semantic_invalid_matrix_rejects_all_twenty_cases(self):
        original = self.release_payload()
        mutations = (
            ("missing release schema", lambda value: value.pop("schema")),
            ("unsupported release schema", lambda value: value.__setitem__("schema", "radcontrol-release-candidate/v1")),
            ("missing admission", lambda value: value.pop("lifecycleAdmission")),
            ("wrong lifecycle state", lambda value: value["lifecycleAdmission"].__setitem__("state", "LIVE")),
            ("wrong prior lifecycle state", lambda value: value["lifecycleAdmission"].__setitem__("admittedFrom", "SOURCE_ACCEPTED")),
            ("wrong review state", lambda value: value["lifecycleAdmission"]["reviewEvidence"].__setitem__("state", "SOURCE_CANDIDATE")),
            ("missing O2 SHA", lambda value: value.pop("compatibleO2SourceSha")),
            ("O2 SHA mismatch", lambda value: value.__setitem__("compatibleO2SourceSha", "9" * 40)),
            ("O2 tree mismatch", lambda value: value["lifecycleAdmission"]["publicationEvidence"]["o2Source"].__setitem__("protectedTree", "9" * 40)),
            ("missing RadControl SHA", lambda value: value.pop("radcontrolSourceSha")),
            ("RadControl SHA mismatch", lambda value: value.__setitem__("radcontrolSourceSha", "9" * 40)),
            ("review/publication conflict", lambda value: value["lifecycleAdmission"]["reviewEvidence"]["radcontrolSource"].__setitem__("commit", "9" * 40)),
            ("missing artifact digest", lambda value: value["artifact"].pop("sha256")),
            ("artifact digest mismatch", lambda value: value["artifact"].__setitem__("sha256", "9" * 64)),
            ("admitted artifact mismatch", lambda value: value["lifecycleAdmission"].__setitem__("artifactSha256", "9" * 64)),
            ("missing workflow correlation", lambda value: value["lifecycleAdmission"].pop("workflowCorrelation")),
            ("malformed workflow correlation", lambda value: value["lifecycleAdmission"]["workflowCorrelation"].__setitem__("runId", "0")),
            ("workflow source mismatch", lambda value: value["lifecycleAdmission"]["workflowCorrelation"].__setitem__("sourceCommit", "9" * 40)),
            ("O2 review/publication conflict", lambda value: value["lifecycleAdmission"]["reviewEvidence"]["o2Source"].__setitem__("tree", "9" * 40)),
            ("compatibility digest mismatch", lambda value: value["lifecycleAdmission"].__setitem__("compatibilitySha256", "9" * 64)),
        )
        self.assertEqual(len(mutations), 20)
        for label, mutate in mutations:
            with self.subTest(label=label):
                payload = json.loads(json.dumps(original))
                mutate(payload)
                self.write_release(payload)
                completed = self.preflight_result()
                self.assertNotEqual(completed.returncode, 0, label)
        self.write_release(original)

    def test_preflight_rejects_cross_boundary_identity_conflicts(self):
        mutations = (
            ("O2 source", lambda payload: payload.__setitem__("compatibleO2SourceSha", "9" * 40)),
            ("RadControl source", lambda payload: payload.__setitem__("radcontrolSourceSha", "9" * 40)),
            ("artifact", lambda payload: payload["artifact"].__setitem__("sha256", "9" * 64)),
            ("workflow", lambda payload: payload["lifecycleAdmission"]["workflowCorrelation"].__setitem__("fileSha256", "9" * 64)),
            ("compatibility", lambda payload: payload["lifecycleAdmission"].__setitem__("compatibilitySha256", "9" * 64)),
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

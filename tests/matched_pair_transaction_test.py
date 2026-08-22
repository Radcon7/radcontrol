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
        (self.primary / "identity.txt").write_text("new\n", encoding="utf-8")
        run("git", "add", ".", cwd=self.primary)
        run("git", "commit", "-qm", "new", cwd=self.primary)
        self.new_commit = run("git", "rev-parse", "HEAD", cwd=self.primary)
        self.new_tree = run("git", "rev-parse", "HEAD^{tree}", cwd=self.primary)

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
        evidence = self.stage / "evidence" / "release-manifest.json"
        evidence.parent.mkdir()
        evidence.write_text('{"fixture":true}\n', encoding="utf-8")

        manifest = {
            "schemaVersion": 1,
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
                "evidence": [{"path": str(evidence), "sha256": digest(evidence)}],
            },
            "oldPair": {"o2Commit": self.old_commit, "o2Tree": self.old_tree},
            "newPair": {"o2Commit": self.new_commit, "o2Tree": self.new_tree},
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


if __name__ == "__main__":
    unittest.main()

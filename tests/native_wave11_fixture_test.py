import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

class NativeFixtureTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="radcontrol-tauri-e2e-")
        self.root = Path(self.temp.name) / "o2"
        (self.root / "scripts").mkdir(parents=True)
        shutil.copyfile(Path(__file__).with_name("native_wave11_fixture.py"), self.root / "scripts/native_wave11_fixture.py")
        (self.root / "scripts/run_o2.actual.sh").write_text('echo reached >> "$(dirname "$0")/real-dispatcher-called"\necho "{}"\n')
    def tearDown(self):
        self.temp.cleanup()
    def call(self, verb, phase):
        (self.root / "wave11-fixture.json").write_text(json.dumps({"phase":phase}))
        return subprocess.run(["python3",str(self.root / "scripts/native_wave11_fixture.py"),verb],capture_output=True,text=True)
    def test_preview_cancel_and_confirmation_are_simulated_only(self):
        for phase, ok, next_phase in [("actionable",True,"healthy"),("multiple",True,"remaining"),("failure",False,"failed")]:
            preview=self.call("workstation.cleanup.pop_upgrade.preview",phase)
            self.assertTrue(json.loads(preview.stdout)["requiresOsAuthorization"])
            self.assertEqual(json.loads((self.root / "wave11-fixture.json").read_text())["phase"],phase)
            applied=self.call("workstation.cleanup.pop_upgrade.apply",phase)
            self.assertEqual(json.loads(applied.stdout)["ok"],ok)
            self.assertEqual(json.loads((self.root / "wave11-fixture.json").read_text())["phase"],next_phase)
        self.assertFalse((self.root / "scripts/real-dispatcher-called").exists())
    def test_unrelated_or_privileged_mutations_never_reach_real_dispatcher(self):
        for verb in ["sentinel.host.automation.configure", "sentinel.host.deep_check", "empire.todo.save", "files.write", "systemctl", "sudo", "project.create", "host.maintenance.pop-upgrade-self-heal"]:
            result=self.call(verb,"healthy")
            self.assertNotEqual(result.returncode,0)
            self.assertFalse(json.loads(result.stdout)["ok"])
        self.assertFalse((self.root / "scripts/real-dispatcher-called").exists())
    def test_audit_is_retained_in_the_fixture_dispatcher(self):
        self.assertEqual(self.call("radcontrol.audit.append.stdin","healthy").returncode,0)
        self.assertTrue((self.root / "scripts/real-dispatcher-called").exists())
    def test_read_only_fallback_is_explicit(self):
        self.assertEqual(self.call("contract_info","healthy").returncode,0)
        self.assertTrue((self.root / "scripts/real-dispatcher-called").exists())

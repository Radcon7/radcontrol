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
    def test_fan_fixture_requires_explicit_test_owned_identity_and_never_falls_through(self):
        missing = self.call("sentinel.host.explain_fans", "healthy")
        self.assertNotEqual(missing.returncode, 0)
        self.assertFalse(json.loads(missing.stdout)["ok"])
        (self.root / "wave11-current.json").write_text(json.dumps({"metrics": {"cpu": {"status": "unknown"}}}))
        (self.root / "wave11-fixture.json").write_text(json.dumps({"phase": "healthy", "fanFixture": "ordered-1"}))
        present = subprocess.run(["python3", str(self.root / "scripts/native_wave11_fixture.py"), "sentinel.host.explain_fans"], capture_output=True, text=True)
        self.assertEqual(present.returncode, 0)
        result = json.loads(present.stdout)
        self.assertEqual(result["explanation"], "Native fan fixture ordered-1")
        self.assertEqual(result["report"]["metrics"]["cpu"]["status"], "healthy")
        self.assertFalse((self.root / "scripts/real-dispatcher-called").exists())

    def test_denial_retains_prior_observation_and_condition_inputs(self):
        # Record inputs, not a second implementation of O2 health semantics.
        # Canonical O2 projections are exercised by the complete native suite.
        (self.root / 'scripts/o2_sentinel_episodes.py').write_text(
            'def episode_projection(events, policy): return {"events": events}\n'
            'def operator_projection(metrics, findings, policy, **kwargs):\n'
            ' return {"metrics": metrics, "findings": findings, **kwargs}\n')
        (self.root / 'scripts/o2_sentinel_updater_watch.py').write_text(
            'def incident_projection(state, **kwargs): return state\n')
        (self.root / 'registry').mkdir()
        (self.root / 'registry/sentinel-policy.json').write_text('{}')
        metrics = {key: {'status': 'healthy', 'value': {}} for key in ['cpu', 'load', 'thermal', 'memory', 'filesystem']}
        (self.root / 'wave11-current.json').write_text(json.dumps({'metrics': metrics}))
        (self.root / 'wave11-status.json').write_text(json.dumps({
            'host': {}, 'knownIncidentState': {}, 'privilegedBoundary': {}, 'auditVerification': {}, 'capabilities': []}))
        (self.root / 'wave11-fixture.json').write_text(json.dumps({'phase': 'failure'}))
        def invoke(verb):
            response = subprocess.run(['python3', str(self.root / 'scripts/native_wave11_fixture.py'), verb], capture_output=True, text=True)
            self.assertEqual(response.returncode, 0, response.stderr)
            return json.loads(response.stdout)
        before = invoke('sentinel.status')
        observation = before['recentHostObservations']
        self.assertEqual(len(observation), 1)
        before_current = invoke('sentinel.host.current')
        applied = invoke('workstation.cleanup.pop_upgrade.apply')
        self.assertFalse(applied['ok'])
        self.assertFalse(applied['actions'][0]['actionOccurred'])
        self.assertEqual(applied['error'], 'Fixture authorization declined')
        invoke('sentinel.host.check')
        after = invoke('sentinel.status')
        current = invoke('sentinel.host.current')
        self.assertEqual(after['recentHostObservations'], observation, 'denial cannot create, clear, or rewrite an observation')
        self.assertTrue(after['knownIncidentState']['active'])
        self.assertTrue(after['knownIncidentState']['repairNeedsOperator'])
        self.assertEqual([f['key'] for f in after['host']['findings']], ['knownIncident'])
        self.assertEqual(after['updaterWorkflow']['repairReason'], applied['error'])
        self.assertFalse(after['updaterWorkflow']['lastActionOccurred'])
        self.assertTrue(current['interpretation']['known_state']['active'])
        self.assertEqual(current['interpretation']['retained'], before_current['interpretation']['retained'])
        self.assertNotIn('knownIncident', current['metrics'], 'foreground must not invent a new updater observation')
        self.assertFalse((self.root / 'scripts/real-dispatcher-called').exists())

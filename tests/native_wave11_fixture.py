"""Deterministic responses for the test-owned native O2 fixture only.

Installed by native_wave11_acceptance.mjs after assertWritableFixtureIsolation.
No privileged helper, service, provider, or real repair is called here.
"""
import datetime
import json
import os
from pathlib import Path
import sys

scripts = Path(__file__).resolve().parent
root = scripts.parent
assert root.parent.name.startswith("radcontrol-tauri-e2e-")
assert (root / "wave11-fixture.json").is_file()
verb = sys.argv[1]
intercepted = {
    "sentinel.status", "sentinel.host.current", "sentinel.host.check",
    "workstation.cleanup.pop_upgrade.preview", "workstation.cleanup.pop_upgrade.apply",
}
if verb not in intercepted:
    os.execv("/bin/bash", ["bash", str(scripts / "run_o2.actual.sh"), *sys.argv[1:]])
state_path = root / "wave11-fixture.json"
state = json.loads(state_path.read_text())
phase = state["phase"]
with (root / "wave11-calls.jsonl").open("a") as handle:
    handle.write(json.dumps({"verb": verb, "phase": phase}) + "\n")
now = datetime.datetime.now(datetime.timezone.utc).isoformat()
updater = phase in {"actionable", "multiple", "failure", "invalid-preview"}
hot = phase in {"nonactionable", "multiple", "remaining"}
zombie = phase in {"multiple", "remaining"}
if verb == "workstation.cleanup.pop_upgrade.preview":
    result = {"ok": True, "candidate": {"id": "service:pop-upgrade.service", "service": "pop-upgrade.service"},
              "requiresOperatorConfirmation": True, "requiresOsAuthorization": phase != "invalid-preview"}
elif verb == "workstation.cleanup.pop_upgrade.apply":
    failed = phase == "failure"
    state["phase"] = "failed" if failed else "remaining" if phase == "multiple" else "healthy"
    state_path.write_text(json.dumps(state))
    result = {"ok": not failed, "actions": [{"actionOccurred": not failed}], "error": "Fixture authorization declined" if failed else None}
elif verb == "sentinel.host.check":
    result = {"ok": True, "guardian": "host"}
else:
    result = json.loads((root / ("wave11-status.json" if verb == "sentinel.status" else "wave11-current.json")).read_text())
    result["ok"] = True
    current = json.loads((root / "wave11-current.json").read_text())
    metrics = current["metrics"]
    for metric in metrics.values():
        metric.update(status="healthy", measuredAt=now, reason="Fixture measurement normal")
    metrics["thermal"].update(status="attention" if hot else "healthy", reason="CPU temperature 96°C needs investigation" if hot else "CPU temperature 60°C")
    metrics["thermal"]["value"] = [{"primary": True, "temperatureC": 96 if hot else 60, "label": "CPU", "source": "fixture", "status": "attention" if hot else "healthy"}]
    if verb == "sentinel.host.current":
        result.update(metrics=metrics, measuredAt=now)
    else:
        findings = []
        if updater:
            findings.append({"key": "knownIncident", "findingKey": "metric:knownIncident", "status": "attention", "reason": "Known pop-upgrade.service runaway signature", "repairCapability": "workstation.cleanup.pop_upgrade.preview"})
        if zombie:
            findings.append({"key": "projectRuntimes", "findingKey": "metric:projectRuntimes", "status": "attention", "reason": "Zombie process parent needs investigation"})
        result["host"].update(findings=findings, metrics=metrics, overallStatus="attention" if hot or updater or zombie else "healthy", checkedAt=now)
        result["recentHostObservations"] = []
        result["recentIncidents"] = []
        result["knownIncidentState"].update(active=updater, repairNeedsOperator=phase == "failed", midScanNeedsOperator=False)
        result["privilegedBoundary"].update(ready=True)
        result["auditVerification"].update(ok=True)
        result["capabilities"] = [row for row in result["capabilities"] if row["key"] != "host.maintenance.pop-upgrade-self-heal"] + [{
            "key": "host.maintenance.pop-upgrade-self-heal", "label": "Fixture exact updater repair", "level": 1,
            "mutating": True, "implemented": True, "dryRunOnly": False,
            "targetScope": ["pop-upgrade.service"], "argumentKeys": [],
        }]
print(json.dumps(result))

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
    "sentinel.status", "sentinel.host.current", "sentinel.host.check", "empire.todo.list", "operator.work.list",
    "sentinel.host.explain_fans",
    "workstation.cleanup.pop_upgrade.preview", "workstation.cleanup.pop_upgrade.apply",
}
# Fail closed: an accidental fixture click must never fall through to a real
# mutation, service command, provider operation or privileged helper.
read_only = {"contract_info", "list_projects", "radcontrol.runtime_status", "empire.operations.status", "radcontrol.golden_state", "router.health"}
# The bridge must still audit synthetic preview/apply in this private O2 root.
fixture_writes = {"radcontrol.audit.append.stdin"}
if verb == "sentinel.host.deep_check" and json.loads((root / "wave11-fixture.json").read_text()).get("phase") == "diagnosis":
    intercepted.add(verb)
if verb not in intercepted:
    if verb not in fixture_writes and verb not in read_only and not verb.startswith(("files.read.", "files.list.")):
        print(json.dumps({"ok": False, "error": "Native fixture denied non-read operation", "verb": verb}))
        sys.exit(1)
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
if verb == "sentinel.host.explain_fans":
    token = state.get("fanFixture")
    if not isinstance(token, str) or not token.startswith("ordered-"):
        print(json.dumps({"ok": False, "error": "Test-owned fan fixture absent"}))
        sys.exit(1)
    metrics = json.loads((root / "wave11-current.json").read_text())["metrics"]
    for metric in metrics.values():
        metric.update(status="healthy", measuredAt=now, reason="Synthetic fan observation")
    result = {"ok": True, "explanation": "Native fan fixture " + token,
              "report": {"ok": True, "guardian": "host", "metrics": metrics}}
elif verb == "empire.todo.list":
    result = json.loads((root / "wave11-tasks.json").read_text())
elif verb == "operator.work.list":
    tasks = json.loads((root / "wave11-tasks.json").read_text())
    result = {"ok": True, "authority": "private", "revision": tasks.get("revision", 1),
              "data": {"tasks": tasks["items"], "events": [], "initiatives": [], "projectNotes": []}}
elif verb == "workstation.cleanup.pop_upgrade.preview":
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
    if verb in {"sentinel.host.current", "sentinel.host.deep_check"}:
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
if verb in {"sentinel.status", "sentinel.host.current", "sentinel.host.deep_check"}:
    # Exercise the actual O2-owned semantics over synthetic evidence, not a copied UI rule engine.
    from o2_sentinel_episodes import episode_projection, operator_projection
    import copy
    policy = json.loads((root / "registry/sentinel-policy.json").read_text())
    synthetic = copy.deepcopy(metrics)
    for entry in synthetic.values():
        entry["observedAt"] = now
    synthetic["services"] = {"status": "healthy", "value": [], "observedAt": now}
    synthetic["processes"] = {"status": "healthy", "value": [{"process": "fixture-worker", "pid": 321, "cpuPercent": 2}], "observedAt": now}
    synthetic["projectRuntimes"] = {"status": "healthy", "value": {"zombies": {"count": 0, "parents": []}, "staleTestBrowsers": []}, "observedAt": now}
    synthetic["knownIncident"] = {"status": "attention" if updater else "healthy", "value": {"detected": updater}, "observedAt": now}
    fs = []
    if updater:
        fs.append({"kind": "knownIncident", "key": "knownIncident", "findingKey": "metric:knownIncident", "title": "Updater service needs recovery", "status": "attention", "reason": "Exact synthetic updater candidate", "repairCapability": "workstation.cleanup.pop_upgrade.preview"})
    if hot:
        fs.append({"kind": "thermal", "key": "thermal", "findingKey": "metric:thermal", "title": "CPU unusually hot", "status": "attention", "reason": "CPU 96°C"})
    if zombie or phase == "zombie":
        synthetic["projectRuntimes"]["value"]["zombies"] = {"count": 1, "parents": [{"pid": 101, "process": "fixture-parent", "count": 1}]}
        fs.append({"kind": "zombie-process", "key": "projectRuntimes", "findingKey": "runtime:zombies:101", "title": "Zombie process", "status": "attention", "reason": "Synthetic zombie parent evidence"})
    def scan(index, values, findings):
        stamp = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=30-index*5)).isoformat()
        values = copy.deepcopy(values)
        for entry in values.values(): entry["observedAt"] = stamp
        return {"id": "fixture-episode-" + str(index), "guardian": "host", "timestamp": stamp, "type": "host.health-check", "source": "fixture", "severity": "attention" if findings else "informational", "observedValues": {"scanKind": "full", "findings": findings, "snapshot": {"metrics": values}}}
    events = [scan(0, synthetic, fs)] if fs else []
    if phase in {"watching", "recurrent", "diagnosis"}:
        warm = copy.deepcopy(synthetic);warm["thermal"]["value"][0]["temperatureC"] = 102;warm["thermal"]["status"] = "attention"
        thermal_finding = {"kind": "thermal", "key": "thermal", "findingKey": "metric:thermal", "title": "Thermal activity", "status": "attention", "reason": "Synthetic CPU 102°C"}
        events = [scan(0, warm, [thermal_finding]), scan(1, synthetic, [])]
        if phase == "recurrent": events += [scan(2, warm, [thermal_finding]), scan(3, synthetic, [])]
    elif phase == "zombie":
        events.append(scan(1, synthetic, fs))
    if phase == "unknown": synthetic["thermal"] = {"status": "unavailable", "value": None, "observedAt": now}
    projection = episode_projection(events, policy)
    interpretation = operator_projection(synthetic, fs, policy, retained=projection, current=verb == "sentinel.host.current", known_state={"repairNeedsOperator": phase == "failed"})
    if verb == "sentinel.status":
        result["episodeProjection"] = projection
        result["recentHostObservations"] = list(reversed(events))
        result["host"].update(metrics=synthetic, interpretation=interpretation)
    elif verb == "sentinel.host.deep_check":
        result = {"ok": True, "guardian": "host", "checkedAt": now, "eventId": "fixture-diagnosis", "scanKind": "full", "scanDurationMs": 1234, "metrics": synthetic, "interpretation": interpretation}
    else:
        # Foreground intentionally omits processes. The completed context must survive this read.
        foreground = {key: value for key, value in synthetic.items() if key not in {"processes", "projectRuntimes", "knownIncident"}}
        result.update(metrics=foreground, measuredAt=now, interpretation=operator_projection(foreground, [f for f in fs if f["key"] == "thermal"], policy, retained=projection, current=True, known_state={"repairNeedsOperator": phase == "failed"}))
print(json.dumps(result))

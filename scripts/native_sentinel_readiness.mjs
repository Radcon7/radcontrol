import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function seedSentinelReadiness(fixture) {
  const script = path.join(fixture.o2Root, 'scripts/o2_sentinel.py');
  const original = await readFile(script, 'utf8');
  const fixtureOnly = `
# Isolated native acceptance injection; copied fixture only, never an installed runtime.
_native_status = sentinel_status
_native_scenario_path = O2_ROOT / 'sentinel-native-scenario.json'
def _native_scenario():
    return json.loads(_native_scenario_path.read_text())
def sentinel_status():
    scenario = _native_scenario()
    if scenario.get('fail'): raise GovernanceError('Fixture refresh failure')
    value = _native_status()
    value['knownIncidentState'] = {'active':False,'repairNeedsOperator':True,'resolvedAt':'2026-10-02T12:00:00Z'}
    value['updaterWorkflow'] = incident_projection(value['knownIncidentState'], now=utc_now())
    value['privilegedBoundary'] = {'ready': True}
    value['automaticRepairReadiness'] = repair_readiness({'ready':True},value['knownIncidentState'],{'active':True},True)
    value['notificationSuppression'] = {'state':'active','scope':'User release notifications only; updater daemon and security updates are not masked.'}
    return value

def current_host_measurements():
    scenario = _native_scenario()
    if scenario.get('fail'): raise GovernanceError('Fixture refresh failure')
    stamp=utc_now()
    temp=scenario.get('temperature',99)
    metrics={
      'thermal':observation('attention' if temp >= 90 else 'healthy',[{'primary':True,'source':'hwmon','chip':'coretemp','key':'pkg','label':'Package id 0','temperatureC':temp,'criticalC':100}],'Isolated fixture'),
      'fans':observation('healthy',[{'chip':'system76_acpi','label':'CPU fan','rpm':0}],'Numeric zero fixture'),
      'cpu':observation('healthy',{'utilizationPercent':8},'Isolated fixture'),
      'load':observation('healthy',{'oneMinute':1,'fiveMinute':0.8},'Isolated fixture'),
      'memory':observation('healthy',{},'Isolated fixture'),
      'filesystem':observation('healthy',{},'Isolated fixture'),
      'services':observation('healthy',[],'Isolated fixture'),
    }
    interpretation=operator_projection(metrics,host_findings(metrics,[],metric_overall(metrics,[])),load_policy(),current=True)
    return {'ok':True,'guardian':'host','measuredAt':stamp,'metrics':metrics,'summary':summarize_host_measurements(metrics),
      'interpretation':interpretation,'persisted':False,'llmUsed':False,'source':'foreground-read-only',
      'updater':{'state':'inactive','pid':None,'activity':'No updater process or bus owner observed.','observedAt':stamp,'nonactivating':True}}
`;
  assert.equal(original.split('if __name__ == "__main__":').length, 2);
  await writeFile(script, original.replace('if __name__ == "__main__":', fixtureOnly + '\nif __name__ == "__main__":'));
  await writeFile(path.join(fixture.o2Root, 'sentinel-native-scenario.json'), JSON.stringify({ temperature: 99 }));
}

export async function assertSentinelReadiness({ fixture, base, sessionId, request, click, eventually }) {
  const exec = (script, args = []) => request(base, `/session/${sessionId}/execute/sync`, 'POST', { script, args });
  const text = selector => exec('return document.querySelector(arguments[0])?.innerText || "";', [selector]);
  const refresh = () => exec('document.dispatchEvent(new Event("visibilitychange"));');
  const scenario = value => writeFile(path.join(fixture.o2Root, 'sentinel-native-scenario.json'), JSON.stringify(value));
  await click(base, sessionId, '[data-testid="tab-sentinel"]');
  await eventually(async () => {
    assert.match(await text('[data-testid="sentinel-updater-current"]'), /Current updater: inactive/);
    assert.match(await text('[data-testid="sentinel-current-now"]'), /NEEDS ATTENTION/);
    assert.match(await text('[data-testid="sentinel-repair-readiness"]'), /blocked[\s\S]*administrator reconciliation[\s\S]*PARTIAL/);
    assert.match(await text('[data-testid="sentinel-updater-workflow"]'), /HISTORICAL RECOVERY[\s\S]*does not establish a current updater runaway/);
    assert.match(await text('[data-testid="sentinel-notification-suppression"]'), /active[\s\S]*security updates are not masked/);
  }, 'inactive updater, separate heat, historical block, notification mask');
  const evidence = [];
  evidence.push({ scenario: 'hot-inactive-blocked', text: await text('[data-testid="sentinel-status-header"]') });
  await scenario({ temperature: 65 }); await refresh();
  await eventually(async () => {
    assert.match(await text('[data-testid="sentinel-current-now"]'), /HEALTHY/);
    assert.match(await text('[data-testid="sentinel-repair-readiness"]'), /blocked/);
  }, 'healthy current measurements do not clear historical readiness block');
  evidence.push({ scenario: 'cool-inactive-blocked', text: await text('[data-testid="sentinel-status-header"]') });
  await scenario({ fail: true }); await refresh();
  await eventually(async () => {
    assert.match(await text('[data-testid="sentinel-current-now"]'), /UNKNOWN[\s\S]*STALE[\s\S]*count unknown/);
    assert.doesNotMatch(await text('[data-testid="sentinel-current-now"]'), /no automatic action needed/);
    assert.match(await text('[data-testid="sentinel-repair-readiness"]'), /unknown.*refresh failed[\s\S]*administrator reconciliation/);
    assert.match(await text('[data-testid="sentinel-updater-workflow"]'), /HISTORICAL RECOVERY/);
  }, 'refresh failure retains prior evidence while current health becomes unknown');
  evidence.push({ scenario: 'refresh-failed', text: await text('[data-testid="sentinel-status-header"]') });
  const output = process.env.RADCONTROL_E2E_SCREENSHOT_PATH;
  if (output) {
    await writeFile(`${output}.readiness.json`, JSON.stringify(evidence, null, 2));
    await writeFile(`${output}.readiness.png`, Buffer.from(await request(base, `/session/${sessionId}/screenshot`), 'base64'));
  }
  console.error('[e2e] passed: Sentinel current heat / inactive updater / historical readiness block / notification masks / refresh failure');
}

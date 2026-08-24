import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  INSTALLED_O2_ROOT,
  INSTALLED_RADCONTROL_APP,
  assertInstalledO2Unchanged,
  assertNoNewTcpListeners,
  assertPortAbsent,
  assertProcessNotRunning,
  createBubblewrapApplication,
  sha256File,
  snapshotInstalledO2,
  tcpListeners,
} from "./native_acceptance_lib.mjs";

function requiredArgument(name) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : "";
  if (!value || value.startsWith("--")) throw new Error(`${name} is required`);
  return value;
}

const app = process.env.RADCONTROL_ACCEPTANCE_APP || INSTALLED_RADCONTROL_APP;
const expectedO2Sha = requiredArgument("--expected-o2-sha");
const expectedRadcontrolSha = requiredArgument("--expected-radcontrol-sha");
const expectedArtifactSha = requiredArgument("--expected-artifact-sha");
assert.match(expectedO2Sha, /^[a-f0-9]{40}$/, "--expected-o2-sha must be a full lowercase Git SHA");
assert.match(expectedRadcontrolSha, /^[a-f0-9]{40}$/, "--expected-radcontrol-sha must be a full lowercase Git SHA");
assert.match(expectedArtifactSha, /^[a-f0-9]{64}$/, "--expected-artifact-sha must be a full lowercase SHA-256");

function assertNativeDriver() {
  const result = spawnSync("WebKitWebDriver", ["--help"], { stdio: "ignore" });
  if (result.error || result.status !== 0) throw new Error("WebKitWebDriver is required for native acceptance");
}

async function unusedPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  await new Promise((resolve) => server.close(resolve));
  return address.port;
}

async function request(base, route, method = "GET", body) {
  const response = await fetch(`${base}${route}`, {
    signal: AbortSignal.timeout(30_000),
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.value?.error) throw new Error(`${method} ${route}: ${JSON.stringify(payload)}`);
  return payload.value;
}

async function eventually(action, description, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try { return await action(); } catch (error) { lastError = error; await delay(250); }
  }
  throw new Error(`${description}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function element(base, sessionId, selector) {
  const value = await request(base, `/session/${sessionId}/element`, "POST", { using: "css selector", value: selector });
  return value["element-6066-11e4-a52e-4f735466cecf"];
}

async function click(base, sessionId, selector) {
  await eventually(async () => {
    const id = await element(base, sessionId, selector);
    await request(base, `/session/${sessionId}/execute/sync`, "POST", {
      script: "arguments[0].scrollIntoView({ block: 'center', inline: 'center' });",
      args: [{ "element-6066-11e4-a52e-4f735466cecf": id }],
    });
    await request(base, `/session/${sessionId}/element/${id}/click`, "POST", {});
  }, `click ${selector}`);
}

async function bodyText(base, sessionId) {
  const id = await element(base, sessionId, "body");
  return request(base, `/session/${sessionId}/element/${id}/text`);
}

async function stopChild(child) {
  if (!child?.pid) return;
  try { process.kill(-child.pid, "SIGTERM"); } catch {}
  await Promise.race([once(child, "exit").catch(() => undefined), delay(3_000)]);
  try { process.kill(-child.pid, "SIGKILL"); } catch {}
}

console.error("[production-readonly] preflighting exact installed pair and listener baseline");
assertNativeDriver();
assertProcessNotRunning("radcontrol-app");
const installedBefore = await snapshotInstalledO2();
assert.equal(installedBefore.head, expectedO2Sha, "installed O2 identity does not match the accepted pair");
assert.equal(await sha256File(app), expectedArtifactSha, "production artifact SHA-256 does not match");
const listenersBefore = tcpListeners();
assertPortAbsent(listenersBefore, 1420);

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "radcontrol-production-readonly-"));
const acceptanceHome = path.join(tempRoot, "home");
const xdgCacheHome = path.join(tempRoot, "xdg-cache");
const xdgConfigHome = path.join(tempRoot, "xdg-config");
const xdgDataHome = path.join(tempRoot, "xdg-data");
const stateOverlay = path.join(tempRoot, "o2-state");
const dconfOverlay = path.join(tempRoot, "dconf");
await Promise.all([
  mkdir(acceptanceHome, { recursive: true, mode: 0o700 }),
  mkdir(xdgCacheHome, { recursive: true, mode: 0o700 }),
  mkdir(xdgConfigHome, { recursive: true, mode: 0o700 }),
  mkdir(xdgDataHome, { recursive: true, mode: 0o700 }),
  mkdir(dconfOverlay, { recursive: true, mode: 0o700 }),
  mkdir(path.join(stateOverlay, "radcontrol-runtime", "tmp"), { recursive: true, mode: 0o700 }),
]);
const sandboxedApp = await createBubblewrapApplication({
  app,
  tempRoot,
  home: acceptanceHome,
  xdgCacheHome,
  xdgConfigHome,
  xdgDataHome,
  overlays: [
    { source: stateOverlay, destination: path.join(INSTALLED_O2_ROOT, ".state") },
    { source: dconfOverlay, destination: `/run/user/${process.getuid()}/dconf` },
  ],
  environment: { RADCONTROL_ACCEPTANCE_READ_ONLY: "1" },
});

const driverPort = await unusedPort();
const nativePort = await unusedPort();
const base = `http://127.0.0.1:${driverPort}`;
const driver = spawn("tauri-driver", ["--port", String(driverPort), "--native-port", String(nativePort)], {
  stdio: ["ignore", "inherit", "inherit"],
  detached: true,
  env: process.env,
});
let sessionId;
let acceptanceError;
try {
  await eventually(() => request(base, "/status"), "start tauri-driver");
  const session = await request(base, "/session", "POST", {
    capabilities: { alwaysMatch: { browserName: "wry", "tauri:options": { application: sandboxedApp } } },
  });
  sessionId = session.sessionId;
  assert.ok(sessionId, "desktop session id is required");
  await eventually(async () => assert.match(await bodyText(base, sessionId), /RadControl[\s\S]*Projects/), "render installed RadControl");

  await click(base, sessionId, 'button[title^="Show the installed app build"]');
  const diagnostics = await eventually(async () => {
    const text = await bodyText(base, sessionId);
    assert.match(text, /READY\s*Listener-free production mode/);
    assert.match(text, /production/);
    assert.ok(text.includes(expectedO2Sha), "production diagnostics did not render the expected O2 identity");
    assert.ok(text.includes(expectedRadcontrolSha), "production diagnostics did not render the expected RadControl identity");
    assert.match(text, /Projects · 9 visible/);
    assert.match(text, /Empire To-Do · 29 durable items/);
    assert.match(text, /Infrastructure · 10 governed profiles/);
    assert.match(text, /Security \/ Radcon Sentinel/);
    return text;
  }, "render exact production runtime diagnostics");
  await click(base, sessionId, ".runtimeModalCard .btnGhost");

  await click(base, sessionId, '[data-testid="tab-notes"]');
  assert.match(await eventually(() => bodyText(base, sessionId), "render Notes"), /My Notes[\s\S]*Empire Blueprint[\s\S]*O2 Knowledge[\s\S]*Empire To-Do/);
  await click(base, sessionId, '[data-testid="notes-mode-o2_knowledge"]');
  await eventually(async () => {
    const text = await bodyText(base, sessionId);
    assert.match(text, /O2 KNOWLEDGE[\s\S]*WHAT O2 KNOWS[\s\S]*HOST-LOCAL\/NON-AUTHORITATIVE/);
    assert.match(text, /Canonical source/);
  }, "render O2 Knowledge without mutating installed O2");
  await click(base, sessionId, '[data-testid="notes-mode-empire_todo"]');
  await eventually(async () => {
    const text = await bodyText(base, sessionId);
    assert.match(text, /EMPIRE TO-DO[\s\S]*What matters now[\s\S]*1 blocked item[\s\S]*ActiveCompleted/);
    assert.match(text, /NOW[\s\S]*BUSINESS FOUNDATION[\s\S]*CONTROL PLANE[\s\S]*DQOTD LAUNCH \/ PREMIUM[\s\S]*COMMERCIAL PROOF/);
  }, "render grouped current Empire To-Do operating sequence");
  assert.match(
    await eventually(() => bodyText(base, sessionId), "read blocked Empire To-Do dependencies"),
    /Blocked[\s\S]*Depends on: Delivered email verification; staging editor authorization; hosted browser acceptance/,
  );
  await click(base, sessionId, '[data-testid="empire-todo-completed-view"]');
  assert.match(
    await eventually(() => bodyText(base, sessionId), "load completed Empire To-Do operator view"),
    /ActiveCompleted[\s\S]*No completed items\./,
  );
  await click(base, sessionId, '[data-testid="empire-todo-active-view"]');
  assert.match(
    await eventually(() => bodyText(base, sessionId), "return to active Empire To-Do operator view"),
    /NOW[\s\S]*Blocked[\s\S]*Depends on: Delivered email verification; staging editor authorization; hosted browser acceptance/,
  );
  await click(base, sessionId, '[data-testid="tab-infrastructure"]');
  assert.match(await eventually(() => bodyText(base, sessionId), "render Infrastructure"), /INFRASTRUCTURE ASSETS/);
  await click(base, sessionId, '[data-testid="tab-sentinel"]');
  const sentinelText = await eventually(async () => {
    const text = await bodyText(base, sessionId);
    assert.match(text, /Radcon Sentinel[\s\S]*Empire Operations[\s\S]*Security Guardian/);
    assert.match(text, /Is my computer okay\?[\s\S]*RECENT GUARDIAN ACTIVITY[\s\S]*CURRENT MEASUREMENTS[\s\S]*Advanced evidence, controls, and workstation records/);
    assert.match(text, /Refreshes every 60 seconds[\s\S]*Deterministic, token-free, and not written to durable history/);
    assert.match(text, /GPU TEMPERATURE[\s\S]*(Sensor unavailable|°C)/);
    assert.match(text, /Additional depth and provenance—not a second copy of current summary measurements/);
    return text;
  }, "render the installed Radcon Sentinel control room");
  assert.equal((sentinelText.match(/CURRENT MEASUREMENTS/g) || []).length, 1, "Current Measurements must have one primary home");
  const sentinelPresentation = await request(base, `/session/${sessionId}/execute/sync`, "POST", {
    script: `
      const activity = document.querySelector('.guardianActivityScroll');
      const small = document.querySelector('.securityControlRoom .sentinelShell small');
      const investigateButtons = document.querySelectorAll('[data-testid="guardian-investigate-fix"]');
      const anomalyRows = document.querySelectorAll('.guardianActivityRow-attention, .guardianActivityRow-elevated, .guardianActivityRow-critical');
      return {
        activityOverflowY: activity ? getComputedStyle(activity).overflowY : null,
        smallFontSize: small ? Number.parseFloat(getComputedStyle(small).fontSize) : null,
        investigateButtonCount: investigateButtons.length,
        anomalyRowCount: anomalyRows.length,
      };
    `,
    args: [],
  });
  assert.equal(sentinelPresentation.activityOverflowY, "auto", "Recent Guardian Activity must be visibly bounded and scrollable");
  assert.ok(sentinelPresentation.smallFontSize >= 12.5, "Security supporting typography must remain readable");
  assert.ok(sentinelPresentation.investigateButtonCount <= sentinelPresentation.anomalyRowCount, "Investigate / Fix must not appear on normal rows");

  await click(base, sessionId, '[data-testid="security-mode-empire_operations"]');
  await eventually(async () => {
    const text = await bodyText(base, sessionId);
    assert.match(text, /IS THE EMPIRE MACHINERY FUNCTIONING\?[\s\S]*SOURCE GOLDEN[\s\S]*INSTALLED GOLDEN[\s\S]*AUTOMATION HEALTH[\s\S]*REGISTRY \+ TOPOLOGY[\s\S]*SECURITY \+ AUDIT/);
    assert.ok(
      text.includes(`O2 ${expectedO2Sha.slice(0, 9)} · RadControl ${expectedRadcontrolSha.slice(0, 9)}`),
      "Empire Operations did not render the exact accepted source pair",
    );
    assert.match(text, /CI \+ CODEQLNot connected yet/);
    assert.match(text, /Empire Map[\s\S]*Snapshot[\s\S]*Empire Sweep/);
  }, "render truthful installed Empire Operations");

  await click(base, sessionId, '[data-testid="security-mode-security_guardian"]');
  await eventually(async () => {
    const text = await bodyText(base, sessionId);
    assert.match(text, /WEBSITES \+ FULL TECHNOLOGY ESTATE[\s\S]*VISIBILITY NOW[\s\S]*PROVIDERS \+ SECURITY SYSTEMS[\s\S]*REGISTERED WEBSITES \+ APPS/);
    assert.match(text, /CONTROL READINESS[\s\S]*View User Activity[\s\S]*Authentication Logs[\s\S]*Security Events[\s\S]*Suspicious Activity[\s\S]*Lock Down RCE[\s\S]*Maintenance \/ Restrict Access/);
    assert.match(text, /Not connected yet/i);
  }, "render truthful installed Security Guardian");
  const futureControlButtonCount = await request(base, `/session/${sessionId}/execute/sync`, "POST", {
    script: "return document.querySelectorAll('[data-testid=\"security-guardian-controls\"] button').length;",
    args: [],
  });
  assert.equal(futureControlButtonCount, 0, "unwired Security Guardian controls must not be executable buttons");

  await request(base, `/session/${sessionId}/refresh`, "POST", {});
  await eventually(async () => assert.match(await bodyText(base, sessionId), /RadControl[\s\S]*Projects/), "refresh installed RadControl");
  await click(base, sessionId, '[data-testid="tab-sentinel"]');
  assert.match(
    await eventually(() => bodyText(base, sessionId), "restore selected Security subtab after refresh/remount"),
    /WEBSITES \+ FULL TECHNOLOGY ESTATE[\s\S]*Security Guardian/,
  );
  await click(base, sessionId, '[data-testid="security-mode-sentinel"]');
  await click(base, sessionId, '[data-testid="tab-projects"]');
  assert.match(await eventually(() => bodyText(base, sessionId), "return to Projects"), /DQOTD/);
  assertPortAbsent(tcpListeners(), 1420);

  console.log(JSON.stringify({
    ok: true,
    acceptance: "production-artifact-read-only",
    o2Sha: installedBefore.head,
    radcontrolSha: expectedRadcontrolSha,
    artifactSha256: expectedArtifactSha,
    todoSha256: installedBefore.todoSha256,
    diagnosticsVerified: diagnostics.includes("Listener-free production mode"),
  }));
} catch (error) {
  acceptanceError = error;
} finally {
  if (sessionId) await request(base, `/session/${sessionId}`, "DELETE").catch(() => undefined);
  await stopChild(driver);
  await rm(tempRoot, { recursive: true, force: true });
  await assertInstalledO2Unchanged(installedBefore);
  const listenersAfter = tcpListeners();
  assertPortAbsent(listenersAfter, 1420);
  assertNoNewTcpListeners(listenersBefore, listenersAfter);
}
if (acceptanceError) throw acceptanceError;

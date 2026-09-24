import { copyWorkSnapshot, snapshotWork, assertWorkUnchanged, workReceipt, assertNativeWorkDiagnostics, assertNativeWorkRows } from './native_work_authority.mjs';
import { configureWorkspace, nativeClick, assertWorkspace, workspaceText, assertFanResult, captureWorkspaceFailure } from './native_workspace.mjs';
import { runReleaseWave11 } from "./native_wave11_release.mjs";
import { transactionReceiptContext, writeTransactionReceipt } from "./native_transaction_receipt.mjs";
import { assertWave1Work, assertSentinelHealth, assertSentinelDetails, guardianActivityGeometry, assertGuardianActivityGeometry, assertSentinelRawEvidence, request } from "./native_sentinel_assertions.mjs";
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  installNativeAcceptanceSignalCleanup,
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

const receiptContext = await transactionReceiptContext(process.argv, {
  o2Sha: expectedO2Sha, radcontrolSha: expectedRadcontrolSha, artifactSha256: expectedArtifactSha,
});
if (receiptContext) assert.equal(app, INSTALLED_RADCONTROL_APP, "transaction acceptance must use the installed executable");
const rollbackSmoke = receiptContext?.binding.phase === 'rollback';
let acceptanceResult;

function assertNativeDriver() {
  const result = spawnSync("WebKitWebDriver", ["--help"], { stdio: "ignore" });
  if (result.error || result.status !== 0) throw new Error("WebKitWebDriver is required for native acceptance");
}

function installedOperatorRoster() {
  const environment = { ...process.env };
  delete environment.O2_ROOT;
  delete environment.O2_ROOT_OVERRIDE;
  const result = spawnSync(
    "bash",
    [path.join(INSTALLED_O2_ROOT, "scripts/run_o2.sh"), "list_projects"],
    { encoding: "utf8", env: environment },
  );
  if (result.error || result.status !== 0) {
    throw new Error(
      `installed O2 project roster is unavailable: ${(result.stderr || result.error?.message || "unknown failure").trim()}`,
    );
  }
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true, "installed O2 project roster must report success");
  assert.ok(Array.isArray(payload.projects), "installed O2 project roster must contain projects");
  const projects = payload.projects.filter(
    (project) => project.archetype !== "governance" && project.archetype !== "local-control-plane",
  );
  assert.ok(projects.length > 0, "installed O2 operator project roster must not be empty");
  assert.equal(
    new Set(projects.map((project) => project.key)).size,
    projects.length,
    "installed O2 operator project keys must be unique",
  );
  return projects;
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


async function eventually(action, description, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try { return await action(); } catch (error) { lastError = error; await delay(250); }
  }
  throw new Error(`${description}: ${lastError instanceof Error ? lastError.message.split('\n')[0] : 'assertion failed'}`);
}

async function element(base, sessionId, selector) {
  const value = await request(base, `/session/${sessionId}/element`, "POST", { using: "css selector", value: selector });
  return value["element-6066-11e4-a52e-4f735466cecf"];
}

const click = nativeClick;

async function bodyText(base, sessionId) {
  const id = await element(base, sessionId, "body");
  return request(base, `/session/${sessionId}/element/${id}/text`);
}


async function readChainRecords(file) {
  const source = await readFile(file, "utf8");
  return source
    .split("\n")
    .filter((row) => row.trim())
    .map((row) => JSON.parse(row).record);
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
const clientContract = JSON.parse(
  await readFile(new URL("../contracts/o2-radcontrol/v1/client.json", import.meta.url), "utf8"),
);
const requiredProjectKeys = clientContract.requiredOperatorProjectKeys;
assert.ok(
  Array.isArray(requiredProjectKeys) && requiredProjectKeys.length > 0,
  "client contract must declare required operator project keys",
);
const installedProjects = installedOperatorRoster();
assert.deepEqual(
  installedProjects.map((project) => project.key).sort(),
  [...requiredProjectKeys].sort(),
  "installed O2 operator project roster does not match the independent RadControl client contract",
);
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
]);
await cp(path.join(INSTALLED_O2_ROOT, ".state"), stateOverlay, { recursive: true, preserveTimestamps: true });
await mkdir(path.join(stateOverlay, "radcontrol-runtime", "tmp"), { recursive: true, mode: 0o700 });
const operatorWorkSource = path.join(tempRoot, "operator-work");
const liveWorkRoot = path.join(path.dirname(INSTALLED_O2_ROOT), "operator-work");
const expectedWork = await copyWorkSnapshot(INSTALLED_O2_ROOT, liveWorkRoot, operatorWorkSource);
const activatedWork = expectedWork.authority === 'private';
const sandboxedApp = await createBubblewrapApplication({
  app,
  tempRoot,
  operatorWorkSource,
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
const cleanup = installNativeAcceptanceSignalCleanup(async () => {
  if (sessionId) await request(base, `/session/${sessionId}`, "DELETE").catch(() => undefined);
  await stopChild(driver);
  const workAfter = await snapshotWork(INSTALLED_O2_ROOT, liveWorkRoot);
  const copyAfter = await snapshotWork(INSTALLED_O2_ROOT, operatorWorkSource);
  await rm(tempRoot, { recursive: true, force: true });
  assertWorkUnchanged(expectedWork, workAfter);
  assertWorkUnchanged(expectedWork, copyAfter);
  await assertInstalledO2Unchanged(installedBefore);
  const listenersAfter = tcpListeners();
  assertPortAbsent(listenersAfter, 1420);
  assertNoNewTcpListeners(listenersBefore, listenersAfter);
});
try {
  await eventually(() => request(base, "/status"), "start tauri-driver");
  const session = await request(base, "/session", "POST", {
    capabilities: { alwaysMatch: { browserName: "wry", "tauri:options": { application: sandboxedApp } } },
  });
  sessionId = session.sessionId;
  configureWorkspace(base, sessionId, {evidenceDir: receiptContext ? path.join(path.dirname(receiptContext.output), `navigation-${receiptContext.binding.phase}`) : `${tempRoot}-navigation`, fixture:{kind:'installed-readonly',phase:receiptContext?.binding.phase || 'standalone'}});
  assert.ok(sessionId, "desktop session id is required");
  await eventually(async () => assert.match(await bodyText(base, sessionId), /RadControl[\s\S]*Projects/), "render installed RadControl");

  await click(base, sessionId, 'button[title^="Show the installed app build"]');
  const diagnostics = await eventually(async () => {
    const text = await workspaceText(base, sessionId, 'runtime');
    assert.match(text, /READY\s*Listener-free production mode/);
    assert.match(text, /LIVE PRODUCT READY/);
    if (!rollbackSmoke || activatedWork) {
      const state=await request(base,`/session/${sessionId}/execute/sync`,"POST",{script:'return document.querySelector("[data-testid=runtime-work-readiness]")?.dataset.state;',args:[]});
      assert.ok(['bridge','private'].includes(state),'actual Work authority must pass Runtime Diagnostics');
      if (activatedWork) assert.equal(state, 'private', 'active private Work must never fall back to legacy');
    }
    assert.match(text, /production/);
    assert.ok(text.includes(expectedO2Sha), "production diagnostics did not render the expected O2 identity");
    assert.ok(text.includes(expectedRadcontrolSha), "production diagnostics did not render the expected RadControl identity");
    assert.ok(text.includes(`Projects · ${installedProjects.length} visible`));
    for (const project of installedProjects) {
      assert.ok(text.includes(project.label), `production diagnostics omitted ${project.label}`);
    }
    await assertNativeWorkDiagnostics(base, sessionId, expectedWork);
    assert.match(text, /Infrastructure · 10 governed profiles/);
    assert.match(text, /Security \/ Radcon Sentinel/);
    return text;
  }, "render exact production runtime diagnostics");
  await click(base, sessionId, ".runtimeModalCard .btnGhost");

  // Legacy rollback generations predate Overview; active-private generations
  // must prove current records with their own presentation, not Wave 2B rails.
  if (!rollbackSmoke || activatedWork) {
  await click(base,sessionId,'[data-testid="tab-overview"]');
  await eventually(async()=>{
    const view = await request(base,`/session/${sessionId}/execute/sync`,'POST',{script:'return {text:document.querySelector(".overview")?.innerText, rows:[...document.querySelectorAll(".momentumRow")].map(e=>e.dataset.testid)};',args:[]});
    if (activatedWork) {
      assert.ok(JSON.stringify(view.rows) === JSON.stringify(expectedWork.initiativeIds.map(id=>'momentum-'+id)), 'Overview initiative identities differ from authority');
      assert.doesNotMatch(view.text,/Work is temporarily read-only/);
    } else {
      assert.match(view.text,/Work is temporarily read-only/);assert.deepEqual(view.rows,[]);
    }
  },'actual Work authority drives Overview');
  }
  const workAuthorityChecks = workReceipt(expectedWork);
  await assertNativeWorkRows(base,sessionId,expectedWork,selector=>click(base,sessionId,selector),fn=>eventually(fn,'authoritative Work task sets'));

  if (rollbackSmoke) {
    acceptanceResult = {ok:true, acceptance:'rollback-native-smoke',
      o2Sha:installedBefore.head, radcontrolSha:expectedRadcontrolSha,
      artifactSha256:expectedArtifactSha, diagnosticsVerified:true,
      privateWorkVerified:activatedWork, workAuthorityChecks};
  } else {
  const wave1Checks = await assertWave1Work(base, sessionId, (selector) => click(base, sessionId, selector), (fn) => eventually(fn, "Wave 1 work surfaces"), expectedWork);

  await click(base, sessionId, '[data-testid="tab-notes"]');
  assert.match(await eventually(() => bodyText(base, sessionId), "render Notes"), /To-Do[\s\S]*Progress[\s\S]*Timeline[\s\S]*My Notes[\s\S]*Empire Blueprint[\s\S]*O2 Knowledge/);
  await click(base, sessionId, '[data-testid="notes-mode-o2_knowledge"]');
  await eventually(async () => {
    const text = await bodyText(base, sessionId);
    assert.match(text, /O2 KNOWLEDGE[\s\S]*WHAT O2 KNOWS[\s\S]*HOST-LOCAL\/NON-AUTHORITATIVE/);
    assert.match(text, /Canonical source/);
  }, "render O2 Knowledge without mutating installed O2");
  await request(base, `/session/${sessionId}/window/rect`, "POST", { width: 1650, height: 1000 });
  await click(base, sessionId, '[data-testid="tab-legal"]');
  await eventually(async () => {
    const text = await bodyText(base, sessionId);
    assert.match(text, /StructureFormationAddresses & AgentBrands & VenturesBusiness AccountsDocuments & Compliance/);
    assert.match(text, /OWNERSHIP \/ BUSINESS LANE[\s\S]*Radcon Enterprises LLC[\s\S]*Offroad Croquet/);
    assert.match(text, /PARALLEL REAL-ESTATE LANE[\s\S]*RadWolfe[\s\S]*Jointly owned rental townhouse/);
    assert.match(text, /THRIVE Holly Springs[\s\S]*Northwest Registered Agent[\s\S]*Private owner address/);
    assert.match(text, /RCE OPERATING ACCESS — NOT OWNERSHIP[\s\S]*OPERATING ACCESS — NOT OWNERSHIP/);
    assert.match(text, /Actual address intentionally hidden/);
  }, "render installed Legal Structure and support relationships");
  const legalStructurePresentation = await request(base, `/session/${sessionId}/execute/sync`, "POST", {
    script: `
      const diagram = document.querySelector('[data-testid="legal-ownership-diagram"]');
      const radcon = document.querySelector('[data-testid="legal-radcon-entity"]');
      const radwolfe = document.querySelector('[data-testid="legal-radwolfe-venture"]');
      const children = ['dqotd', 'tbis', 'offroad'].map((key) => document.querySelector('[data-testid="legal-' + key + '-node"]'));
      const townhouse = document.querySelector('[data-testid="legal-townhouse-node"]');
      const ownership = document.querySelector('[data-testid="legal-ownership-connector-radcon"] .legalGraphConnectorBranch');
      const townhouseConnector = document.querySelector('[data-testid="legal-ownership-connector-radwolfe"] .legalGraphConnectorTrunk');
      const support = document.querySelector('[data-testid="legal-support-connector-radcon"] .legalGraphConnectorBranch');
      const supportCards = [...document.querySelectorAll('.legalSupportRail article')];
      const portal = document.querySelector('[data-testid="legal-portal-access-diagram"]');
      const portalConnector = document.querySelector('[data-testid="legal-portal-access-connector"] span');
      const shell = document.querySelector('.legalOperatorWorkspace');
      const supporting = document.querySelector('.legalOperatorWorkspace small');
      const structureMode = document.querySelector('[data-testid="legal-mode-structure"]');
      const rect = (element) => element ? element.getBoundingClientRect() : null;
      const diagramRect = rect(diagram);
      const ownershipRect = rect(ownership);
      const townhouseConnectorRect = rect(townhouseConnector);
      const supportRect = rect(support);
      const portalRect = rect(portal);
      const privateCard = supportCards.find((card) => card.textContent?.includes('Private owner address'));
      return {
        laneCount: diagram ? diagram.querySelectorAll(':scope > [data-testid$="-lane"]').length : 0,
        graphIsFirstWorkspaceContent: Boolean(shell && diagram && diagram.parentElement?.firstElementChild === diagram),
        graphVisibleImmediately: Boolean(diagramRect && diagramRect.top < window.innerHeight && diagramRect.height > 0),
        parallelTopDelta: radcon && radwolfe ? Math.abs(radcon.getBoundingClientRect().top - radwolfe.getBoundingClientRect().top) : null,
        topNodesSideBySide: Boolean(radcon && radwolfe && radcon.getBoundingClientRect().right < radwolfe.getBoundingClientRect().left),
        radconChildrenBelow: Boolean(radcon && children.every(Boolean) && children.every((node) => node.getBoundingClientRect().top > radcon.getBoundingClientRect().bottom)),
        townhouseBelowRadwolfe: Boolean(radwolfe && townhouse && townhouse.getBoundingClientRect().top > radwolfe.getBoundingClientRect().bottom),
        ownershipConnectorGeometry: Boolean(ownershipRect && ownershipRect.width > 80 && ownershipRect.height >= 2 && getComputedStyle(ownership).backgroundColor !== 'rgba(0, 0, 0, 0)'),
        townhouseConnectorGeometry: Boolean(townhouseConnectorRect && townhouseConnectorRect.height > 20 && getComputedStyle(townhouseConnector).backgroundColor !== 'rgba(0, 0, 0, 0)'),
        supportConnectorGeometry: Boolean(supportRect && supportRect.width > 80 && getComputedStyle(support).borderTopStyle === 'dashed'),
        supportLabels: supportCards.map((card) => card.querySelector('strong')?.textContent || ''),
        privateAddressHidden: Boolean(privateCard && privateCard.textContent?.includes('Actual address intentionally hidden')),
        crossOwnershipConnectors: document.querySelectorAll('[data-connector="radcon-radwolfe"]').length,
        portalIsSeparateAndBelow: Boolean(diagramRect && portalRect && portalRect.top >= diagramRect.bottom && portalConnector && portalConnector.getBoundingClientRect().width > 0),
        normalFontSize: shell ? Number.parseFloat(getComputedStyle(shell).fontSize) : null,
        supportingFontSize: supporting ? Number.parseFloat(getComputedStyle(supporting).fontSize) : null,
        structureSelected: structureMode ? structureMode.classList.contains('workspaceModeButtonActive') : false,
      };
    `,
    args: [],
  });
  assert.equal(legalStructurePresentation.laneCount, 2, "installed Legal ownership diagram must render two parallel lanes");
  assert.equal(legalStructurePresentation.graphIsFirstWorkspaceContent, true, "installed Legal graph must be first beneath the tab controls");
  assert.equal(legalStructurePresentation.graphVisibleImmediately, true, "installed Legal graph must be visible above the fold");
  assert.ok(legalStructurePresentation.parallelTopDelta !== null && legalStructurePresentation.parallelTopDelta < 80, "installed Radcon and RadWolfe structures must begin in parallel");
  assert.equal(legalStructurePresentation.topNodesSideBySide, true, "installed Radcon and RadWolfe top nodes must be side-by-side");
  assert.equal(legalStructurePresentation.radconChildrenBelow, true, "installed DQOTD, TBIS, and Offroad nodes must be below Radcon");
  assert.equal(legalStructurePresentation.townhouseBelowRadwolfe, true, "installed townhouse must be below RadWolfe");
  assert.equal(legalStructurePresentation.ownershipConnectorGeometry, true, "installed Radcon ownership connector must have visible geometry");
  assert.equal(legalStructurePresentation.townhouseConnectorGeometry, true, "installed townhouse ownership connector must have visible geometry");
  assert.equal(legalStructurePresentation.supportConnectorGeometry, true, "installed support relationships must use visible dashed geometry");
  assert.deepEqual(legalStructurePresentation.supportLabels, ["THRIVE Holly Springs", "Northwest Registered Agent", "Private owner address"]);
  assert.equal(legalStructurePresentation.privateAddressHidden, true, "installed Legal structure must not reveal the private residence");
  assert.equal(legalStructurePresentation.crossOwnershipConnectors, 0, "installed Legal structure must not connect Radcon ownership to RadWolfe");
  assert.equal(legalStructurePresentation.portalIsSeparateAndBelow, true, "installed RCE access diagram must be separate and secondary");
  assert.ok(legalStructurePresentation.normalFontSize >= 14, "installed Legal normal text must remain readable");
  assert.ok(legalStructurePresentation.supportingFontSize >= 13, "installed Legal supporting text must remain readable");
  assert.equal(legalStructurePresentation.structureSelected, true, "installed Legal view must default to Structure");
  if (process.env.RADCONTROL_ACCEPTANCE_SCREENSHOT_PATH) {
    const encodedScreenshot = await request(base, `/session/${sessionId}/screenshot`);
    await writeFile(process.env.RADCONTROL_ACCEPTANCE_SCREENSHOT_PATH, Buffer.from(encodedScreenshot, "base64"));
  }
  await request(base, `/session/${sessionId}/window/rect`, "POST", { width: 600, height: 900 });
  const mobileLayout = await request(base, `/session/${sessionId}/execute/sync`, "POST", {
    script: `const diagram = document.querySelector('[data-testid="legal-ownership-diagram"]'); return { columns: diagram ? getComputedStyle(diagram).gridTemplateColumns : null, width: window.innerWidth };`,
    args: [],
  });
  if (mobileLayout.width <= 1100) {
    assert.ok(mobileLayout.columns && !mobileLayout.columns.includes(" "), "installed Legal diagram must preserve hierarchy in one responsive column");
  } else {
    assert.ok(mobileLayout.width >= 1500, "installed native window may skip responsive rendering only when its governed minimum width clamps the request");
  }
  await request(base, `/session/${sessionId}/window/rect`, "POST", { width: 1650, height: 1000 });
  for (const [selector, expected] of [
    ['[data-testid="legal-mode-formation"]', /Radcon Enterprises formation[\s\S]*RadWolfe formalization/],
    ['[data-testid="legal-mode-addresses"]', /Actual street address intentionally absent[\s\S]*Northwest Registered Agent/],
    ['[data-testid="legal-mode-brands"]', /RADCON-OWNED BRANDS \/ BUSINESSES \/ PROJECTS[\s\S]*PARALLEL VENTURE/],
    ['[data-testid="legal-mode-accounts"]', /Radcon Enterprises[\s\S]*EIN[\s\S]*RadWolfe/],
    ['[data-testid="legal-mode-documents"]', /DOCUMENTS & COMPLIANCE[\s\S]*Articles of Organization/],
  ]) {
    await click(base, sessionId, selector);
    assert.match(await eventually(() => bodyText(base, sessionId), `render installed ${selector}`), expected);
  }
  assert.match(await eventually(() => bodyText(base, sessionId), "preserve installed Legal archives"), /Legal working notes[\s\S]*Imported documents[\s\S]*Historical structures/);

  await click(base, sessionId, '[data-testid="tab-infrastructure"]');
  assert.match(await eventually(() => bodyText(base, sessionId), "render Infrastructure"), /INFRASTRUCTURE ASSETS/);
  await click(base, sessionId, '[data-testid="tab-sentinel"]');
  const sentinelText = await eventually(async () => {
    const text = await workspaceText(base, sessionId, 'sentinel');
    await assertWorkspace(base, sessionId, 'sentinel');
    // The three Security labels are asserted independently below; content is scoped.
    await assertWorkspace(base, sessionId, 'sentinel');
    assert.ok(/Is my computer okay\?[\s\S]*CURRENT NOW[\s\S]*RECENT EVENTS[\s\S]*Details/.test(text), "Sentinel primary hierarchy is incorrect");
    await assertWorkspace(base, sessionId, 'sentinel');
    assert.ok(!text.includes("Advanced evidence, controls, and workstation records"), "The retired Advanced umbrella disclosure is still rendered");
    return text;
  }, "render the installed Radcon Sentinel control room");
  await assertSentinelDetails(base, sessionId, false);
  await click(base, sessionId, '.sentinelAdvancedWorkspace > summary');
  await assertSentinelDetails(base, sessionId, true);
  const detailsText = await workspaceText(base, sessionId, 'sentinel');
  await assertWorkspace(base, sessionId, 'sentinel');
  assert.match(detailsText, /MEASUREMENT DETAILS[\s\S]*ADVANCED SYSTEM INFORMATION/);
  await assertWorkspace(base, sessionId, 'sentinel');
  assert.match(detailsText, /Refreshes every 60 seconds/);
  for (const heading of ["SYSTEM EVIDENCE", "SCAN COVERAGE", "MAINTENANCE & UPDATES", "AUTOMATION", "WORKSTATION RECORD & NOTES", "SAFETY & PERMISSIONS"]) assert.ok(detailsText.includes(heading), `Advanced area ${heading} is missing`);
  await click(base, sessionId, '.sentinelAdvancedWorkspace > summary');
  await assertSentinelDetails(base, sessionId, false);
  const securityNavigation = await request(base, `/session/${sessionId}/execute/sync`, "POST", {
    script: `var buttons = Array.from(document.querySelectorAll('.securityControlRoom > .workspaceModeRow .workspaceModeButton'));
      return {
        labels: buttons.map(function (button) { return (button.textContent || '').trim(); }),
        miniDescriptionCount: buttons.reduce(function (count, button) { return count + button.querySelectorAll('small').length; }, 0),
        titleFontSizes: buttons.map(function (button) {
          var title = button.querySelector('strong');
          return title ? Number.parseFloat(getComputedStyle(title).fontSize) : 0;
        })
      };`,
    args: [],
  });
  await assertWorkspace(base, sessionId, 'sentinel');
  assert.deepEqual(securityNavigation.labels, ["Radcon Sentinel", "Empire Operations", "Security Guardian"], "Security navigation must contain only the three workspace titles");
  await assertWorkspace(base, sessionId, 'sentinel');
  assert.equal(securityNavigation.miniDescriptionCount, 0, "Security navigation must not render mini descriptions");
  await assertWorkspace(base, sessionId, 'sentinel');
  assert.ok(securityNavigation.titleFontSizes.every((size) => size >= 18), "Security workspace titles must use larger typography");
  await assertWorkspace(base, sessionId, 'sentinel');
  assert.equal((sentinelText.match(/CURRENT NOW/g) || []).length, 1, "Current Now must have one primary home");
  await assertWorkspace(base, sessionId, 'sentinel');
  assert.equal((sentinelText.match(/Fans are loud/g) || []).length, 1, "The primary loud-fan action must appear exactly once");
  const currentHealthPresentation = await assertSentinelHealth(base, sessionId);
  const desktopActivityGeometry = await guardianActivityGeometry(base, sessionId);
  await assertWorkspace(base, sessionId, 'sentinel');
  assertGuardianActivityGeometry(desktopActivityGeometry, "installed desktop Guardian Activity", { desktop: true });
  await assertSentinelRawEvidence(base, sessionId, selector => click(base, sessionId, selector));
  if (process.env.RADCONTROL_ACCEPTANCE_SCREENSHOT_PATH) {
    const activityElement = await element(base, sessionId, '[data-testid="recent-guardian-activity"]');
    await request(base, `/session/${sessionId}/execute/sync`, "POST", {
      script: "arguments[0].scrollIntoView({ block: 'center', inline: 'nearest' });",
      args: [{ "element-6066-11e4-a52e-4f735466cecf": activityElement }],
    });
    const encodedScreenshot = await request(base, `/session/${sessionId}/screenshot`);
    await writeFile(`${process.env.RADCONTROL_ACCEPTANCE_SCREENSHOT_PATH}.sentinel-activity.png`, Buffer.from(encodedScreenshot, "base64"));
  }
  const processFindingPresentation = await request(base, `/session/${sessionId}/execute/sync`, "POST", {
    script: `var visible = [];
      document.querySelector('[data-testid="radcon-sentinel"]').querySelectorAll('.guardianFindingList strong').forEach(function (node) { visible.push(node.textContent || ''); });
      document.querySelector('[data-testid="radcon-sentinel"]').querySelectorAll('.sentinelCoverageGrid small').forEach(function (node) { visible.push(node.textContent || ''); });
      var retained = [];
      document.querySelector('[data-testid="radcon-sentinel"]').querySelectorAll('.guardianScanEvidence pre').forEach(function (node) { retained.push(node.textContent || ''); });
      return { visible: visible.join(' | '), retained: retained.join(' | ') };`,
    args: [],
  });
  await assertWorkspace(base, sessionId, 'sentinel');
  assert.ok(!processFindingPresentation.visible.includes("high-CPU process, stale test browser, or zombie process"), "installed Sentinel must not collapse visible process evidence into a generic finding");
  if (processFindingPresentation.retained.includes("high-CPU process, stale test browser, or zombie process")) {
    await assertWorkspace(base, sessionId, 'sentinel');
    assert.match(processFindingPresentation.visible, /PID \d+|zombie process(?:es)? detected · parent evidence:/, "legacy process findings must display exact evidence retained in their immutable snapshot");
  }
  await assertWorkspace(base, sessionId, 'sentinel');
  assert.ok(!sentinelText.includes("Review / Fix"), "installed Sentinel must not imply a repair on every finding");

  const sentinelEventsPath = path.join(stateOverlay, "sentinel", "events.jsonl");
  const sentinelActionsPath = path.join(stateOverlay, "sentinel", "audit.jsonl");
  const eventsBeforeDiagnosis = await readChainRecords(sentinelEventsPath);
  const actionsBeforeDiagnosis = await readChainRecords(sentinelActionsPath);
  await click(base, sessionId, '[data-testid="sentinel-diagnose-fix"]');
  const diagnosisResult = await eventually(async () => {
    const result = await request(base, `/session/${sessionId}/execute/sync`, "POST", {
      script: `const card = document.querySelector('[data-testid="radcon-sentinel"]').querySelector('[data-testid="sentinel-diagnosis-result"]'); return {
        text: card?.textContent || '',
        bodyText: document.querySelector('[data-testid="radcon-sentinel"]').innerText,
        diagnoseCount: document.querySelector('[data-testid="radcon-sentinel"]').querySelectorAll('[data-testid="sentinel-diagnose-fix"]').length,
        fullScanCount: document.querySelector('[data-testid="radcon-sentinel"]').querySelectorAll('[data-testid="sentinel-health-check"]').length,
        foregroundStamp: document.querySelector('[data-testid="radcon-sentinel"]').querySelector('.sentinelHealthMeasurements .sentinelSectionHeading strong')?.textContent || '',
        repairButtonCount: Array.from(document.querySelector('[data-testid="radcon-sentinel"]').querySelectorAll('button')).filter((button) => /^(Fix now|Authorize & fix)$/.test(button.textContent?.trim() || '')).length,
      };`,
      args: [],
    });
    await assertWorkspace(base, sessionId, 'sentinel');
    assert.match(result.text, /DIAGNOSIS COMPLETE[\s\S]*(NO ISSUE FOUND|WATCHING|UNKNOWN|FIX AVAILABLE|NEEDS YOUR HELP|FIXED|STILL PRESENT)/);
    await assertWorkspace(base, sessionId, 'sentinel');
    assert.match(result.text, /Scan:[\s\S]*Duration:[\s\S]*Repair ran: NO[\s\S]*Process context[\s\S]*NEXT STEP/);
    return result;
  }, "complete one installed Sentinel diagnosis", 60_000);
  await assertWorkspace(base, sessionId, 'sentinel');
  assert.equal(diagnosisResult.diagnoseCount, 1, "Diagnose must remain a distinct stable control after completion");
  await assertWorkspace(base, sessionId, 'sentinel');
  assert.equal(diagnosisResult.fullScanCount, 1, "Run Full Scan must remain a separate manual control after diagnosis");
  const newDiagnosisEvents = (await readChainRecords(sentinelEventsPath)).slice(eventsBeforeDiagnosis.length);
  const newDiagnosisActions = (await readChainRecords(sentinelActionsPath)).slice(actionsBeforeDiagnosis.length);
  const deepEvents = newDiagnosisEvents.filter((record) => record.type === "host.deep-check");
  const deepActions = newDiagnosisActions.filter((record) => record.requestedCapability === "host.inspect.deep");
  await assertWorkspace(base, sessionId, 'sentinel');
  assert.equal(deepEvents.length, 1, "Diagnose must run exactly one deterministic deep-check workflow");
  await assertWorkspace(base, sessionId, 'sentinel');
  assert.equal(deepActions.length, 1, "Diagnose must retain exactly one deep-check action record");
  await assertWorkspace(base, sessionId, 'sentinel');
  assert.equal(deepEvents[0].observedValues?.repairOccurred, false, "Diagnosis must not claim an automatic repair");
  await assertWorkspace(base, sessionId, 'sentinel');
  assert.ok(Array.isArray(deepEvents[0].observedValues?.findings), "deep-check event must retain projected findings");
  for (const finding of deepEvents[0].observedValues.findings) {
    await assertWorkspace(base, sessionId, 'sentinel');
    assert.ok(finding.findingKey && finding.summary && Array.isArray(finding.evidence), "each installed finding must retain identity, exact summary, and evidence");
    if (["high-current-cpu", "stale-test-browser", "zombie-process"].includes(finding.kind)) {
      await assertWorkspace(base, sessionId, 'sentinel');
      assert.ok(diagnosisResult.bodyText.includes(finding.summary), `operator UI omitted exact process finding: ${finding.summary}`);
    }
  }
  const diagnosisHasRepair = deepEvents[0].observedValues.findings.some((finding) => Boolean(finding.repairCapability));
  if (!diagnosisHasRepair) assert.equal(diagnosisResult.repairButtonCount, 0, "no repair control may appear without an exact governed repair");

  await eventually(async () => {
    const state = await request(base, `/session/${sessionId}/execute/sync`, "POST", {
      script: `return {
        result: document.querySelector('[data-testid="radcon-sentinel"]').querySelector('[data-testid="sentinel-diagnosis-result"]')?.textContent || '',
        foregroundStamp: document.querySelector('[data-testid="radcon-sentinel"]').querySelector('.sentinelHealthMeasurements .sentinelSectionHeading strong')?.textContent || '',
      };`,
      args: [],
    });
    await assertWorkspace(base, sessionId, 'sentinel');
    assert.notEqual(state.foregroundStamp, diagnosisResult.foregroundStamp, "foreground measurement timestamp has not refreshed yet");
    await assertWorkspace(base, sessionId, 'sentinel');
    assert.match(state.result, /DIAGNOSIS COMPLETE[\s\S]*(NO ISSUE FOUND|WATCHING|UNKNOWN|FIX AVAILABLE|NEEDS YOUR HELP|FIXED|STILL PRESENT)/, "diagnosis result disappeared after foreground refresh");
    return state;
  }, "retain diagnosis across a later foreground refresh", 75_000);

  // Measure the retained technical content after explicitly opening its parent.
  await click(base, sessionId, '.sentinelAdvancedWorkspace > summary');
  await assertSentinelDetails(base, sessionId, true);
  const sentinelPresentation = await request(base, `/session/${sessionId}/execute/sync`, "POST", {
    script: `
      const activity = document.querySelector('[data-testid="radcon-sentinel"]').querySelector('.guardianActivityScroll');
      const measurementList = document.querySelector('[data-testid="radcon-sentinel"]').querySelector('.sentinelMeasurementList');
      const measurementPanel = document.querySelector('[data-testid="radcon-sentinel"]').querySelector('[data-testid="sentinel-health-measurements"]');
      const small = document.querySelector('[data-testid="radcon-sentinel"]').querySelector('.securityControlRoom .sentinelShell small');
      const normalRowInvestigateButtons = document.querySelector('[data-testid="radcon-sentinel"]').querySelectorAll('.guardianActivityRow-healthy [data-testid="guardian-review-finding"]');
      const shell = document.querySelector('[data-testid="radcon-sentinel"]');
      const importantReading = document.querySelector('[data-testid="radcon-sentinel"]').querySelector('.securityControlRoom .sentinelMeasurementRow > strong');
      const measurementStyle = measurementList ? getComputedStyle(measurementList) : null;
      const activityStyle = activity ? getComputedStyle(activity) : null;
      return {
        activityOverflowY: activityStyle?.overflowY || null,
        activityMarginLeft: activityStyle ? Number.parseFloat(activityStyle.marginLeft) : null,
        activityMarginRight: activityStyle ? Number.parseFloat(activityStyle.marginRight) : null,
        measurementOverflowY: measurementStyle?.overflowY || null,
        measurementMarginLeft: measurementStyle ? Number.parseFloat(measurementStyle.marginLeft) : null,
        measurementMarginRight: measurementStyle ? Number.parseFloat(measurementStyle.marginRight) : null,
        measurementWidth: measurementList?.getBoundingClientRect().width || null,
        measurementPanelWidth: measurementPanel?.getBoundingClientRect().width || null,
        smallFontSize: small ? Number.parseFloat(getComputedStyle(small).fontSize) : null,
        normalFontSize: shell ? Number.parseFloat(getComputedStyle(shell).fontSize) : null,
        importantReadingFontSize: importantReading ? Number.parseFloat(getComputedStyle(importantReading).fontSize) : null,
        measurementRowCount: document.querySelector('[data-testid="radcon-sentinel"]').querySelectorAll('[data-testid="sentinel-measurement-row"]').length,
        activityRowCount: document.querySelector('[data-testid="radcon-sentinel"]').querySelector('[data-testid="recent-guardian-activity"]').querySelectorAll('[data-testid="guardian-activity-row"]').length,
        olderActivityToggleCount: document.querySelector('[data-testid="radcon-sentinel"]').querySelectorAll('.guardianRawToggle').length,
        automationControlCount: document.querySelector('[data-testid="radcon-sentinel"]').querySelectorAll('.sentinelAutomationControl').length,
        automationSelectCount: document.querySelector('[data-testid="radcon-sentinel"]').querySelectorAll('.sentinelAutomationControl select').length,
        automationToggleCount: document.querySelector('[data-testid="radcon-sentinel"]').querySelectorAll('[data-testid="sentinel-automation-toggle"]').length,
        advancedUmbrellaCount: document.querySelector('[data-testid="radcon-sentinel"]').querySelectorAll('details.sentinelAdvancedWorkspace').length,
        advancedAreaCount: document.querySelector('[data-testid="radcon-sentinel"]').querySelectorAll('[data-testid^="advanced-"]').length,
        fanActionCount: document.querySelector('[data-testid="radcon-sentinel"]').querySelectorAll('[data-testid="sentinel-fans-loud"]').length,
        normalRowInvestigateButtonCount: normalRowInvestigateButtons.length,
      };
    `,
    args: [],
  });
  await assertWorkspace(base, sessionId, 'sentinel');
  assert.equal(sentinelPresentation.activityOverflowY, "auto", "Recent Guardian Activity must be visibly bounded and scrollable");
  await assertWorkspace(base, sessionId, 'sentinel');
  assert.equal(sentinelPresentation.measurementOverflowY, "auto", "Current Measurements must be a bounded scrollable row list");
  await assertWorkspace(base, sessionId, 'sentinel');
  assert.ok(sentinelPresentation.activityMarginLeft >= 16 && sentinelPresentation.activityMarginRight >= 16, "Recent Guardian Activity must leave outer-scroll gutters");
  await assertWorkspace(base, sessionId, 'sentinel');
  assert.ok(sentinelPresentation.measurementMarginLeft >= 16 && sentinelPresentation.measurementMarginRight >= 16, "Current Measurements must leave outer-scroll gutters");
  await assertWorkspace(base, sessionId, 'sentinel');
  assert.ok(sentinelPresentation.measurementWidth < sentinelPresentation.measurementPanelWidth - 30, "the measurement list must not consume the complete panel width");
  await assertWorkspace(base, sessionId, 'sentinel');
  assert.equal(sentinelPresentation.measurementRowCount, 8, "all eight current measurements must render as rows");
  await assertWorkspace(base, sessionId, 'sentinel');
  assert.ok(sentinelPresentation.activityRowCount > 0 && sentinelPresentation.activityRowCount <= 6, "Recent Guardian Activity must show at most six grouped events");
  await assertWorkspace(base, sessionId, 'sentinel');
  assert.equal(sentinelPresentation.olderActivityToggleCount, 1, "Older Guardian history must remain explicitly reachable");
  await assertWorkspace(base, sessionId, 'sentinel');
  assert.equal(sentinelPresentation.automationControlCount, 1, "Automatic Guardian must have one authoritative control surface");
  await assertWorkspace(base, sessionId, 'sentinel');
  assert.equal(sentinelPresentation.automationSelectCount, 1, "Automatic Guardian must have one frequency selector");
  await assertWorkspace(base, sessionId, 'sentinel');
  assert.equal(sentinelPresentation.automationToggleCount, 1, "Automatic Guardian must have one enable control");
  await assertWorkspace(base, sessionId, 'sentinel');
  assert.equal(sentinelPresentation.advancedUmbrellaCount, 1, "Advanced System Information must remain inside the single Details disclosure");
  await assertWorkspace(base, sessionId, 'sentinel');
  assert.equal(sentinelPresentation.advancedAreaCount, 6, "Advanced System Information must retain exactly six distinct areas");
  await assertWorkspace(base, sessionId, 'sentinel');
  assert.equal(sentinelPresentation.fanActionCount, 1, "the loud-fan action must have one primary control");
  await assertWorkspace(base, sessionId, 'sentinel');
  assert.ok(sentinelPresentation.normalFontSize >= 15, "Security operator text must remain 15px or larger");
  await assertWorkspace(base, sessionId, 'sentinel');
  assert.ok(sentinelPresentation.smallFontSize >= 14, "Security supporting typography must remain 14px or larger");
  await assertWorkspace(base, sessionId, 'sentinel');
  assert.ok(sentinelPresentation.importantReadingFontSize >= 18, "Important measurements must remain visually prominent");
  await assertWorkspace(base, sessionId, 'sentinel');
  assert.equal(sentinelPresentation.normalRowInvestigateButtonCount, 0, "Investigate / Fix must not appear on normal rows");
  const workstationRecords = await request(base, `/session/${sessionId}/execute/sync`, "POST", {
    script: `return ['host-configuration-note', 'host-operator-notes'].map((testId) => {
      const field = document.querySelector('[data-testid="radcon-sentinel"]').querySelector('[data-testid="' + testId + '"]');
      return {
        testId,
        readOnly: field?.readOnly ?? false,
        valueLength: field?.value?.length ?? 0,
        status: field?.parentElement?.querySelector('small')?.textContent || '',
      };
    });`,
    args: [],
  });
  await assertWorkspace(base, sessionId, 'sentinel');
  assert.deepEqual(workstationRecords.map((row) => row.readOnly), [true, true], "tracked workstation source records must be read-only in the installed app");
  await assertWorkspace(base, sessionId, 'sentinel');
  assert.ok(workstationRecords.every((row) => row.valueLength > 0), "canonical workstation source records must remain visible");
  await assertWorkspace(base, sessionId, 'sentinel');
  assert.ok(workstationRecords.every((row) => row.status.includes("Canonical source · read-only here")), "the installed workstation record boundary must be understandable");

  await click(base, sessionId, '.sentinelAdvancedWorkspace > summary');
  await assertSentinelDetails(base, sessionId, false);

  const eventsBeforeFan = await readChainRecords(sentinelEventsPath);
  const actionsBeforeFan = await readChainRecords(sentinelActionsPath);
  await click(base, sessionId, '[data-testid="sentinel-fans-loud"]');
  await assertFanResult(base, sessionId, {timeoutMs:45_000});
  const newFanEvents = (await readChainRecords(sentinelEventsPath)).slice(eventsBeforeFan.length);
  const newFanActions = (await readChainRecords(sentinelActionsPath)).slice(actionsBeforeFan.length);
  const fanEvent = newFanEvents.find((record) => record.type === "host.fans-check");
  const fanAction = newFanActions.find((record) => record.requestedCapability === "host.inspect.fans");
  await assertWorkspace(base, sessionId, 'sentinel');
  assert.ok(fanEvent?.id && fanEvent.observedValues?.keyMeasurements, "the installed fan workflow must retain a bounded Sentinel event with measurements");
  await assertWorkspace(base, sessionId, 'sentinel');
  assert.equal(fanEvent.observedValues.actionOccurred, false, "routine fan observation must not claim a repair");
  await assertWorkspace(base, sessionId, 'sentinel');
  assert.ok(fanAction?.evidenceIds?.includes(fanEvent.id), "the Sentinel action must bind the retained fan event");
  await assertWorkspace(base, sessionId, 'sentinel');
  assert.equal(fanAction.executionResult, "observed", "the retained fan action must record its observation outcome");

  await click(base, sessionId, '[data-testid="sentinel-open-details"]');
  await click(base, sessionId, '.guardianRawToggle');
  const expandedActivity = await request(base, `/session/${sessionId}/execute/sync`, "POST", {
    script: `return {
      rowCount: document.querySelector('[data-testid="sentinel-raw-history"]').querySelectorAll('[data-testid="guardian-raw-row"]').length,
      text: document.querySelector('[data-testid="radcon-sentinel"]').querySelector('[data-testid="sentinel-raw-history"]')?.textContent || '',
    };`,
    args: [],
  });
  await assertWorkspace(base, sessionId, 'sentinel');
  assert.equal(expandedActivity.rowCount, 20, "Expanded Guardian history must remain bounded to the latest 20 records");
  await assertWorkspace(base, sessionId, 'sentinel');
  assert.ok(expandedActivity.text.trim().length > 0, "Expanded Guardian history must render retained evidence");

  await click(base, sessionId, '[data-testid="security-mode-empire_operations"]');
  await eventually(async () => {
    const text = await workspaceText(base, sessionId, 'empire_operations');
    assert.match(text, /Development-system integrity[\s\S]*OPERATIONAL TRUTH[\s\S]*SOURCE GOLDEN[\s\S]*INSTALLED GOLDEN[\s\S]*AUTOMATION HEALTH[\s\S]*REGISTRY \+ TOPOLOGY[\s\S]*SECURITY \+ AUDIT/);
    assert.ok(
      text.includes(`O2 ${expectedO2Sha.slice(0, 9)} · RadControl ${expectedRadcontrolSha.slice(0, 9)}`),
      "Empire Operations did not render the exact accepted source pair",
    );
    assert.match(text, /CI \+ CODEQL\s*Not connected yet/);
    assert.match(text, /Empire Map[\s\S]*Snapshot[\s\S]*Empire Sweep/);
  }, "render truthful installed Empire Operations");
  const operationalTruthScroll = await request(base, `/session/${sessionId}/execute/sync`, "POST", {
    script: `var truth = document.querySelector('.empireOperationsSignalGrid');
      var style = truth ? getComputedStyle(truth) : null;
      return {
        overflowY: style ? style.overflowY : null,
        clientHeight: truth ? truth.clientHeight : 0,
        scrollHeight: truth ? truth.scrollHeight : 0,
        scrollbarGutter: style ? style.scrollbarGutter : null
      };`,
    args: [],
  });
  assert.equal(operationalTruthScroll.overflowY, "scroll", "Operational Truth must expose a vertical scrollbar");
  assert.ok(operationalTruthScroll.scrollHeight > operationalTruthScroll.clientHeight, "Operational Truth must remain visibly height-bounded");
  assert.match(operationalTruthScroll.scrollbarGutter || "", /stable/, "Operational Truth must reserve a stable scrollbar gutter");

  await click(base, sessionId, '[data-testid="security-mode-security_guardian"]');
  await eventually(async () => {
    const text = await workspaceText(base, sessionId, 'security_guardian');
    assert.match(text, /Online technology estate[\s\S]*VISIBILITY NOW[\s\S]*PROVIDERS \+ SECURITY SYSTEMS[\s\S]*REGISTERED WEBSITES \+ APPS/);
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
    /ONLINE TECHNOLOGY ESTATE/,
  );
  await click(base, sessionId, '[data-testid="security-mode-sentinel"]');
  await click(base, sessionId, '[data-testid="tab-projects"]');
  assert.match(await eventually(() => bodyText(base, sessionId), "return to Projects"), /DQOTD/);
  assertPortAbsent(tcpListeners(), 1420);

  acceptanceResult = {
    ok: true,
    acceptance: "production-artifact-read-only",
    o2Sha: installedBefore.head,
    radcontrolSha: expectedRadcontrolSha,
    artifactSha256: expectedArtifactSha,
    todoSha256: installedBefore.todoSha256,
    wave1Checks,
    workAuthorityChecks,
    diagnosticsVerified: diagnostics.includes("Listener-free production mode"),
    sentinelCurrentHealth: currentHealthPresentation.current,
    sentinelMeasurementHealth: currentHealthPresentation.declaredCurrent,
    sentinelOperatorState: currentHealthPresentation.cardState,
    sentinelHeroClass: currentHealthPresentation.heroClass,
  };
}
} catch (error) {
  acceptanceError = new Error(error?.code === 'ERR_ASSERTION' ? 'Production native assertion failed; see private redacted navigation evidence' : String(error?.message || 'Production native acceptance failed'));
  if(sessionId) await captureWorkspaceFailure(base,sessionId,null,'production-native-assertion').catch(()=>{});
} finally {
  await cleanup();
}
if (acceptanceError) throw acceptanceError;

if (!rollbackSmoke) acceptanceResult.wave11 = await runReleaseWave11({app,o2Source:INSTALLED_O2_ROOT,
  identities:{o2Sha:expectedO2Sha,radcontrolSha:expectedRadcontrolSha,artifactSha256:expectedArtifactSha},
  entrypoint:'tauri_production_readonly.mjs'});
await writeTransactionReceipt(receiptContext, acceptanceResult);
console.log(JSON.stringify(acceptanceResult));

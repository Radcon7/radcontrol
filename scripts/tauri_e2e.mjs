import { snapshotWork, assertWorkUnchanged } from './native_work_authority.mjs';
import { assertFourTabApplication } from './native_four_tab_assertions.mjs';
import { seedSentinelReadiness, assertSentinelReadiness } from "./native_sentinel_readiness.mjs";
import { configureWorkspace } from './native_workspace.mjs';
import { assertSentinelHealth, assertSentinelDetails, guardianActivityGeometry, assertGuardianActivityGeometry, assertSentinelRawEvidence } from "./native_sentinel_assertions.mjs";
import { runWave2aAcceptance } from "./native_wave2a_acceptance.mjs";
import { runWave11Acceptance } from "./native_wave11_acceptance.mjs";
import assert from "node:assert/strict";
import { access, cp, mkdir, mkdtemp, readFile, readdir, rename, symlink, unlink, rm, writeFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  INSTALLED_O2_ROOT,
  assertInstalledO2Unchanged,
  assertNoNewTcpListeners,
  assertPortAbsent,
  assertWritableFixtureIsolation,
  createBubblewrapApplication,
  installNativeAcceptanceSignalCleanup,
  snapshotInstalledO2,
  sha256File,
  tcpListeners,
} from "./native_acceptance_lib.mjs";

const sentinelOnly = process.argv.includes("--sentinel-readiness-only");
assert.ok(!process.argv.includes("--work-only"), "Work UI migrated to RadCloud; use current four-tab acceptance");
const fixtureKey = "radcontrol-e2e-fixture";
const createdProjectKey = "radcontrol-e2e-draft";
const agentName = "RadControl E2E Agent";
const agentKey = "radcontrol-e2e-agent";
const infrastructureLabel = "RadControl E2E Local Tool";
const infrastructureKey = "radcontrol-e2e-local-tool-local-toolchain";
const infrastructureProfileKey = "docker";
const app = new URL("../src-tauri/target/debug/radcontrol-app", import.meta.url).pathname;
const sourceO2Root = process.env.O2_E2E_SOURCE_ROOT || "/home/chris/dev/o2";

function assertNativeDriver() {
  const result = spawnSync("WebKitWebDriver", ["--help"], { stdio: "ignore" });
  if (result.error || result.status !== 0) {
    throw new Error("WebKitWebDriver is required. Install it with: sudo apt-get install webkit2gtk-driver");
  }
}

async function unusedPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function prepareIsolatedO2Root() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "radcontrol-tauri-e2e-"));
  const o2Root = path.join(tempRoot, "o2");
  const fixtureRepo = path.join(tempRoot, "fixture");
  const e2eHome = path.join(tempRoot, "home");
  const xdgCacheHome = path.join(tempRoot, "xdg-cache");
  const xdgConfigHome = path.join(tempRoot, "xdg-config");
  const xdgDataHome = path.join(tempRoot, "xdg-data");
  const dconfOverlay = path.join(tempRoot, "dconf");
  const createdProjectRepo = path.join(e2eHome, "dev", "rad-empire", "radcon", "dev", createdProjectKey);
  const fixturePort = await unusedPort();
  const fixtureUrl = `http://127.0.0.1:${fixturePort}`;
  const notesPath = path.join(o2Root, "docs", "projects", fixtureKey, "NOTES.md");
  const myNotesDir = path.join(o2Root, "docs", "radcontrol", "notes");
  const agentProfileDir = path.join(
    o2Root,
    "docs",
    "agent-profiles",
    agentKey,
  );
  const agentNotesPath = path.join(agentProfileDir, "NOTES.md");
  const infrastructureRecordDir = path.join(
    o2Root,
    "docs",
    "infrastructure",
    "records",
    infrastructureKey,
  );
  const infrastructureNotesPath = path.join(
    o2Root,
    "docs",
    "infrastructure",
    "assets",
    infrastructureProfileKey,
    "NOTES.md",
  );
  const empireTodoPath = path.join(
    o2Root,
    "docs",
    "radcontrol",
    "empire_todo",
    "items.json",
  );
  const timelineDir = path.join(o2Root, "docs", "radcontrol", "timeline");
  const hostRecordDir = path.join(
    o2Root,
    "docs",
    "infrastructure",
    "assets",
    "system76-workstation",
  );

  await cp(path.join(sourceO2Root, "scripts"), path.join(o2Root, "scripts"), { recursive: true });
  await mkdir(path.join(o2Root, "registry"), { recursive: true });
  for (const registryFile of [
    "project-archetypes.json",
    "empire-todo-seeds.json",
    "sentinel-capabilities.json",
    "sentinel-policy.json",
    "sentinel-triggers.json",
    "sentinel-assets.json",
    "sentinel-adapters.json",
    "knowledge-catalog.json",
    "knowledge-catalog.lock.json",
    "learning-candidates.json",
    "learning-candidates.schema.json",
    "quality-gates.json",
  ]) {
    await cp(
      path.join(sourceO2Root, "registry", registryFile),
      path.join(o2Root, "registry", registryFile),
    );
  }
  await Promise.all([
    cp(path.join(sourceO2Root, "contracts"), path.join(o2Root, "contracts"), { recursive: true }),
    cp(path.join(sourceO2Root, "skills"), path.join(o2Root, "skills"), { recursive: true }),
    cp(path.join(sourceO2Root, "docs", "portfolio"), path.join(o2Root, "docs", "portfolio"), { recursive: true }),
    cp(path.join(sourceO2Root, "docs", "radcontrol", "empire_blueprint"), path.join(o2Root, "docs", "radcontrol", "empire_blueprint"), { recursive: true }),
    cp(path.join(sourceO2Root, "docs", "radcontrol", "legal_notes"), path.join(o2Root, "docs", "radcontrol", "legal_notes"), { recursive: true }),
    cp(path.join(sourceO2Root, "docs", "radcontrol", "legal_documents"), path.join(o2Root, "docs", "radcontrol", "legal_documents"), { recursive: true }),
    cp(path.join(sourceO2Root, "docs", "radcontrol", "legal_entity_structure"), path.join(o2Root, "docs", "radcontrol", "legal_entity_structure"), { recursive: true }),
    cp(path.join(sourceO2Root, "docs", "reusable-patterns"), path.join(o2Root, "docs", "reusable-patterns"), { recursive: true }),
    cp(path.join(sourceO2Root, "docs", "decisions"), path.join(o2Root, "docs", "decisions"), { recursive: true }),
    cp(path.join(sourceO2Root, "docs", "O2_OPERATIONAL_PLAYBOOK.md"), path.join(o2Root, "docs", "O2_OPERATIONAL_PLAYBOOK.md")),
    cp(path.join(sourceO2Root, "docs", "CURRENT_DOCTRINE.md"), path.join(o2Root, "docs", "CURRENT_DOCTRINE.md")),
  ]);
  const seedAgent=path.join(o2Root,'docs/agent-profiles/native-fixture');
  await mkdir(seedAgent,{recursive:true});
  await writeFile(path.join(seedAgent,'01_profile.json'),JSON.stringify({recordType:'agent_profile',profileKey:'native-fixture',name:'Native Fixture Agent',handle:'native-fixture',agentType:'codex',governedState:'active',mission:'Isolated native acceptance',defaultMode:'read-only',assignedProjects:[fixtureKey],canonicalNotesPath:'docs/agent-profiles/native-fixture/NOTES.md'}));
  await writeFile(path.join(seedAgent,'NOTES.md'),'Deterministic native fixture agent.\n');
  await mkdir(hostRecordDir, { recursive: true });
  await Promise.all([
    mkdir(e2eHome, { recursive: true }),
    mkdir(xdgCacheHome, { recursive: true }),
    mkdir(xdgConfigHome, { recursive: true }),
    mkdir(xdgDataHome, { recursive: true }),
    mkdir(dconfOverlay, { recursive: true }),
  ]);
  for (const recordFile of ["CONFIGURATION.md", "NOTES.md"]) {
    await cp(
      path.join(sourceO2Root, "docs", "infrastructure", "assets", "system76-workstation", recordFile),
      path.join(hostRecordDir, recordFile),
    );
  }
  await mkdir(path.join(fixtureRepo, "site"), { recursive: true });
  await mkdir(path.join(fixtureRepo, "docs"), { recursive: true });
  await mkdir(path.dirname(notesPath), { recursive: true });
  await mkdir(myNotesDir, { recursive: true });
  await mkdir(path.dirname(empireTodoPath), { recursive: true });
  await mkdir(timelineDir, { recursive: true });
  await writeFile(path.join(fixtureRepo, "site", "index.html"), "<main>RadControl E2E fixture</main>\n");
  await writeFile(notesPath, "Temporary E2E fixture note.\n");
  await writeFile(path.join(fixtureRepo, "docs", "REPO_STATE.md"), "# Fixture\n\nPurpose: Isolated RadControl acceptance fixture.\n");
  await cp(path.join(o2Root, "registry", "empire-todo-seeds.json"), empireTodoPath);
  await writeFile(
    path.join(o2Root, "registry", "projects.json"),
    `${JSON.stringify([{
      key: fixtureKey,
      label: "RadControl E2E Fixture",
      repoPath: fixtureRepo,
      url: fixtureUrl,
      port: fixturePort,
      kind: "static",
      archetype: "standalone-product",
      org: "other",
      state: "active",
      retired: false,
      o2StartKey: `${fixtureKey}.dev`,
      o2SnapshotKey: `${fixtureKey}.snapshot`,
      o2MapKey: `${fixtureKey}.map`,
      o2ProofPackKey: `${fixtureKey}.proofpack`,
    }], null, 2)}\n`,
  );

  // The synthetic registry has no source Git history for catalog checksums.
  // Match O2's own formation fixture: an empty private catalog gains only the
  // newly accepted starter entry. Real source knowledge remains untouched.
  for(const name of ['knowledge-catalog.json','knowledge-catalog.lock.json'])
    await writeFile(path.join(o2Root,'registry',name),JSON.stringify({catalogVersion:1,entries:[]}));
  await mkdir(path.join(o2Root,'governance/codex'),{recursive:true});
  await cp(path.join(sourceO2Root,'governance/codex/AGENTS.md'),path.join(o2Root,'governance/codex/AGENTS.md'));

  // Preserve current topology metadata while every writable repository root
  // remains disposable. The later read-only review uses the real paths.
  const registryPath=path.join(o2Root,'registry/projects.json');
  const fixtureProjects=JSON.parse(await readFile(registryPath,'utf8'));
  const sourceProjects=JSON.parse(await readFile(path.join(sourceO2Root,'registry/projects.json'),'utf8'));
  for(const row of sourceProjects) {
    const repoPath=path.join(tempRoot,`repository-${row.key}`);
    await mkdir(repoPath,{recursive:true});
    fixtureProjects.push({...row,repoPath,repoHint:repoPath});
  }
  await writeFile(registryPath,JSON.stringify(fixtureProjects));
  // O2's existing data-only E2E adapter supplies browser evidence for the
  // disposable New Project starter. This is not hosted/browser acceptance.
  const browserResult=path.join(tempRoot,'browser-result.json');
  await cp(path.join(sourceO2Root,'tests/fixtures/bootstrap-browser-success.json'),browserResult);
  const dispatcher=path.join(o2Root,'scripts/run_o2.sh');
  const dispatcherText=await readFile(dispatcher,'utf8');
  await writeFile(dispatcher,dispatcherText.replace('set -euo pipefail',`set -euo pipefail\nexport RADCONTROL_E2E=1\nexport O2_ROOT_OVERRIDE='${o2Root}'\nexport O2_E2E_HOME='${e2eHome}'\nexport O2_E2E_BROWSER_RESULT='${browserResult}'`));

  return {
    tempRoot,
    o2Root,
    fixturePort,
    notesPath,
    myNotesDir,
    agentProfileDir,
    agentNotesPath,
    e2eHome,
    createdProjectRepo,
    infrastructureRecordDir,
    infrastructureNotesPath,
    empireTodoPath,
    timelineDir,
    xdgCacheHome,
    xdgConfigHome,
    xdgDataHome,
    dconfOverlay,
  };
}

async function request(base, route, method = "GET", body) {
  const response = await fetch(`${base}${route}`, {
    signal: AbortSignal.timeout(30_000),
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.value?.error) {
    throw new Error(`${method} ${route}: ${JSON.stringify(payload)}`);
  }
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
  return eventually(async () => {
    const id = await element(base, sessionId, selector);
    await request(base, `/session/${sessionId}/execute/sync`, "POST", {
      script: "arguments[0].scrollIntoView({ block: 'center', inline: 'center' });",
      args: [{ "element-6066-11e4-a52e-4f735466cecf": id }],
    });
    await request(base, `/session/${sessionId}/element/${id}/click`, "POST", {});
    return id;
  }, `click ${selector}`);
}

async function domClick(base, sessionId, selector) {
  const id = await eventually(() => element(base, sessionId, selector), `find ${selector}`);
  assert.equal(await request(base, `/session/${sessionId}/element/${id}/enabled`), true);
  await request(base, `/session/${sessionId}/execute/sync`, "POST", {
    script: "arguments[0].scrollIntoView({ block: 'center', inline: 'center' }); arguments[0].click();",
    args: [{ "element-6066-11e4-a52e-4f735466cecf": id }],
  });
}

async function replaceValue(base, sessionId, id, text) {
  assert.equal(await request(base, `/session/${sessionId}/element/${id}/enabled`), true);
  // WebKit clear() does not notify React's controlled input tracker. Use the
  // native setter plus input/change for clearing, then real WebDriver typing.
  await request(base, `/session/${sessionId}/execute/sync`, "POST", {
    script: `const e=arguments[0];const p=e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(p,'value').set.call(e,'');e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));`,
    args: [{ "element-6066-11e4-a52e-4f735466cecf": id }],
  });
  if (text) await request(base, `/session/${sessionId}/element/${id}/value`, "POST", { text });
}

async function selectValue(base, sessionId, id, value) {
  await request(base, `/session/${sessionId}/execute/sync`, "POST", {
    script: "arguments[0].value = arguments[1]; arguments[0].dispatchEvent(new Event('change', { bubbles: true }));",
    args: [{ "element-6066-11e4-a52e-4f735466cecf": id }, value],
  });
}

async function acceptAlert(base, sessionId) {
  return eventually(
    () => request(base, `/session/${sessionId}/alert/accept`, "POST", {}),
    "accept document deletion confirmation",
  );
}

async function elementText(base, sessionId, id) {
  return request(base, `/session/${sessionId}/element/${id}/text`);
}

async function elementRect(base, sessionId, id) {
  return request(base, `/session/${sessionId}/element/${id}/rect`);
}

async function elementProperty(base, sessionId, id, property) {
  return request(base, `/session/${sessionId}/element/${id}/property/${property}`);
}

async function bodyText(base, sessionId) {
  const id = await element(base, sessionId, "body");
  return elementText(base, sessionId, id);
}

async function guardianResponsiveGeometry(base, sessionId) {
  return request(base, `/session/${sessionId}/execute/sync`, "POST", {
    script: `
      const header = document.querySelector('.guardianActivityColumns');
      const row = document.querySelector('[data-testid="guardian-activity-row"]');
      const bounds = row?.getBoundingClientRect();
      const cells = row ? [...row.children].map((cell) => {
        const value = cell.getBoundingClientRect();
        return {
          top: value.top,
          right: value.right,
          bottom: value.bottom,
          left: value.left,
          label: getComputedStyle(cell, '::before').content,
        };
      }) : [];
      return {
        viewportWidth: window.innerWidth,
        headerDisplay: header ? getComputedStyle(header).display : null,
        gridTemplateColumns: row ? getComputedStyle(row).gridTemplateColumns : null,
        row: bounds ? { top: bounds.top, bottom: bounds.bottom, left: bounds.left, right: bounds.right } : null,
        cells,
      };
    `,
    args: [],
  });
}

function assertResponsiveGuardianRow(layout, label) {
  assert.ok(layout.row && layout.cells.length === 4, `${label}: one four-field grouped Guardian row is required`);
  assert.ok(layout.cells.every((cell) => cell.top >= layout.row.top - 1 && cell.bottom <= layout.row.bottom + 1), `${label}: a field escaped its row`);
  for (let index = 1; index < layout.cells.length; index += 1) {
    const before = layout.cells[index - 1], after = layout.cells[index];
    assert.ok(after.top >= before.bottom - 1 || after.left >= before.right - 1, `${label}: grouped fields overlap`);
  }
}

async function stopChild(child) {
  if (!child || !child.pid) return;
  const stopGroup = (signal) => {
    try {
      process.kill(-child.pid, signal);
    } catch {
      if (child.exitCode === null) child.kill(signal);
    }
  };
  stopGroup("SIGTERM");
  await Promise.race([once(child, "exit").catch(() => undefined), delay(3_000)]);
  stopGroup("SIGKILL");
}

async function startDesktopSession(base, application) {
  const session = await request(base, "/session", "POST", {
    capabilities: {
      alwaysMatch: {
        browserName: "wry",
        "tauri:options": { application },
      },
    },
  });
  assert.ok(session.sessionId, "desktop session id is required");
  return session.sessionId;
}

console.error("[e2e] checking native driver");
assertNativeDriver();
console.error("[e2e] checking release binary and O2 source");
await Promise.all([access(app), access(path.join(sourceO2Root, "scripts", "run_o2.sh"))]);

const fixture = await prepareIsolatedO2Root();
if (sentinelOnly) await seedSentinelReadiness(fixture);
console.error(`[e2e] isolated fixture ${fixture.tempRoot}`);
await assertWritableFixtureIsolation(fixture);
const installedBefore = await snapshotInstalledO2();
const installedBinaryBefore=await sha256File('/home/chris/.local/bin/radcontrol-app');
const liveWorkRoot=path.join(path.dirname(INSTALLED_O2_ROOT),'operator-work');
const liveWorkBefore=await snapshotWork(INSTALLED_O2_ROOT,liveWorkRoot);
const workFile = path.join(fixture.o2Root, ".state/radcontrol-operator/work/work.json");
const readWork = async () => JSON.parse(await readFile(workFile, "utf8"));
const listenersBefore = tcpListeners();
assertPortAbsent(listenersBefore, 1420);
const sandboxedApp = await createBubblewrapApplication({
  app,
  tempRoot: fixture.tempRoot,
  home: fixture.e2eHome,
  xdgCacheHome: fixture.xdgCacheHome,
  xdgConfigHome: fixture.xdgConfigHome,
  xdgDataHome: fixture.xdgDataHome,
  overlays: [{ source: fixture.dconfOverlay, destination: `/run/user/${process.getuid()}/dconf` }],
  environment: {
    O2_ROOT: fixture.o2Root,
    RADCONTROL_E2E: "1",
    O2_E2E_HOME: fixture.e2eHome,
  },
});
const driverPort = await unusedPort();
const nativePort = await unusedPort();
const base = `http://127.0.0.1:${driverPort}`;
const driver = spawn("tauri-driver", ["--port", String(driverPort), "--native-port", String(nativePort)], {
  stdio: ["ignore", "inherit", "inherit"],
  detached: true,
  env: {
    ...process.env,
    O2_ROOT: fixture.o2Root,
    RADCONTROL_E2E: "1",
    O2_E2E_HOME: fixture.e2eHome,
    XDG_CACHE_HOME: fixture.xdgCacheHome,
    XDG_CONFIG_HOME: fixture.xdgConfigHome,
    XDG_DATA_HOME: fixture.xdgDataHome,
  },
});
let sessionId;
const cleanup = installNativeAcceptanceSignalCleanup(async () => {
  if (sessionId) await request(base, `/session/${sessionId}`, "DELETE").catch(() => {});
  await stopChild(driver);
  if (process.env.RADCONTROL_KEEP_FIXTURE !== "1") await rm(fixture.tempRoot, { recursive: true, force: true });
  else console.error(`[e2e] retained fixture ${fixture.tempRoot}`);
  await assertInstalledO2Unchanged(installedBefore);
  assert.equal(await sha256File('/home/chris/.local/bin/radcontrol-app'),installedBinaryBefore,'installed binary changed');
  assertWorkUnchanged(liveWorkBefore,await snapshotWork(INSTALLED_O2_ROOT,liveWorkRoot));
  const listenersAfter = tcpListeners();
  assertPortAbsent(listenersAfter, 1420);
  assertNoNewTcpListeners(listenersBefore, listenersAfter);
});
try {
  console.error("[e2e] waiting for isolated desktop session");
  await eventually(() => request(base, "/status"), "start tauri-driver");
  sessionId = await startDesktopSession(base, sandboxedApp);
  configureWorkspace(base,sessionId,{evidenceDir:path.join(fixture.tempRoot,'navigation'),fixture:{kind:'e2e'}});

  await eventually(async () => assert.match(await bodyText(base, sessionId), /RadControl[\s\S]*Projects/), "render isolated RadControl");
  await click(base, sessionId, 'button[title^="Show the installed app build"]');
  await eventually(async () => {
    const text = await bodyText(base, sessionId);
    assert.match(text, /Runtime & Build/);
    assert.match(text, /e2e/);
    assert.match(text, new RegExp(fixture.o2Root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(text, new RegExp(INSTALLED_O2_ROOT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }, "attest isolated native runtime before writable interaction");
  await click(base, sessionId, ".runtimeModalCard .btnGhost");

  if (sentinelOnly) {
    await assertSentinelReadiness({fixture,base,sessionId,request,click,eventually});
  } else {
  await runWave2aAcceptance({fixture,base,sessionId,request,click,eventually,mode:'e2e',expectBridge:true});
  await click(base, sessionId, '[data-testid="tab-notes"]');
  await click(base, sessionId, '[data-testid="notes-mode-notes"]');
  const myNotesProbe = "E2E My Notes draft persists through governed O2 storage";
  const myNotesEditor = await element(base, sessionId, '[data-testid="my-notes-input"]');
  await replaceValue(base, sessionId, myNotesEditor, myNotesProbe);
  await eventually(async () => assert.match(await readFile(path.join(fixture.o2Root, ".state", "radcontrol-operator", "my-notes.md"), "utf8"), new RegExp(myNotesProbe)), "persist My Notes only in the isolated private O2 state");
  await click(base, sessionId, '[data-testid="notes-mode-o2_knowledge"]');
  await eventually(async () => assert.match(
    await bodyText(base, sessionId),
    /O2 KNOWLEDGE[\s\S]*WHAT O2 KNOWS[\s\S]*HOST-LOCAL\/NON-AUTHORITATIVE/,
  ), "render read-only O2 Knowledge overview");
  await click(base, sessionId, '.knowledgeNavButton:nth-child(6)');
  await eventually(async () => assert.match(
    await bodyText(base, sessionId),
    /NOT YET DOCTRINE[\s\S]*CANDIDATE\/NON-AUTHORITATIVE/,
  ), "label learning candidates as non-authoritative");
  await click(base, sessionId, '[data-testid="notes-mode-notes"]');
  await eventually(async () => assert.match(
    await elementProperty(base, sessionId, await element(base, sessionId, '[data-testid="my-notes-input"]'), "value"),
    new RegExp(myNotesProbe),
  ), "reload persisted My Note before the native restart");
  assert.ok(await element(base,sessionId,'[data-testid="notes-mode-empire_blueprint"]'));
  await request(base, `/session/${sessionId}`, "DELETE");
  sessionId = await startDesktopSession(base, sandboxedApp);
  configureWorkspace(base,sessionId,{evidenceDir:path.join(fixture.tempRoot,'navigation'),fixture:{kind:'e2e'}});
  await eventually(async () => assert.match(await bodyText(base, sessionId), /Projects/), "restart isolated RadControl");
  await click(base, sessionId, '[data-testid="tab-notes"]');
  await click(base, sessionId, '[data-testid="notes-mode-notes"]');
  await eventually(async () => assert.equal(await elementProperty(base,sessionId,await element(base,sessionId,'[data-testid="my-notes-input"]'),"value"),myNotesProbe), "reload My Notes after native restart");
  await click(base, sessionId, '[data-testid="tab-agents"]');
  assert.match(
    await eventually(() => bodyText(base, sessionId), "render Agents"),
    /AGENT ROSTER/,
  );
  const newAgent = await eventually(
    () => element(base, sessionId, '[data-testid="new-agent"]'),
    "find New Agent",
  );
  await eventually(async () => {
    assert.equal(
      await request(base, `/session/${sessionId}/element/${newAgent}/enabled`),
      true,
    );
  }, "enable New Agent");
  await click(base, sessionId, '[data-testid="new-agent"]');
  const agentNameInput = await eventually(
    () => element(base, sessionId, '[data-testid="modal-agent-name"]'),
    "open New Agent modal",
  );
  const agentHandleInput = await element(
    base,
    sessionId,
    '[data-testid="modal-agent-handle"]',
  );
  await replaceValue(base, sessionId, agentNameInput, agentName);
  await replaceValue(base, sessionId, agentHandleInput, agentKey);
  const createAgent = await element(
    base,
    sessionId,
    '[data-testid="modal-create-agent"]',
  );
  assert.equal(
    await request(base, `/session/${sessionId}/element/${createAgent}/enabled`),
    true,
  );
  await click(base, sessionId, '[data-testid="modal-create-agent"]');
  await eventually(async () => {
    const profile = JSON.parse(
      await readFile(
        path.join(fixture.agentProfileDir, "01_profile.json"),
        "utf8",
      ),
    );
    await access(path.join(fixture.agentProfileDir, "00_origin.md"));
    await access(fixture.agentNotesPath);
    assert.equal(profile.profileKey, agentKey);
    assert.equal(profile.name, agentName);
    assert.equal(
      profile.canonicalNotesPath,
      `docs/agent-profiles/${agentKey}/NOTES.md`,
    );
    assert.match(await bodyText(base, sessionId), /RadControl E2E Agent/);
  }, "create governed Agent profile inside the isolated root");
  await click(base, sessionId, `[data-testid="agent-row-${agentKey}"]`);
  const agentNotes = await eventually(
    () => element(base, sessionId, '[data-testid="agent-notes"]'),
    "load isolated Agent note",
  );
  await replaceValue(
    base,
    sessionId,
    agentNotes,
    "Temporary Agent E2E note.\nE2E agent autosave probe",
  );
  await eventually(async () => {
    assert.match(
      await readFile(fixture.agentNotesPath, "utf8"),
      /E2E agent autosave probe/,
    );
  }, "persist Agent autosave into the isolated O2 root");

  await click(base, sessionId, '[data-testid="tab-projects"]');
  await click(base,sessionId,'[aria-label="Projects workspaces"] button:nth-child(2)');
  await eventually(async()=>assert.match(await bodyText(base,sessionId),/LOCAL TOOLS[\s\S]*Docker[\s\S]*Agent \/ MCP Surfaces/), "render retained Local Tools");
  await click(base, sessionId, '[data-testid="infrastructure-row-docker"]');
  const newInfrastructure = await eventually(
    () => element(base, sessionId, '[data-testid="new-infrastructure"]'),
    "find New Infrastructure",
  );
  await eventually(async () => {
    assert.equal(
      await request(
        base,
        `/session/${sessionId}/element/${newInfrastructure}/enabled`,
      ),
      true,
    );
  }, "enable New Infrastructure");
  await click(base, sessionId, '[data-testid="new-infrastructure"]');
  const infrastructureLabelInput = await eventually(
    () => element(base, sessionId, '[data-testid="modal-infrastructure-label"]'),
    "open New Infrastructure modal",
  );
  await replaceValue(
    base,
    sessionId,
    infrastructureLabelInput,
    infrastructureLabel,
  );
  const createInfrastructure = await element(
    base,
    sessionId,
    '[data-testid="modal-create-infrastructure"]',
  );
  assert.equal(
    await request(
      base,
      `/session/${sessionId}/element/${createInfrastructure}/enabled`,
    ),
    true,
  );
  await click(base, sessionId, '[data-testid="modal-create-infrastructure"]');
  await eventually(async () => {
    const inventory = JSON.parse(
      await readFile(
        path.join(fixture.infrastructureRecordDir, "01_inventory.json"),
        "utf8",
      ),
    );
    await access(path.join(fixture.infrastructureRecordDir, "00_origin.md"));
    assert.equal(inventory.assetKey, infrastructureKey);
    assert.equal(inventory.provider, infrastructureProfileKey);
    assert.equal(
      inventory.canonicalNotesPath,
      `docs/infrastructure/assets/${infrastructureProfileKey}/NOTES.md`,
    );
    assert.match(await bodyText(base, sessionId), /RadControl E2E Local Tool/);
  }, "create governed Infrastructure record inside the isolated root");
  await click(
    base,
    sessionId,
    `[data-testid="infrastructure-row-${infrastructureProfileKey}"]`,
  );
  const infrastructureNotes = await eventually(
    () => element(base, sessionId, '[data-testid="infrastructure-notes"]'),
    "load isolated Infrastructure note",
  );
  await replaceValue(
    base,
    sessionId,
    infrastructureNotes,
    "Temporary Infrastructure E2E note.\nE2E infrastructure autosave probe",
  );
  await eventually(async () => {
    assert.match(
      await readFile(fixture.infrastructureNotesPath, "utf8"),
      /E2E infrastructure autosave probe/,
    );
  }, "persist Infrastructure autosave into the isolated O2 root");

  // This isolated fixture starts with no Guardian history. Seed one explicit
  // test observation so history geometry never depends on workstation state.
  const seedObservation=spawnSync('python3',['-c',`
from o2_sentinel import append_event
from datetime import datetime, timezone
stamp=datetime.now(timezone.utc).isoformat()
for index in range(2):
    append_event({'id':'native-history-fixture-'+str(index),'timestamp':stamp,'guardian':'host','type':'host.health-check','source':'fixture','severity':'attention','observedValues':{'scanKind':'full','findings':[{'findingKey':'metric:thermal','kind':'thermal','key':'thermal','title':'Test thermal observation','status':'attention','reason':'Isolated native history fixture '+str(index)}],'snapshot':{'metrics':{'thermal':{'status':'attention','observedAt':stamp,'value':[{'temperatureC':102+index,'label':'Fixture CPU'}]}}}}})
`],{encoding:'utf8',env:{...process.env,O2_ROOT_OVERRIDE:fixture.o2Root,PYTHONPATH:path.join(fixture.o2Root,'scripts'),PYTHONDONTWRITEBYTECODE:'1'}});
  assert.equal(seedObservation.status,0,seedObservation.stderr);
  await click(base, sessionId, '[data-testid="tab-sentinel"]');
  await eventually(async () => assert.match(await bodyText(base, sessionId), /CURRENT NOW/), "load current Sentinel presentation");
  assertGuardianActivityGeometry(await guardianActivityGeometry(base, sessionId), 'debug native episode rows', {desktop:true});
  await assertSentinelRawEvidence(base, sessionId, selector => click(base, sessionId, selector));
  await assertSentinelDetails(base,sessionId,false);
  await click(base,sessionId,'.sentinelAdvancedWorkspace > summary');
  await assertSentinelDetails(base,sessionId,true);
  const securityText = await eventually(() => bodyText(base, sessionId), "render Security control room");
  assert.match(securityText, /RADCON SENTINEL/);
  assert.match(securityText, /Empire Operations/i);
  assert.match(securityText, /Security Guardian/i);
  assert.match(securityText, /Is my computer okay\?/);
  assert.match(securityText, /CURRENT NOW/);
  assert.match(securityText, /RECENT EVENTS/);
  assert.match(securityText, /ADVANCED SYSTEM INFORMATION/);
  assert.ok(securityText.indexOf("CURRENT NOW") < securityText.indexOf("RECENT EVENTS"));
  assert.match(securityText, /Fans are loud/);
  assert.doesNotMatch(securityText, /QUICK ANSWERS|DIAGNOSTICS/);
  for (const heading of ["SYSTEM EVIDENCE", "MAINTENANCE & UPDATES", "AUTOMATION", "WORKSTATION RECORD & NOTES", "SAFETY & PERMISSIONS"]) assert.ok(securityText.includes(heading), `Security advanced area ${heading} is missing`);
  assert.doesNotMatch(securityText, /Advanced evidence, controls, and workstation records/);
  await click(base, sessionId, '[data-testid="sentinel-health-check"]');
  await eventually(async () => {
    const text = await bodyText(base, sessionId);
    assert.match(text, /Full host scan evidence refreshed/);
    assert.match(text, /GPU TEMPERATURE/i);
    assert.match(text, /Foreground reading/);
    assert.match(text, /SYSTEM EVIDENCE/);
    assert.match(text, /AUTOMATION/);
  }, "run a real read-only Host Guardian check", 30_000);
  const durableStatus = await element(base, sessionId, '[data-testid="sentinel-status-header"]');
  const durableStatusText = await elementProperty(base, sessionId, durableStatus, "textContent");
  await assertSentinelHealth(base, sessionId);
  assert.doesNotMatch(durableStatusText, /LAST FULL SCAN|NEXT FULL SCAN|FULL-SCAN FINDING/i);
  await click(base, sessionId, '[data-testid="sentinel-fans-loud"]');
  await eventually(async () => {
    const text = await bodyText(base, sessionId);
    assert.match(text, /DIAGNOSIS COMPLETE[\s\S]*(NO ISSUE FOUND|WATCHING|UNKNOWN|FIX AVAILABLE|NEEDS YOUR HELP|FIXED|STILL PRESENT)/);
    assert.match(text, /Scan:[\s\S]*Duration:[\s\S]*Repair ran: NO[\s\S]*Process context[\s\S]*NEXT STEP/);
    assert.match(text, /Fans are loud[\s\S]*Run Full Scan/);
  }, "retain a structured Sentinel diagnosis result", 45_000);
  const hostObservationRow = await eventually(
    () => element(base, sessionId, '[data-testid="guardian-activity-row"]'),
    "render the durable Host Guardian observation",
  );
  assert.match(await elementProperty(base, sessionId, hostObservationRow, "textContent"), /observations|Observed/);
  assert.doesNotMatch(await elementProperty(base, sessionId, hostObservationRow, "textContent"), /No recorded anomaly/);

  await request(base, `/session/${sessionId}/window/rect`, "POST", { width: 1100, height: 900 });
  const moderateActivity = await guardianResponsiveGeometry(base, sessionId);
  assert.ok(moderateActivity.viewportWidth <= 1100, "E2E window must reach the moderate Guardian Activity breakpoint");
  assertResponsiveGuardianRow(moderateActivity, "moderate Guardian Activity");

  await request(base, `/session/${sessionId}/window/rect`, "POST", { width: 600, height: 900 });
  const smallActivity = await guardianResponsiveGeometry(base, sessionId);
  assert.ok(smallActivity.viewportWidth <= 760, "E2E window must reach the small Guardian Activity breakpoint");
  assertResponsiveGuardianRow(smallActivity, "small Guardian Activity");
  for (let index = 1; index < smallActivity.cells.length; index += 1) {
    assert.ok(smallActivity.cells[index].top >= smallActivity.cells[index - 1].bottom - 1, "small Guardian Activity fields must form one non-overlapping column");
  }
  if (process.env.RADCONTROL_E2E_SCREENSHOT_PATH) {
    const encodedScreenshot = await request(base, `/session/${sessionId}/screenshot`);
    await writeFile(`${process.env.RADCONTROL_E2E_SCREENSHOT_PATH}.sentinel-narrow.png`, Buffer.from(encodedScreenshot, "base64"));
  }
  await request(base, `/session/${sessionId}/window/rect`, "POST", { width: 1650, height: 1000 });

  await click(base, sessionId, '[data-testid="security-mode-security_guardian"]');
  assert.match(await eventually(() => bodyText(base, sessionId), "render Security Guardian workspace"), /Online technology estate/i);
  await domClick(base, sessionId, '[data-testid="security-guardian-check"]');
  await eventually(async () => {
    const text = await bodyText(base, sessionId);
    assert.match(text, /NOT CONNECTED YET/i);
    assert.match(text, /Lock Down RCE/);
    assert.match(text, /0 live read-only adapters/i);
  }, "run a real read-only Security Guardian check", 30_000);
  if (process.env.RADCONTROL_E2E_SCREENSHOT_PATH) {
    const encodedScreenshot = await request(base, `/session/${sessionId}/screenshot`);
    await writeFile(
      `${process.env.RADCONTROL_E2E_SCREENSHOT_PATH}.security-guardian.png`,
      Buffer.from(encodedScreenshot, "base64"),
    );
  }
  await click(base, sessionId, '[data-testid="security-mode-empire_operations"]');
  const operationsText = await eventually(() => bodyText(base, sessionId), "render Empire Operations truth overview");
  assert.match(operationsText, /Development-system integrity/);
  assert.match(operationsText, /SOURCE GOLDEN/);
  assert.match(operationsText, /CI \+ CODEQL/);
  if (process.env.RADCONTROL_E2E_SCREENSHOT_PATH) {
    const encodedScreenshot = await request(base, `/session/${sessionId}/screenshot`);
    await writeFile(
      `${process.env.RADCONTROL_E2E_SCREENSHOT_PATH}.empire-operations.png`,
      Buffer.from(encodedScreenshot, "base64"),
    );
  }
  await click(base, sessionId, '[data-testid="security-mode-sentinel"]');
  await eventually(async () => assert.match(await bodyText(base, sessionId), /Is my computer okay\?/), "return to Radcon Sentinel for visual acceptance");
  if (process.env.RADCONTROL_E2E_SCREENSHOT_PATH) {
    const encodedScreenshot = await request(base, `/session/${sessionId}/screenshot`);
    await writeFile(
      `${process.env.RADCONTROL_E2E_SCREENSHOT_PATH}.sentinel.png`,
      Buffer.from(encodedScreenshot, "base64"),
    );
  }

  await click(base, sessionId, '[data-testid="tab-projects"]');
  await click(base,sessionId,'[aria-label="Projects workspaces"] button:nth-child(2)');
  const infrastructureText = await eventually(
    () => bodyText(base, sessionId),
    "reopen Local Tools after Security",
  );
  assert.doesNotMatch(infrastructureText, /System76 Workstation/);
  assert.match(infrastructureText, /Docker/);

  await click(base, sessionId, '[data-testid="tab-projects"]');

  await click(base,sessionId,'[aria-label="Projects workspaces"] button:nth-child(1)');
  await click(base, sessionId, '[data-testid="new-project"]');
  const nameInput = await eventually(() => element(base, sessionId, '[data-testid="modal-project-name"]'), "open New Project modal");
  await replaceValue(base, sessionId, nameInput, "RadControl E2E Draft");
  await eventually(async () => {
    const repo = await element(base, sessionId, '[data-testid="modal-project-repo"]');
    assert.equal(await elementText(base, sessionId, repo), fixture.createdProjectRepo);
  }, "apply the isolated governed project root");
  const intentAnswers = [
    ["modal-project-purpose", "Build a disposable governed desktop formation fixture."],
    ["modal-project-users", "RadControl acceptance operators"],
    ["modal-project-problem", "The native questionnaire and O2 formation boundary need one acceptance path."],
    ["modal-project-value", "Prove the reviewed intent reaches the generated repository unchanged."],
    ["modal-project-success", "The exact reviewed intent is present in the bootstrapped REPO_STATE."],
  ];
  for (const [testId, answer] of intentAnswers) {
    const input = await element(base, sessionId, `[data-testid="${testId}"]`);
    await replaceValue(base, sessionId, input, answer);
  }
  await click(base, sessionId, '[data-testid="modal-review-project"]');
  await eventually(
    () => element(base, sessionId, '[data-testid="modal-project-review"]'),
    "render the O2 Project Intent review",
  );
  const buildButton = await element(base, sessionId, '[data-testid="modal-build-project"]');
  assert.equal(await request(base, `/session/${sessionId}/element/${buildButton}/enabled`), true);
  await click(base, sessionId, '[data-testid="modal-build-project"]');
  await eventually(async () => {
    const text = await bodyText(base, sessionId);
    const builderError = text.match(/(?:formation rejected|project build could not start|repoPath must stay under)[^\n]*/i)?.[0];
    if (builderError) throw new Error(builderError);
    await access(path.join(fixture.createdProjectRepo, "site", "index.html"));
    await access(path.join(fixture.createdProjectRepo, "docs", "project-formation", "00_bootstrap_intake.json"));
    await access(path.join(fixture.o2Root, "docs", "project-formation", "records", createdProjectKey, "00_intake.json"));
    const registry = JSON.parse(await readFile(path.join(fixture.o2Root, "registry", "projects.json"), "utf8"));
    const result=JSON.parse(await readFile(path.join(fixture.o2Root,'docs/project-formation/records',createdProjectKey,'04_bootstrap_result.json'),'utf8'));
    assert.equal(result.ok,true,`fixture bootstrap did not pass: ${result.error || result.state}`);
    const acceptance=JSON.parse(await readFile(path.join(fixture.o2Root,'docs/project-formation/records',createdProjectKey,'05_bootstrap_acceptance.json'),'utf8'));
    assert.equal(acceptance.ok,true);
    assert.equal(acceptance.checks.browser.proofKind,'fixture-adapter');
    const created = registry.find((project) => project.key === createdProjectKey);
    assert.equal(created?.repoPath, fixture.createdProjectRepo);
  }, "build a project entirely inside the isolated root", 30_000);
  await eventually(async()=>assert.equal(await request(base,`/session/${sessionId}/execute/sync`,'POST',{script:'return document.querySelectorAll("[data-testid=modal-close]").length;',args:[]}),0),'successful build closes modal');
  assert.match(await eventually(() => bodyText(base, sessionId), "render created project"), /RadControl E2E Draft/);

  await click(base, sessionId, `[data-testid="project-row-${fixtureKey}"]`);
  const notes = await eventually(() => element(base, sessionId, '[data-testid="project-notes"]'), "load isolated fixture note");
  await replaceValue(base, sessionId, notes, "Temporary E2E fixture note.\nE2E autosave probe");
  await eventually(async () => {
    assert.match((await readWork()).data.projectNotes.find(n => n.id === fixtureKey).content, /E2E autosave probe/);
  }, "persist autosave into isolated O2 root");

  await eventually(async () => {
    const status = await request(base, `/session/${sessionId}/execute/sync`, "POST", {script:'return document.querySelector("[data-testid=project-notes]").parentElement.innerText;', args:[]});
    assert.match(status, /Saved/); assert.doesNotMatch(status, /1970|date unknown/);
  }, "Project Notes displays a valid Saved date after actual fixture autosave");
  await runWave11Acceptance({fixture,base,sessionId,request,click,eventually});
  // Current-registry read-only review is a separate session; writable fixtures
  // retain only synthetic repository roots and never include the host registry.
  await request(base, `/session/${sessionId}`, "DELETE");
  sessionId = null;
  await rename(path.join(fixture.o2Root,'scripts/run_o2.actual.sh'),path.join(fixture.o2Root,'scripts/run_o2.sh'));
  const registrySource=path.join(sourceO2Root,'registry/projects.json');
  const registryDigest=await sha256File(registrySource);
  const roster=spawnSync('bash',[path.join(sourceO2Root,'scripts/run_o2.sh'),'list_projects'],
    {encoding:'utf8',env:{...process.env,O2_ROOT_OVERRIDE:sourceO2Root},timeout:60_000,maxBuffer:4*1024*1024});
  assert.equal(roster.status,0,'independent current O2 roster must succeed');
  const payload=JSON.parse(roster.stdout);
  assert.equal(payload.ok,true);
  const projects=payload.projects.filter(p=>!['governance','local-control-plane'].includes(p.archetype));
  for(const key of ['radcloud','radcalendar','dqotd','radstock'])assert.equal(projects.filter(p=>p.key===key).length,1,`current registry must contain ${key} exactly once`);
  const reviewApp=await createBubblewrapApplication({app,tempRoot:fixture.tempRoot,home:fixture.e2eHome,
    xdgCacheHome:fixture.xdgCacheHome,xdgConfigHome:fixture.xdgConfigHome,xdgDataHome:fixture.xdgDataHome,
    overlays:[{source:fixture.dconfOverlay,destination:`/run/user/${process.getuid()}/dconf`}],
    readOnlyFiles:[{source:registrySource,destination:path.join(fixture.o2Root,'registry/projects.json')}],
    environment:{O2_ROOT:fixture.o2Root,RADCONTROL_E2E:'1',O2_E2E_HOME:fixture.e2eHome}});
  sessionId=await startDesktopSession(base,reviewApp);
  configureWorkspace(base,sessionId,{evidenceDir:path.join(fixture.tempRoot,'navigation'),fixture:{kind:'current-registry-readonly'}});
  try {
    await assertFourTabApplication({base,sessionId,eventually,projects});
  } finally { assert.equal(await sha256File(registrySource),registryDigest,'current registry changed during read-only review'); }
  console.error('[e2e] current-registry read-only: exact roster and paths, RadCloud once beside RadCalendar/DQOTD/RadStock');
  console.error("[e2e] passed: four tabs, private Notes restart/autosave, Agents, Local Tools creation/autosave, Project Notes/bootstrap, native bridge and Sentinel matrix");
  }
} catch (error) {
  if (sessionId) {
    const renderedText = await bodyText(base, sessionId).catch(() => "<body unavailable>");
    console.error(`[e2e] rendered body at failure:\n${renderedText.slice(0, 4_000)}`);
    if (process.env.RADCONTROL_E2E_SCREENSHOT_PATH) {
      const encodedScreenshot = await request(base, `/session/${sessionId}/screenshot`).catch(() => null);
      if (encodedScreenshot) {
        await writeFile(
          `${process.env.RADCONTROL_E2E_SCREENSHOT_PATH}.failure.png`,
          Buffer.from(encodedScreenshot, "base64"),
        );
      }
    }
  }
  const registryAtFailure = await readFile(
    path.join(fixture.o2Root, "registry", "projects.json"),
    "utf8",
  ).catch(() => "<registry unavailable>");
  console.error(`[e2e] projects registry at failure:\n${registryAtFailure.slice(0, 8_000)}`);
  throw error;
} finally {
  await cleanup();
}

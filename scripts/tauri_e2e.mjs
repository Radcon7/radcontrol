import assert from "node:assert/strict";
import { access, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
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
  snapshotInstalledO2,
  tcpListeners,
} from "./native_acceptance_lib.mjs";

const fixtureKey = "radcontrol-e2e-fixture";
const createdProjectKey = "radcontrol-e2e-draft";
const agentName = "RadControl E2E Agent";
const agentKey = "radcontrol-e2e-agent";
const infrastructureLabel = "RadControl E2E Infrastructure";
const infrastructureKey = "radcontrol-e2e-infrastructure-domain-edge";
const infrastructureProfileKey = "cloudflare";
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
    cp(path.join(sourceO2Root, "docs", "reusable-patterns"), path.join(o2Root, "docs", "reusable-patterns"), { recursive: true }),
    cp(path.join(sourceO2Root, "docs", "decisions"), path.join(o2Root, "docs", "decisions"), { recursive: true }),
    cp(path.join(sourceO2Root, "docs", "O2_OPERATIONAL_PLAYBOOK.md"), path.join(o2Root, "docs", "O2_OPERATIONAL_PLAYBOOK.md")),
    cp(path.join(sourceO2Root, "docs", "CURRENT_DOCTRINE.md"), path.join(o2Root, "docs", "CURRENT_DOCTRINE.md")),
  ]);
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

async function activateCompletionCheckbox(base, sessionId, title) {
  const selector = `[aria-label="Complete ${title}"]`;
  const checkbox = await element(base, sessionId, selector);
  assert.equal(await request(base, `/session/${sessionId}/element/${checkbox}/enabled`), true, `completion checkbox for ${title} is enabled`);
  await click(base, sessionId, selector);
  try {
    await eventually(() => element(base, sessionId, '[data-testid="empire-todo-complete-without-timeline"]'), `open ${title} completion dialog by native WebDriver click`, 1_500);
    return "webdriver";
  } catch {
    const result = await request(base, `/session/${sessionId}/execute/sync`, "POST", {
      script: "if (!arguments[0].matches(':enabled')) throw new Error('checkbox disabled'); arguments[0].click(); return { checked: arguments[0].checked, type: arguments[0].type };",
      args: [{ "element-6066-11e4-a52e-4f735466cecf": checkbox }],
    });
    assert.equal(result.type, "checkbox");
    await eventually(() => element(base, sessionId, '[data-testid="empire-todo-complete-without-timeline"]'), `open ${title} completion dialog by DOM click on the real checkbox`);
    return "dom-click";
  }
}

async function activateView(base, sessionId, view, expectedSelector) {
  const selector = `[data-testid="empire-todo-${view}-view"]`;
  const control = await element(base, sessionId, selector);
  assert.equal(await request(base, `/session/${sessionId}/element/${control}/enabled`), true, `${view} view control is enabled`);
  const selected = () => request(base, `/session/${sessionId}/execute/sync`, "POST", { script: "return arguments[0].getAttribute('aria-pressed');", args: [{ "element-6066-11e4-a52e-4f735466cecf": control }] });
  await click(base, sessionId, selector);
  try {
    await eventually(async () => assert.equal(await selected(), "true"), `open ${view} view by native WebDriver click`, 1_500);
  } catch {
    await request(base, `/session/${sessionId}/execute/sync`, "POST", {
      script: "if (!arguments[0].matches(':enabled')) throw new Error('view control disabled'); arguments[0].click(); return arguments[0].textContent;",
      args: [{ "element-6066-11e4-a52e-4f735466cecf": control }],
    });
    await eventually(async () => assert.equal(await selected(), "true"), `open ${view} view by DOM click on the real button`);
  }
  await eventually(() => element(base, sessionId, expectedSelector), `render ${view} view contents`);
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
  await request(base, `/session/${sessionId}/element/${id}/clear`, "POST", {});
  await request(base, `/session/${sessionId}/element/${id}/value`, "POST", { text });
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
await assertWritableFixtureIsolation(fixture);
const installedBefore = await snapshotInstalledO2();
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
try {
  console.error("[e2e] waiting for isolated desktop session");
  await eventually(() => request(base, "/status"), "start tauri-driver");
  sessionId = await startDesktopSession(base, sandboxedApp);

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

  await click(base, sessionId, '[data-testid="tab-notes"]');
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
  const [empireBlueprintMode, empireTodoMode] = await Promise.all([
    eventually(
      () => element(base, sessionId, '[data-testid="notes-mode-empire_blueprint"]'),
      "render Empire Blueprint mode",
    ),
    eventually(
      () => element(base, sessionId, '[data-testid="notes-mode-empire_todo"]'),
      "render Empire To-Do mode",
    ),
  ]);
  const [blueprintRect, todoRect] = await Promise.all([
    elementRect(base, sessionId, empireBlueprintMode),
    elementRect(base, sessionId, empireTodoMode),
  ]);
  assert.ok(
    todoRect.x > blueprintRect.x,
    "Empire To-Do must render to the right of Empire Blueprint",
  );
  await click(base, sessionId, '[data-testid="notes-mode-empire_todo"]');
  await eventually(
    async () => assert.match(
      await bodyText(base, sessionId),
      /EMPIRE TO-DO[\s\S]*NOW[\s\S]*BUSINESS FOUNDATION[\s\S]*CONTROL PLANE[\s\S]*DQOTD LAUNCH \/ PREMIUM[\s\S]*COMMERCIAL PROOF/,
    ),
    "render Empire To-Do operating sequence",
  );
  const empireTodoNotes = await element(base, sessionId, '[aria-label="Notes for DQOTD Dinosaur Content"]');
  const todoProbe = "E2E roadmap draft survives governed persistence";
  await replaceValue(base, sessionId, empireTodoNotes, todoProbe);
  await eventually(async () => {
    const todoPayload = JSON.parse(await readFile(fixture.empireTodoPath, "utf8"));
    const dinosaurItem = todoPayload.items.find((item) => item.id === "dqotd-dinosaur-content");
    assert.match(dinosaurItem?.notes || "", new RegExp(todoProbe));
    assert.equal(todoPayload.items.filter((item) => item.id === "dqotd-dinosaur-content").length, 1);
  }, "persist Empire To-Do fields before switching items");
  const completionModes = [];
  completionModes.push(await activateCompletionCheckbox(base, sessionId, "DQOTD Dinosaur Content"));
  await eventually(async () => assert.match(await bodyText(base, sessionId), /Complete “DQOTD Dinosaur Content”[\s\S]*Cancel[\s\S]*Complete without Timeline[\s\S]*Add to Timeline/), "render completion dialog for Cancel");
  await click(base, sessionId, '.notesModalCard .btnGhost');
  await eventually(async () => {
    const todoPayload = JSON.parse(await readFile(fixture.empireTodoPath, "utf8"));
    assert.equal(todoPayload.items.find((item) => item.id === "dqotd-dinosaur-content")?.status, "In Progress");
    assert.equal((await readdir(fixture.timelineDir)).length, 0);
  }, "Cancel keeps deterministic task active without a Timeline event");
  completionModes.push(await activateCompletionCheckbox(base, sessionId, "DQOTD Dinosaur Content"));
  await click(base, sessionId, '[data-testid="empire-todo-complete-without-timeline"]');
  await eventually(async () => {
    const todoPayload = JSON.parse(await readFile(fixture.empireTodoPath, "utf8"));
    assert.equal(todoPayload.items.find((item) => item.id === "dqotd-dinosaur-content")?.status, "Complete");
    assert.equal((await readdir(fixture.timelineDir)).length, 0);
  }, "Complete without Timeline persists only the task completion");
  await activateView(base, sessionId, "completed", '[data-testid="empire-todo-item-dqotd-dinosaur-content"]');
  await eventually(() => element(base, sessionId, '[data-testid="empire-todo-item-dqotd-dinosaur-content"]'), "show completed Empire To-Do history");
  await activateView(base, sessionId, "active", '[data-testid="empire-todo-item-dqotd-7d-acceptance"]');
  await assert.rejects(
    () => element(base, sessionId, '[data-testid="empire-todo-item-dqotd-dinosaur-content"]'),
    /POST \/session\//,
  );
  const timelineTask = "RadControl Operator Cockpit";
  completionModes.push(await activateCompletionCheckbox(base, sessionId, timelineTask));
  await click(base, sessionId, '[data-testid="empire-todo-complete-with-timeline"]');
  const timelineFile = await eventually(async () => {
    const names = await readdir(fixture.timelineDir);
    assert.equal(names.length, 1, "exactly one Timeline milestone is created");
    const file = path.join(fixture.timelineDir, names[0]);
    const content = await readFile(file, "utf8");
    assert.match(content, /title: "RadControl Operator Cockpit completed"/);
    assert.match(content, /date: "\d{4}-\d{2}-\d{2}"/);
    assert.doesNotMatch(content, new RegExp(todoProbe));
    return file;
  }, "Add to Timeline creates one bounded milestone without copying task scratch notes");
  await activateView(base, sessionId, "completed", '[data-testid="empire-todo-item-dqotd-dinosaur-content"]');
  await eventually(() => element(base, sessionId, '[data-testid="empire-todo-item-radcontrol-operator-cockpit"]'), "show Timeline-completed task in completed history");
  await request(base, `/session/${sessionId}`, "DELETE");
  sessionId = await startDesktopSession(base, sandboxedApp);
  await eventually(async () => assert.match(await bodyText(base, sessionId), /RadControl[\s\S]*Projects/), "restart isolated RadControl");
  await click(base, sessionId, '[data-testid="tab-notes"]');
  await eventually(async () => assert.match(
    await elementProperty(base, sessionId, await element(base, sessionId, '[data-testid="my-notes-input"]'), "value"),
    new RegExp(myNotesProbe),
  ), "reload My Note after native restart");
  await click(base, sessionId, '[data-testid="notes-mode-empire_todo"]');
  await click(base, sessionId, '[data-testid="empire-todo-completed-view"]');
  await eventually(() => element(base, sessionId, '[data-testid="empire-todo-item-dqotd-dinosaur-content"]'), "reload completed Empire To-Do item after native restart");
  await eventually(async () => {
    const todoPayload = JSON.parse(await readFile(fixture.empireTodoPath, "utf8"));
    assert.equal(todoPayload.items.filter((item) => item.id === "dqotd-dinosaur-content").length, 1);
    assert.equal(todoPayload.items.find((item) => item.id === "radcontrol-operator-cockpit")?.status, "Complete");
    assert.equal((await readdir(fixture.timelineDir)).length, 1);
    await access(timelineFile);
  }, "preserve one Empire To-Do item after native restart");
  assert.ok(completionModes.length === 3 && completionModes.every((mode) => mode === "webdriver" || mode === "dom-click"), "completion dialogs used a real enabled checkbox control");
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

  await click(base, sessionId, '[data-testid="tab-infrastructure"]');
  assert.match(
    await eventually(() => bodyText(base, sessionId), "render Infrastructure"),
    /INFRASTRUCTURE ASSETS/,
  );
  await click(base, sessionId, '[data-testid="infrastructure-row-cloudflare"]');
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
    assert.match(await bodyText(base, sessionId), /RadControl E2E Infrastructure/);
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

  await click(base, sessionId, '[data-testid="tab-sentinel"]');
  assert.match(
    await eventually(() => bodyText(base, sessionId), "render Security command center"),
    /HOST GUARDIAN/,
  );
  assert.match(await bodyText(base, sessionId), /Level 0 — Observation/);
  assert.match(await bodyText(base, sessionId), /Level 5 — Recovery/);
  await click(base, sessionId, '[data-testid="sentinel-health-check"]');
  await eventually(async () => {
    const text = await bodyText(base, sessionId);
    assert.match(text, /Host health evidence refreshed/);
    assert.match(text, /ACTIVE · READ ONLY/);
  }, "run a real read-only Host Guardian check", 30_000);
  const hostActionRow = await eventually(
    () => element(base, sessionId, '[data-testid="sentinel-activity"] [data-kind="action"]'),
    "render the real Host Guardian action record",
  );
  assert.match(await elementProperty(base, sessionId, hostActionRow, "textContent"), /host inspect health/i);
  await domClick(base, sessionId, '[data-testid="sentinel-security-check"]');
  await eventually(async () => {
    const text = await bodyText(base, sessionId);
    assert.match(text, /NOT CONFIGURED/);
    assert.match(text, /Security inventory refreshed/);
  }, "run a real read-only Security Guardian check", 30_000);
  const securityActionRow = await eventually(
    () => element(base, sessionId, '[data-testid="sentinel-activity"] [data-kind="action"]'),
    "render the real Security Guardian action record",
  );
  assert.match(
    await elementProperty(base, sessionId, securityActionRow, "textContent"),
    /security inspect inventory/i,
  );
  if (process.env.RADCONTROL_E2E_SCREENSHOT_PATH) {
    const encodedScreenshot = await request(base, `/session/${sessionId}/screenshot`);
    await writeFile(
      process.env.RADCONTROL_E2E_SCREENSHOT_PATH,
      Buffer.from(encodedScreenshot, "base64"),
    );
  }

  await click(base, sessionId, '[data-testid="tab-infrastructure"]');
  const infrastructureText = await eventually(
    () => bodyText(base, sessionId),
    "reopen Infrastructure after Security",
  );
  assert.doesNotMatch(infrastructureText, /System76 Workstation/);
  assert.match(infrastructureText, /Cloudflare/);

  await click(base, sessionId, '[data-testid="tab-projects"]');

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
    const created = registry.find((project) => project.key === createdProjectKey);
    assert.equal(created?.repoPath, fixture.createdProjectRepo);
  }, "build a project entirely inside the isolated root", 30_000);
  assert.match(await eventually(() => bodyText(base, sessionId), "render created project"), /RadControl E2E Draft/);

  await click(base, sessionId, `[data-testid="project-row-${fixtureKey}"]`);
  const notes = await eventually(() => element(base, sessionId, '[data-testid="project-notes"]'), "load isolated fixture note");
  await replaceValue(base, sessionId, notes, "Temporary E2E fixture note.\nE2E autosave probe");
  await eventually(async () => {
    assert.match(await readFile(fixture.notesPath, "utf8"), /E2E autosave probe/);
  }, "persist autosave into isolated O2 root");

  console.error("[e2e] passed: My Notes create/edit/restart/delete, O2 Knowledge read-only projection, Todo persistence, Security read-only checks, Infrastructure migration, governed creation/autosave, and project bootstrap");
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
  if (sessionId) await request(base, `/session/${sessionId}`, "DELETE").catch(() => {});
  await stopChild(driver);
  await rm(fixture.tempRoot, { recursive: true, force: true });
  await assertInstalledO2Unchanged(installedBefore);
  const listenersAfter = tcpListeners();
  assertPortAbsent(listenersAfter, 1420);
  assertNoNewTcpListeners(listenersBefore, listenersAfter);
}

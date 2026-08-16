import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [launcher, desktop, installer, bridge, app, projects, infrastructure, todo, config, agentRules, repoState] = await Promise.all([
  readFile(new URL("../packaging/radcontrol-launch.sh", import.meta.url), "utf8"),
  readFile(new URL("../packaging/radcontrol.desktop", import.meta.url), "utf8"),
  readFile(new URL("../scripts/install_production.sh", import.meta.url), "utf8"),
  readFile(new URL("../src-tauri/src/commands/o2.rs", import.meta.url), "utf8"),
  readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/projects/ProjectsTab.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/agents/InfrastructureTab.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/notes/EmpireTodoWorkspace.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
  readFile(new URL("../AGENTS.md", import.meta.url), "utf8"),
  readFile(new URL("../docs/REPO_STATE.md", import.meta.url), "utf8"),
]);

assert.match(launcher, /exec "\$RADCONTROL_BINARY"/);
assert.match(launcher, /\.local\/bin\/radcontrol-app/);
assert.doesNotMatch(launcher, /vite|tauri:dev|radcontrol\.dev_strict|localhost|127\.0\.0\.1/i);
assert.match(desktop, /^Exec=\/home\/chris\/\.local\/bin\/radcontrol-launch\.sh$/m);
assert.doesNotMatch(desktop, /vite|tauri:dev|localhost|127\.0\.0\.1/i);
assert.match(installer, /\.local\/share\/radcontrol\/o2-runtime/);
assert.match(installer, /registry\/project-archetypes\.json/);
assert.match(installer, /scripts\/o2_radcontrol_audit\.py/);
assert.match(installer, /target\/release\/radcontrol-app/);
assert.match(installer, /icons\/hicolor\/128x128\/apps\/radcontrol-app\.png/);
assert.match(bridge, /\.local\/share\/radcontrol\/o2-runtime/);
assert.match(bridge, /pub fn runtime_diagnostics/);
assert.match(bridge, /fn dispatcher_command\(paths: &O2Paths, context: &RuntimeContext, verb: &str\) -> Command/);
assert.match(bridge, /apply_child_environment\(&mut command, &paths\.root/);
assert.match(bridge, /validate_runtime_paths\(&context\)/);
assert.doesNotMatch(app, /Restart RadControl/);
assert.match(projects, /Project data is unavailable\. No empty-state claim is being made\./);
assert.match(infrastructure, /Infrastructure data is unavailable\. No empty-state claim is being made\./);
assert.match(todo, /Empire To-Do data is unavailable\. No empty-state claim is being made\./);
const parsedConfig = JSON.parse(config);
assert.equal(parsedConfig.identifier, "com.radcontrol.app");
assert.notEqual(parsedConfig.identifier, "com.radcontrol.app.dev");
assert.match(agentRules, /pinned to\s+the installed O2 golden that matches the installed RadControl binary/);
assert.match(agentRules, /never advance either installed half\s+independently/);
assert.match(repoState, /823feb9dff9757f63f4eb7fac84fa728d651d1af/);
assert.match(repoState, /c7ec863831c6cf062c4d1af7313f8c97aacf6132/);
assert.match(repoState, /178f222475b4900e57da979afbac61303c7e4c12/);
assert.match(repoState, /Never independently update the\s+installed O2 runtime or installed RadControl binary/);

console.log("production delivery contract: listener-free launcher, stable O2 runtime, and build identity");

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [launcher, desktop, installer, bridge, app, projects, infrastructure, todo, config] = await Promise.all([
  readFile(new URL("../packaging/radcontrol-launch.sh", import.meta.url), "utf8"),
  readFile(new URL("../packaging/radcontrol.desktop", import.meta.url), "utf8"),
  readFile(new URL("../scripts/install_production.sh", import.meta.url), "utf8"),
  readFile(new URL("../src-tauri/src/commands/o2.rs", import.meta.url), "utf8"),
  readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/projects/ProjectsTab.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/agents/InfrastructureTab.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/notes/EmpireTodoWorkspace.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
]);

assert.match(launcher, /exec "\$RADCONTROL_BINARY"/);
assert.match(launcher, /\.local\/bin\/radcontrol-app/);
assert.doesNotMatch(launcher, /vite|tauri:dev|radcontrol\.dev_strict|localhost|127\.0\.0\.1/i);
assert.match(desktop, /^Exec=\/home\/chris\/\.local\/bin\/radcontrol-launch\.sh$/m);
assert.doesNotMatch(desktop, /vite|tauri:dev|localhost|127\.0\.0\.1/i);
assert.match(installer, /\.local\/share\/radcontrol\/o2-runtime/);
assert.match(installer, /target\/release\/radcontrol-app/);
assert.match(installer, /icons\/hicolor\/128x128\/apps\/radcontrol-app\.png/);
assert.match(bridge, /\.local\/share\/radcontrol\/o2-runtime/);
assert.match(bridge, /pub fn runtime_diagnostics/);
assert.equal(
  bridge.match(/\.env\("O2_ROOT", &root\)/g)?.length,
  2,
  "every O2 child process must be pinned to the root selected by the bridge",
);
assert.doesNotMatch(app, /Restart RadControl/);
assert.match(projects, /Project data is unavailable\. No empty-state claim is being made\./);
assert.match(infrastructure, /Infrastructure data is unavailable\. No empty-state claim is being made\./);
assert.match(todo, /Empire To-Do data is unavailable\. No empty-state claim is being made\./);
const parsedConfig = JSON.parse(config);
assert.equal(parsedConfig.identifier, "com.radcontrol.app");
assert.notEqual(parsedConfig.identifier, "com.radcontrol.app.dev");

console.log("production delivery contract: listener-free launcher, stable O2 runtime, and build identity");

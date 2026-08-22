import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const [launcher, desktop, installer, transaction, productionProbe, snapshotScript, gitignore, bridge, app, projects, infrastructure, todo, config, agentRules, repoState, supplyChain] = await Promise.all([
  readFile(new URL("../packaging/radcontrol-launch.sh", import.meta.url), "utf8"),
  readFile(new URL("../packaging/radcontrol.desktop", import.meta.url), "utf8"),
  readFile(new URL("../scripts/install_production.sh", import.meta.url), "utf8"),
  readFile(new URL("../scripts/matched_pair_transaction.py", import.meta.url), "utf8"),
  readFile(new URL("../scripts/tauri_production_readonly.mjs", import.meta.url), "utf8"),
  readFile(new URL("../scripts/snapshot_repo_state.sh", import.meta.url), "utf8"),
  readFile(new URL("../.gitignore", import.meta.url), "utf8"),
  readFile(new URL("../src-tauri/src/commands/o2.rs", import.meta.url), "utf8"),
  readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/projects/ProjectsTab.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/agents/InfrastructureTab.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/notes/EmpireTodoWorkspace.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
  readFile(new URL("../AGENTS.md", import.meta.url), "utf8"),
  readFile(new URL("../docs/REPO_STATE.md", import.meta.url), "utf8"),
  readFile(new URL("../docs/SUPPLY_CHAIN.md", import.meta.url), "utf8"),
]);

assert.match(launcher, /exec "\$RADCONTROL_BINARY"/);
assert.match(launcher, /readonly RADCONTROL_BINARY="\/home\/chris\/\.local\/bin\/radcontrol-app"/);
assert.doesNotMatch(launcher, /\$HOME/);
assert.doesNotMatch(launcher, /vite|tauri:dev|radcontrol\.dev_strict|localhost|127\.0\.0\.1/i);
assert.match(desktop, /^Exec=\/home\/chris\/\.local\/bin\/radcontrol-launch\.sh$/m);
assert.doesNotMatch(desktop, /vite|tauri:dev|localhost|127\.0\.0\.1/i);
assert.match(installer, /Refusing independent RadControl installation/);
assert.match(installer, /one reviewed native-acceptance transaction/);
assert.match(installer, /exit 64/);
assert.doesNotMatch(installer, /\binstall\s+-[Dm]/);
assert.doesNotMatch(installer, /\b(mv|cp)\s/);
const retiredInstaller = spawnSync(
  "bash",
  [fileURLToPath(new URL("../scripts/install_production.sh", import.meta.url))],
  { encoding: "utf8" },
);
assert.equal(retiredInstaller.status, 64);
assert.match(retiredInstaller.stderr, /Refusing independent RadControl installation/);
assert.match(transaction, /class Transaction/);
assert.match(transaction, /def preflight\(self\)/);
assert.match(transaction, /def promote\(self\)/);
assert.match(transaction, /def rollback\(self\)/);
assert.match(transaction, /def reinstall\(self\)/);
assert.match(transaction, /automatic old-pair recovery did not verify/);
assert.match(transaction, /private state contains a symlink/);
assert.match(transaction, /worktree is dirty/);
assert.match(productionProbe, /snapshotInstalledO2/);
assert.match(productionProbe, /createBubblewrapApplication/);
assert.match(productionProbe, /assertInstalledO2Unchanged/);
assert.match(productionProbe, /\^\[a-f0-9\]\{40\}\$/);
assert.match(productionProbe, /text\.includes\(expectedO2Sha\)/);
assert.match(productionProbe, /text\.includes\(expectedRadcontrolSha\)/);
assert.match(productionProbe, /Empire To-Do · 29 durable items/);
assert.match(productionProbe, /grouped current Empire To-Do operating sequence/);
assert.match(productionProbe, /read blocked Empire To-Do dependencies/);
assert.match(productionProbe, /load completed Empire To-Do operator view/);
assert.doesNotMatch(productionProbe, /new RegExp\(expected/);
assert.doesNotMatch(productionProbe, /empire\.todo\.save|files\.write|files\.rename|project_create\.(?:start|bootstrap)/);
assert.match(snapshotScript, /__pycache__/);
assert.match(snapshotScript, /pyc\|pyo/);
assert.match(gitignore, /^__pycache__\/$/m);
assert.match(gitignore, /^\*\.py\[cod\]$/m);
assert.match(bridge, /\.local\/share\/radcontrol\/o2-runtime/);
assert.match(bridge, /pub fn runtime_diagnostics/);
assert.match(bridge, /fn dispatcher_command\(paths: &O2Paths, context: &RuntimeContext, verb: &str\) -> Command/);
assert.match(bridge, /apply_child_environment\(\s*&mut command,\s*&paths\.root,\s*&paths\.temp_dir/);
assert.match(bridge, /validate_runtime_paths\(&context\)/);
assert.match(bridge, /fn redact_sensitive_text/);
assert.match(bridge, /ensure_private_directory/);
assert.doesNotMatch(app, /Restart RadControl/);
assert.match(projects, /Project data is unavailable\. No empty-state claim is being made\./);
assert.match(infrastructure, /Infrastructure data is unavailable\. No empty-state claim is being made\./);
assert.match(todo, /Empire To-Do data is unavailable\. No empty-state claim is being made\./);
const parsedConfig = JSON.parse(config);
assert.equal(parsedConfig.identifier, "com.radcontrol.app");
assert.notEqual(parsedConfig.identifier, "com.radcontrol.app.dev");
assert.match(agentRules, /pinned to\s+the installed O2 golden that matches the installed RadControl binary/);
assert.match(agentRules, /never advance either installed half\s+independently/);
assert.match(repoState, /`SOURCE_GOLDEN` and `INSTALLED_GOLDEN`/);
assert.match(repoState, /compatibility\.json/);
assert.match(repoState, /radcontrol\.golden_state/);
const goldenSection = repoState.match(/## Source and installed goldens([\s\S]*?)## Verification/)?.[1] ?? "";
assert.doesNotMatch(goldenSection, /\b[a-f0-9]{40}\b/);
assert.match(repoState, /Never independently update the\s+installed O2 runtime or installed RadControl\s+binary/);
assert.match(supplyChain, /scripts\/matched_pair_transaction\.py/);
assert.match(supplyChain, /scripts\/tauri_production_readonly\.mjs/);

console.log("production delivery contract: read-only native probe and durable matched-pair transaction");

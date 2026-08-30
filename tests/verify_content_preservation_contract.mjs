import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const [app, agents, routers, security, guardian, operations, notes, legal, css, bridge, authority, repoState] = await Promise.all([
  read("src/App.tsx"),
  read("src/components/agents/AgentsTab.tsx"),
  read("src/components/agents/RouterHealthPanel.tsx"),
  read("src/components/security/SecurityTab.tsx"),
  read("src/components/sentinel/SecurityGuardianTab.tsx"),
  read("src/components/security/EmpireOperationsWorkspace.tsx"),
  read("src/components/paste-tabs/NotesHubTab.tsx"),
  read("src/components/paste-tabs/LegalHubTab.tsx"),
  read("src/App.css"),
  read("src-tauri/src/commands/o2.rs"),
  read("AGENTS.md"),
  read("docs/REPO_STATE.md"),
]);
const manifest = JSON.parse(await read("docs/RADCONTROL_CONTENT_PRESERVATION.json"));
const expectedRegisteredProjects = [
  "o2", "dqotd", "tbis", "offroad", "radstock", "radcrm", "radcontrol",
  "radconenterprises", "radfamily", "radwolfe", "radcalendar",
];
const expectedVisibleProjects = [
  "dqotd", "tbis", "offroad", "radstock", "radcrm", "radconenterprises",
  "radfamily", "radwolfe", "radcalendar",
];
const expectedPreservedInfrastructure = [
  "openai-codex", "cloudflare", "github", "vercel", "supabase", "resend",
  "google-workspace", "dqotd-workspace", "docker", "agent-mcp-surfaces",
];

for (const tab of ["projects", "infrastructure", "agents", "sentinel", "notes", "legal"]) {
  assert.match(app, new RegExp(`"${tab}"`), `primary destination ${tab} must remain registered`);
}
assert.match(app, /sentinel: "Security"/);
assert.match(app, /<SecurityTab/);
assert.doesNotMatch(app, /EmpireUtilityTab|empire_utility/);

assert.match(security, /Radcon Sentinel/);
assert.match(security, /Empire Operations/);
assert.match(security, /Security Guardian/);
assert.match(security, /<SentinelTab/);
assert.match(security, /<EmpireOperationsWorkspace/);
assert.match(security, /<SecurityGuardianTab/);
assert.match(guardian, /PROVIDERS \+ SECURITY SYSTEMS/);
assert.match(guardian, /REGISTERED WEBSITES \+ APPS/);
assert.match(guardian, /Not connected yet/);
for (const [label, verb] of [
  ["Empire Map", "empire.map"],
  ["Snapshot", "radcontrol.snapshot"],
  ["Empire Sweep", "empire.sweep"],
]) {
  assert.match(operations, new RegExp(label));
  assert.match(operations, new RegExp(verb.replaceAll(".", "\\.")));
  if (verb !== "radcontrol.snapshot") {
    assert.match(bridge, new RegExp(`"${verb.replaceAll(".", "\\.")}"`));
  }
}
assert.match(bridge, /enum ProjectAction/);
for (const action of ["dev", "dev_strict", "stop", "snapshot", "map", "proofpack"]) {
  assert.match(bridge, new RegExp(`"${action}" => Some\\(Self::`));
}
assert.equal(existsSync(new URL("src/components/common/useArtifactStore.ts", root)), true);
assert.equal(existsSync(new URL("src/components/empire-utility/EmpireUtilityTab.tsx", root)), false);

assert.match(agents, /Repository Routers/);
assert.match(agents, /<RouterHealthPanel/);
assert.match(routers, /"router\.health"/);
assert.match(bridge, /"router\.health"/);

const notesOrder = ["Empire To-Do", "Timeline", "My Notes", "Empire Blueprint", "O2 Knowledge"];
for (let index = 1; index < notesOrder.length; index += 1) {
  assert.ok(notes.indexOf(`label: "${notesOrder[index - 1]}"`) < notes.indexOf(`label: "${notesOrder[index]}"`));
}

const legalOrder = ["Structure", "Formation", "Addresses & Agent", "Brands & Ventures", "Business Accounts", "Documents & Compliance"];
for (let index = 1; index < legalOrder.length; index += 1) {
  assert.ok(legal.indexOf(`label: "${legalOrder[index - 1]}"`) < legal.indexOf(`label: "${legalOrder[index]}"`));
}
for (const archiveKey of ["legal_notes", "legal_documents", "legal_entity_structure"]) {
  assert.match(legal, new RegExp(archiveKey));
}
assert.deepEqual(manifest.legalModes.map((entry) => entry.final), legalOrder);

for (const className of ["mainArea", "surfaceLayout", "surfaceCommandMain", "workspaceHubBody"]) {
  const match = css.match(new RegExp(`\\.${className}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `missing shared layout rule .${className}`);
  assert.doesNotMatch(
    match[1],
    /display:\s*none|visibility:\s*hidden|(?:^|[;\n])\s*(?:height|max-height):\s*0(?:\D|$)/m,
  );
}

assert.match(authority, /## RadControl content preservation boundary/);
assert.match(authority, /Authorization to remove one asset or replace one destination is not authority/);
assert.match(repoState, /## Content preservation/);
assert.equal(manifest.goldenRadControlCommit, "b1431ac0ac5c4c0e83f794d7558d31ba0f133630");
assert.equal(manifest.empireOperationsSourceCommit, "b94341ce65d87f91f157780902f5ff7384c5dc0b");
assert.deepEqual(manifest.projects.historicalRegisteredKeys, expectedRegisteredProjects);
assert.deepEqual(manifest.projects.historicalVisibleKeys, expectedVisibleProjects);
assert.deepEqual(manifest.projects.historicalRegisteredKeys, manifest.projects.finalRegisteredKeys);
assert.deepEqual(manifest.projects.historicalVisibleKeys, manifest.projects.finalVisibleKeys);
assert.deepEqual(
  manifest.infrastructure
    .filter((entry) => entry.action === "preserved")
    .map((entry) => entry.key),
  expectedPreservedInfrastructure,
);
assert.match(
  manifest.infrastructure.find((entry) => entry.key === "system76-workstation").action,
  /migrated to Host Guardian/i,
);

for (const intentionallyDeleted of [
  "src/components/agents/WorkstationHealthPanel.tsx",
  "src/components/agents/WorkstationOperationsPanel.tsx",
  "src/components/agents/WorkstationUpdatesPanel.tsx",
]) {
  assert.equal(existsSync(new URL(intentionallyDeleted, root)), false);
}
assert.doesNotMatch(bridge, /"workstation\.(cleanup\.apply|updates\.refresh|updates\.open|codex\.review)"/);

console.log("content preservation contract: primary destinations, notes, reports, router health, CSS, and intentional replacements verified");

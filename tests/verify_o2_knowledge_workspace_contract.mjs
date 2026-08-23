import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const [notes, workspace, api, files, bridge] = await Promise.all([
  read("src/components/paste-tabs/NotesHubTab.tsx"),
  read("src/components/notes/O2KnowledgeWorkspace.tsx"),
  read("src/components/notes/o2KnowledgeApi.ts"),
  read("src/components/common/o2Files.ts"),
  read("src-tauri/src/commands/o2.rs"),
]);

for (const label of [
  "Overview", "Project Intent", "Project Registry", "Knowledge Catalog",
  "Playbooks", "Learning Candidates", "Memory", "Skills", "Patterns",
  "Contracts + Decisions", "Empire Rules", "Quality Gates",
]) assert.ok(workspace.includes(label), `missing O2 Knowledge category: ${label}`);

assert.match(notes, /label: "My Notes"/);
assert.match(notes, /operator-authored O2 documents/);
assert.match(notes, /not canonical Empire authority/);
assert.match(notes, /<O2KnowledgeWorkspace/);
assert.match(api, /knowledge\.operator_workspace/);
assert.match(api, /projection !== "read-only"/);
assert.match(bridge, /"knowledge\.operator_workspace"/);
assert.match(files, /files\.delete/);
assert.match(workspace, /Candidates are potential lessons, never automatic doctrine/);
assert.match(workspace, /host-local\/non-authoritative/);
assert.doesNotMatch(workspace, /writeO2File|renameO2File|deleteO2File|localStorage/);

console.log("O2 Knowledge workspace contract: source projection, provenance, and read-only boundary verified");

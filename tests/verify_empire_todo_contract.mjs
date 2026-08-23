import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const component = await readFile(
  new URL("../src/components/notes/EmpireTodoWorkspace.tsx", import.meta.url),
  "utf8",
);
const api = await readFile(
  new URL("../src/components/notes/empireTodoApi.ts", import.meta.url),
  "utf8",
);
const notes = await readFile(
  new URL("../src/components/paste-tabs/NotesHubTab.tsx", import.meta.url),
  "utf8",
);
const bridge = await readFile(
  new URL("../src-tauri/src/commands/o2.rs", import.meta.url),
  "utf8",
);

assert.match(notes, /label: "Empire To-Do"/);
assert.match(notes, /data-testid=\{`notes-mode-\$\{item\.key\}`\}/);
const blueprintIndex = notes.indexOf('key: "empire_blueprint"');
const knowledgeIndex = notes.indexOf('key: "o2_knowledge"');
const todoIndex = notes.indexOf('key: "empire_todo"');
assert.ok(blueprintIndex >= 0 && knowledgeIndex > blueprintIndex && todoIndex > knowledgeIndex);
assert.match(notes, /<EmpireTodoWorkspace/);
assert.match(component, /data-testid="empire-todo-workspace"/);
assert.match(component, /data-testid="empire-todo-selected-item"/);
assert.match(component, /data-testid="empire-todo-title"/);
assert.match(component, /data-testid="empire-todo-active-view"/);
assert.match(component, /data-testid="empire-todo-completed-view"/);
assert.match(component, /data-testid="empire-todo-status"/);
assert.match(component, /data-testid="empire-todo-priority"/);
assert.match(component, /What matters now/);
assert.match(component, /Completed operating history/);
assert.match(component, /Depends on:/);
assert.match(component, /data-testid=\{`empire-todo-\$\{field\.key\}`\}/);
for (const field of [
  "title", "status", "priority", "category", "summary", "detailedContext",
  "whyItMatters", "currentState", "nextActions", "dependencies",
  "acceptanceCriteria", "notes", "createdAt", "updatedAt",
]) {
  assert.match(component, new RegExp(field));
}
assert.match(api, /"empire.todo.list"/);
assert.match(api, /"empire.todo.save"/);
assert.match(bridge, /"empire.todo.save" =>/);
assert.match(bridge, /"empire.todo.save.stdin"/);
assert.doesNotMatch(component, /localStorage/);

console.log("Empire To-Do contract: two-pane O2 persistence and complete fields verified");

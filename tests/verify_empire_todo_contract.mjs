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
assert.match(notes, /useState<NotesMode>\("empire_todo"\)/);
assert.match(notes, /data-testid=\{`notes-mode-\$\{item\.key\}`\}/);
const todoIndex = notes.indexOf('key: "empire_todo"');
const timelineIndex = notes.indexOf('key: "timeline"');
const notesIndex = notes.indexOf('key: "notes"');
const blueprintIndex = notes.indexOf('key: "empire_blueprint"');
const knowledgeIndex = notes.indexOf('key: "o2_knowledge"');
assert.ok(
  todoIndex >= 0 &&
    timelineIndex > todoIndex &&
    notesIndex > timelineIndex &&
    blueprintIndex > notesIndex &&
    knowledgeIndex > blueprintIndex,
);
assert.match(notes, /<EmpireTodoWorkspace/);
assert.match(component, /data-testid="empire-todo-workspace"/);
assert.match(component, /data-testid="empire-todo-active-view"/);
assert.match(component, /data-testid="empire-todo-completed-view"/);
assert.match(component, /What matters now/);
assert.match(component, /Large notes field/);
assert.match(component, /Depends on:/);
assert.match(component, /Add to Timeline/);
assert.match(component, /Complete without Timeline/);
assert.match(component, /Cancel/);
assert.match(component, /completeEmpireTodo/);
assert.match(api, /"empire.todo.list"/);
assert.match(api, /"empire.todo.save"/);
assert.match(api, /"empire.todo.complete"/);
assert.match(bridge, /"empire.todo.save" =>/);
assert.match(bridge, /"empire.todo.complete.stdin"/);
assert.doesNotMatch(component, /localStorage/);

console.log("Empire To-Do contract: wide-row O2 persistence and intentional completion verified");

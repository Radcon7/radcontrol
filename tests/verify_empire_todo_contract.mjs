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

assert.doesNotMatch(notes, /key: "(?:empire_todo|progress|timeline)"/);
assert.match(notes, /useState<NotesMode>\("notes"\)/);
const hub=await readFile(new URL("../src/components/work/WorkHub.tsx",import.meta.url),"utf8");
assert.match(hub, /"tasks","initiatives","timeline"/);
assert.match(hub, /<EmpireTodoWorkspace/);
assert.match(component, /TASK_VIEWS/);
assert.match(component, /Just completed/);
assert.match(component, /View Completed/);
assert.match(component, /data-testid="empire-todo-detail"/);
assert.match(component, /Next Action/);
assert.match(component, /Acceptance \/ done condition/);
assert.doesNotMatch(component, /Large notes field/);
assert.match(component, /Blocked by/);
assert.match(component, /createTodoDrafts/);
assert.match(await readFile(new URL("../src/components/notes/TaskProgress.tsx", import.meta.url), "utf8"), /"completion" : item.progress \? "operator" : "unassessed"/);
assert.match(component, /Add to Timeline/);
assert.match(component, /Complete without Timeline/);
assert.match(component, /Cancel/);
assert.match(component, /completeEmpireTodo/);
assert.match(api, /listWork\(\)/);
assert.match(api, /"task.save"/);
assert.match(api, /"task.complete"/);
assert.match(bridge, /"empire.todo.save" =>/);
assert.match(bridge, /"empire.todo.complete.stdin"/);
assert.doesNotMatch(component, /localStorage/);

console.log("Empire To-Do contract: wide-row O2 persistence and intentional completion verified");

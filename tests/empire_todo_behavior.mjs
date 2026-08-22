import assert from "node:assert/strict";
import {
  createBlankEmpireTodo,
  groupEmpireTodos,
  isEmpireTodoComplete,
  mergeSavedEmpireTodo,
  selectEmpireTodoItem,
} from "../src/components/notes/empireTodoModel.ts";

const first = createBlankEmpireTodo(new Date("2026-08-15T13:00:00Z"));
const second = {
  ...createBlankEmpireTodo(new Date("2026-08-15T13:00:01Z")),
  id: "second",
  title: "Second item",
};

assert.equal(selectEmpireTodoItem([first, second], second.id)?.id, second.id);
assert.equal(selectEmpireTodoItem([first, second], "missing")?.id, first.id);
assert.equal(selectEmpireTodoItem([], null), null);

const saved = { ...second, title: "Updated second item" };
const replaced = mergeSavedEmpireTodo([first, second], saved);
assert.equal(replaced.length, 2);
assert.equal(replaced[1].title, "Updated second item");
assert.equal(new Set(replaced.map((item) => item.id)).size, 2);

const added = mergeSavedEmpireTodo([first], saved);
assert.equal(added.length, 2);
assert.equal(added[1].id, second.id);

const grouped = groupEmpireTodos([
  { ...first, id: "now", title: "Now", category: "Now", status: "Blocked", priority: "Critical" },
  { ...first, id: "business", title: "Business", category: "Business Foundation", status: "Planned", priority: "High" },
  { ...first, id: "later", title: "Later", category: "Unclassified legacy", status: "Planned", priority: "Normal" },
]);
assert.deepEqual(grouped.map((group) => group.key), ["Now", "Business Foundation", "Later"]);
assert.equal(grouped[0].items[0].id, "now");
assert.equal(isEmpireTodoComplete({ ...first, status: "Complete" }), true);
assert.equal(isEmpireTodoComplete(first), false);

console.log("Empire To-Do behavior: selection, executive grouping, archive state, and duplicate-free save merge verified");

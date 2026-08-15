import assert from "node:assert/strict";
import {
  createBlankEmpireTodo,
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

console.log("Empire To-Do behavior: selection and duplicate-free save merge verified");

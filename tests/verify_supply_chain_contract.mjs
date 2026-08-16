import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const workflowRoot = new URL("../.github/workflows/", import.meta.url);
const files = (await readdir(workflowRoot)).filter((name) => name.endsWith(".yml")).sort();
const workflows = new Map();
for (const file of files) workflows.set(file, await readFile(new URL(file, workflowRoot), "utf8"));
const all = [...workflows.values()].join("\n");

const expected = new Map([
  ["actions/checkout", "d23441a48e516b6c34aea4fa41551a30e30af803"],
  ["actions/setup-node", "820762786026740c76f36085b0efc47a31fe5020"],
  ["actions/dependency-review-action", "a1d282b36b6f3519aa1f3fc636f609c47dddb294"],
  ["github/codeql-action/init", "ff2f1c621b7f889edc0d3c761ac2e6a3f8cdb0dd"],
  ["github/codeql-action/analyze", "ff2f1c621b7f889edc0d3c761ac2e6a3f8cdb0dd"],
]);

const uses = [...all.matchAll(/^\s*-?\s*uses:\s*([^\s@]+)@([^\s#]+)/gm)];
assert.ok(uses.length > 0);
for (const match of uses) {
  assert.match(match[2], /^[0-9a-f]{40}$/, `movable or malformed action ref: ${match[0]}`);
  assert.equal(match[2], expected.get(match[1]), `unreviewed action identity: ${match[1]}`);
}
assert.deepEqual(new Set(uses.map((match) => match[1])), new Set(expected.keys()));

for (const [file, workflow] of workflows) {
  const lines = workflow.split("\n");
  lines.forEach((line, index) => {
    if (!line.includes("uses: actions/checkout@")) return;
    assert.match(lines.slice(index + 1, index + 8).join("\n"), /persist-credentials: false/, `${file} checkout retains credentials`);
  });
}

assert.doesNotMatch(all, /contents:\s*write|actions:\s*write|packages:\s*write/);
assert.equal((all.match(/id-token:\s*write/g) ?? []).length, 0);
assert.equal((all.match(/attestations:\s*write/g) ?? []).length, 0);
assert.equal((all.match(/security-events:\s*write/g) ?? []).length, 1);
assert.doesNotMatch(all, /repository:\s*Radcon7\/o2/);

const ci = workflows.get("ci.yml");
assert.match(ci, /if: github\.event_name == 'pull_request'[\s\S]*dependency-review-action@/);
assert.match(ci, /name: RadControl verification/);
assert.equal(workflows.has("release-candidate.yml"), false);
assert.equal(workflows.has("audit-anchor.yml"), false);

console.log(`workflow supply-chain contract: ${uses.length} pinned uses across ${files.length} workflows`);

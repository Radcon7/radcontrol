import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const workflowRoot = new URL("../.github/workflows/", import.meta.url);
const supplyChain = await readFile(new URL("../docs/SUPPLY_CHAIN.md", import.meta.url), "utf8");
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

assert.doesNotMatch(supplyChain, /Dependabot alerts report zero known vulnerabilities/);
assert.match(supplyChain, /accepted O2 protected-main\s+workflow emits that manifest with governed lifecycle admission/);
assert.doesNotMatch(supplyChain, /current accepted[\s\S]{0,80}does \*\*not\*\* yet emit/);
assert.match(supplyChain, /workflow\s+run metadata as correlation only/);
assert.match(supplyChain, /neither a provider\s+attestation nor authenticated provenance/);
assert.match(supplyChain, /schema version 1 is accepted only for a\s+real rollback/);
for (const advisory of [
  "GHSA-7gmj-67g7-phm9",
  "GHSA-7gcf-g7xr-8hxj",
  "GHSA-cq8v-f236-94qc",
  "GHSA-wrw7-89jp-8q8g",
]) {
  assert.match(supplyChain, new RegExp(advisory));
}

console.log(`workflow supply-chain contract: ${uses.length} pinned uses across ${files.length} workflows`);

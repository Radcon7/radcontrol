import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("scripts/o2_index_repo.sh", "utf8");

assert.match(source, /Evidence is deterministic/);
assert.match(source, /docs\/_\(o2_repo_index\|repo_snapshot\)/);
assert.match(source, /\| sort \| sed -n '1,250p'/);
assert.doesNotMatch(source, /date \+/);
assert.doesNotMatch(source, /\| head -n/);

console.log("repo index contract: deterministic and bounded");

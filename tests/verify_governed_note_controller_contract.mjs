import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const componentRoot = new URL("../src/components/", import.meta.url);
const hook = await readFile(
  new URL("common/useGovernedRecordNote.ts", componentRoot),
  "utf8",
);

const consumers = await Promise.all(
  [
    "projects/ProjectsTab.tsx",
    "agents/InfrastructureTab.tsx",
    "agents/AgentsTab.tsx",
  ].map(async (path) => ({
    path,
    source: await readFile(new URL(path, componentRoot), "utf8"),
  })),
);

assert.match(hook, /readO2File/);
assert.match(hook, /loadError instanceof O2FileNotFoundError/);
assert.doesNotMatch(hook, /reportLoadError/);
assert.match(hook, /persistGovernedRecordNote/);
assert.match(hook, /revisionRef/);
assert.match(hook, /registerBeforeTabChangeSaver\(flush\)/);
assert.match(hook, /if \(revisionRef\.current > 0\)/);
assert.match(hook, /const saved = await flush\(\)/);

for (const consumer of consumers) {
  assert.match(
    consumer.source,
    /import \{ useGovernedRecordNote \} from "\.\.\/common\/useGovernedRecordNote"|import \{ useGovernedRecordNote \} from "\.\.\/\.\.\/common\/useGovernedRecordNote"/,
    `${consumer.path} must import the shared note controller`,
  );
  assert.match(
    consumer.source,
    /useGovernedRecordNote\(\{/,
    `${consumer.path} must use the shared note controller`,
  );
  assert.doesNotMatch(
    consumer.source,
    /persistGovernedRecordNote/,
    `${consumer.path} must not own note persistence`,
  );
  assert.doesNotMatch(
    consumer.source,
    /notesRevisionRef|projectNotesRevisionRef/,
    `${consumer.path} must not own note revision state`,
  );
}

const projects = consumers.find(
  (consumer) => consumer.path === "projects/ProjectsTab.tsx",
)?.source;
assert.ok(projects);
assert.match(projects, /const latestProject = await onEnsureNotes\(selectedProject\)/);

console.log("governed note controller contract: shared lifecycle verified");

import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  E2E_TEMP_PREFIX,
  assertInstalledO2Unchanged,
  assertWritableFixtureIsolation,
  assertWritableRuntimeAttestation,
  snapshotInstalledO2,
} from "../scripts/native_acceptance_lib.mjs";

const TODO_IDS = [
  "codex-memory-round4b",
  "new-project-build-dossier",
  "radcon-sentinel",
];

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

async function createInstalledRoot(base) {
  const root = path.join(base, "installed-o2");
  const todo = path.join(root, "docs/radcontrol/empire_todo/items.json");
  await mkdir(path.dirname(todo), { recursive: true });
  await writeFile(todo, `${JSON.stringify({ registryVersion: 1, items: TODO_IDS.map((id) => ({ id })) })}\n`);
  run("git", ["init", "-q"], root);
  run("git", ["config", "user.name", "Fixture"], root);
  run("git", ["config", "user.email", "fixture@example.test"], root);
  run("git", ["add", "."], root);
  run("git", ["commit", "-qm", "fixture"], root);
  return root;
}

async function createFixture() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), E2E_TEMP_PREFIX));
  const o2Root = path.join(tempRoot, "o2");
  const e2eHome = path.join(tempRoot, "home");
  const xdgCacheHome = path.join(tempRoot, "xdg-cache");
  const xdgConfigHome = path.join(tempRoot, "xdg-config");
  const xdgDataHome = path.join(tempRoot, "xdg-data");
  const fixtureRepo = path.join(tempRoot, "fixture-repo");
  for (const directory of [
    path.join(o2Root, "scripts"),
    path.join(o2Root, "registry"),
    path.join(o2Root, "docs/radcontrol/empire_todo"),
    e2eHome,
    xdgCacheHome,
    xdgConfigHome,
    xdgDataHome,
    fixtureRepo,
  ]) await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(path.join(o2Root, "scripts/run_o2.sh"), "#!/usr/bin/env bash\nexit 0\n"),
    writeFile(path.join(o2Root, "scripts/o2_radcontrol_audit.py"), "# fixture\n"),
    writeFile(path.join(o2Root, "registry/project-archetypes.json"), "{}\n"),
    writeFile(path.join(o2Root, "registry/empire-todo-seeds.json"), "{}\n"),
    writeFile(path.join(o2Root, "registry/projects.json"), `${JSON.stringify([{
      key: "fixture",
      label: "Fixture",
      archetype: "standalone-product",
      repoPath: fixtureRepo,
      retired: false,
    }])}\n`),
    writeFile(path.join(o2Root, "docs/radcontrol/empire_todo/items.json"), `${JSON.stringify({ registryVersion: 1, items: TODO_IDS.map((id) => ({ id })) })}\n`),
  ]);
  return { tempRoot, o2Root, e2eHome, xdgCacheHome, xdgConfigHome, xdgDataHome };
}

async function setup(t) {
  const base = await mkdtemp(path.join(os.tmpdir(), "radcontrol-native-isolation-test-"));
  const installedO2Root = await createInstalledRoot(base);
  const fixture = await createFixture();
  t.after(async () => {
    await Promise.all([
      rm(base, { recursive: true, force: true }),
      rm(fixture.tempRoot, { recursive: true, force: true }),
    ]);
  });
  return { installedO2Root, fixture };
}

test("rejects installed O2 as the writable fixture", async (t) => {
  const { installedO2Root, fixture } = await setup(t);
  await assert.rejects(
    assertWritableFixtureIsolation({ ...fixture, o2Root: installedO2Root }, { installedO2Root }),
    /must stay under its test-owned temp root|cannot be the writable E2E fixture/,
  );
});

test("rejects a missing fixture To-Do store before launch", async (t) => {
  const { installedO2Root, fixture } = await setup(t);
  await rm(path.join(fixture.o2Root, "docs/radcontrol/empire_todo/items.json"));
  await assert.rejects(
    assertWritableFixtureIsolation(fixture, { installedO2Root }),
    /fixture docs\/radcontrol\/empire_todo\/items.json must be one regular file/,
  );
});

test("rejects a fixture symlink toward installed operator data", async (t) => {
  const { installedO2Root, fixture } = await setup(t);
  const fixtureTodo = path.join(fixture.o2Root, "docs/radcontrol/empire_todo/items.json");
  await rm(fixtureTodo);
  await symlink(path.join(installedO2Root, "docs/radcontrol/empire_todo/items.json"), fixtureTodo);
  await assert.rejects(
    assertWritableFixtureIsolation(fixture, { installedO2Root }),
    /must be one regular file/,
  );
});

test("rejects an invalid or unhonored runtime override before mutation", async (t) => {
  const { installedO2Root, fixture } = await setup(t);
  await assertWritableFixtureIsolation(fixture, { installedO2Root });
  assert.throws(
    () => assertWritableRuntimeAttestation({ runtimeMode: "production", o2Root: installedO2Root }, fixture),
    /did not attest E2E mode/,
  );
  assert.throws(
    () => assertWritableRuntimeAttestation({ runtimeMode: "e2e", o2Root: installedO2Root }, fixture),
    /did not consume the preflighted O2 root/,
  );
});

test("accepts a canonical fixture and confines persistence to it", async (t) => {
  const { installedO2Root, fixture } = await setup(t);
  await assertWritableFixtureIsolation(fixture, { installedO2Root });
  assertWritableRuntimeAttestation({
    runtimeMode: "e2e",
    o2Root: fixture.o2Root,
    bridgeFailure: null,
    empireTodoStoreAvailable: true,
  }, fixture);
  const installedBefore = await snapshotInstalledO2({ installedO2Root });
  const fixtureTodo = path.join(fixture.o2Root, "docs/radcontrol/empire_todo/items.json");
  const payload = JSON.parse(await readFile(fixtureTodo, "utf8"));
  payload.items[2].notes = "isolated persistence probe";
  await writeFile(fixtureTodo, `${JSON.stringify(payload)}\n`);
  assert.match(await readFile(fixtureTodo, "utf8"), /isolated persistence probe/);
  await assertInstalledO2Unchanged(installedBefore);
});

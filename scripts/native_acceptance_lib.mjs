import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmod,
  lstat,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

export const INSTALLED_O2_ROOT = "/home/chris/.local/share/radcontrol/o2-runtime";
export const INSTALLED_RADCONTROL_APP = "/home/chris/.local/bin/radcontrol-app";
export const DEVELOPMENT_O2_ROOT = "/home/chris/dev/o2";
export const E2E_TEMP_PREFIX = "radcontrol-tauri-e2e-";

function command(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });
  if (result.error || result.status !== 0) {
    const detail = (result.stderr || result.stdout || result.error?.message || "unknown failure").trim();
    throw new Error(`${command} ${args.join(" ")} failed: ${detail}`);
  }
  return result.stdout.trim();
}

function pathInside(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

async function canonicalDirectory(candidate, label) {
  const resolved = path.resolve(candidate);
  const metadata = await lstat(resolved).catch(() => null);
  assert.ok(metadata?.isDirectory() && !metadata.isSymbolicLink(), `${label} must be a real directory`);
  const canonical = await realpath(resolved);
  assert.equal(canonical, resolved, `${label} must not resolve through a symlink`);
  return canonical;
}

async function canonicalRegularFile(candidate, label) {
  const resolved = path.resolve(candidate);
  const metadata = await lstat(resolved).catch(() => null);
  assert.ok(metadata?.isFile() && !metadata.isSymbolicLink(), `${label} must be one regular file`);
  const canonical = await realpath(resolved);
  assert.equal(canonical, resolved, `${label} must not resolve through a symlink`);
  return canonical;
}

async function privateDirectory(candidate, label) {
  const canonical = await canonicalDirectory(candidate, label);
  const metadata = await lstat(canonical);
  assert.equal(metadata.mode & 0o077, 0, `${label} must not be group/world accessible`);
  return canonical;
}

export async function sha256File(candidate) {
  const contents = await readFile(candidate);
  return createHash("sha256").update(contents).digest("hex");
}

export async function snapshotInstalledO2({
  installedO2Root = INSTALLED_O2_ROOT,
  todoPath = path.join(installedO2Root, "docs/radcontrol/empire_todo/items.json"),
} = {}) {
  const root = await canonicalDirectory(installedO2Root, "installed O2 root");
  const todo = await canonicalRegularFile(todoPath, "installed Empire To-Do store");
  assert.ok(pathInside(todo, root), "installed Empire To-Do store must stay under installed O2");
  const status = command("git", ["-C", root, "status", "--porcelain"]);
  assert.equal(status, "", "installed O2 worktree must be clean before native acceptance");
  return {
    root,
    head: command("git", ["-C", root, "rev-parse", "HEAD"]),
    tree: command("git", ["-C", root, "rev-parse", "HEAD^{tree}"]),
    status,
    todo,
    todoSha256: await sha256File(todo),
  };
}

export async function assertInstalledO2Unchanged(before) {
  const after = await snapshotInstalledO2({ installedO2Root: before.root, todoPath: before.todo });
  assert.deepEqual(after, before, "installed O2 identity, cleanliness, or Empire To-Do integrity changed");
  return after;
}

export async function assertWritableFixtureIsolation(fixture, {
  installedO2Root = INSTALLED_O2_ROOT,
  expectedTodoIds,
} = {}) {
  const installed = await canonicalDirectory(installedO2Root, "installed O2 root");
  const temporaryBase = await canonicalDirectory(os.tmpdir(), "system temporary root");
  const tempRoot = await privateDirectory(fixture.tempRoot, "writable E2E temp root");
  assert.ok(pathInside(tempRoot, temporaryBase), "writable E2E temp root must stay under the system temporary root");
  assert.ok(path.basename(tempRoot).startsWith(E2E_TEMP_PREFIX), "writable E2E temp root has an unexpected identity");

  const o2Root = await canonicalDirectory(fixture.o2Root, "writable E2E O2 root");
  assert.ok(pathInside(o2Root, tempRoot), "writable E2E O2 root must stay under its test-owned temp root");
  assert.notEqual(o2Root, installed, "installed O2 cannot be the writable E2E fixture");
  assert.ok(!pathInside(o2Root, installed) && !pathInside(installed, o2Root), "writable E2E and installed O2 roots must not overlap");

  for (const [label, candidate] of [
    ["E2E home", fixture.e2eHome],
    ["E2E cache home", fixture.xdgCacheHome],
    ["E2E config home", fixture.xdgConfigHome],
    ["E2E data home", fixture.xdgDataHome],
  ]) {
    const canonical = await canonicalDirectory(candidate, label);
    assert.ok(pathInside(canonical, tempRoot), `${label} must stay under the test-owned temp root`);
  }

  const requiredFiles = [
    "scripts/run_o2.sh",
    "scripts/o2_radcontrol_audit.py",
    "registry/projects.json",
    "registry/project-archetypes.json",
    "registry/empire-todo-seeds.json",
    "docs/radcontrol/empire_todo/items.json",
  ];
  for (const relative of requiredFiles) {
    const canonical = await canonicalRegularFile(path.join(o2Root, relative), `fixture ${relative}`);
    assert.ok(pathInside(canonical, o2Root), `fixture ${relative} escaped the fixture O2 root`);
  }

  const todo = JSON.parse(await readFile(path.join(o2Root, "docs/radcontrol/empire_todo/items.json"), "utf8"));
  const seeds = JSON.parse(await readFile(path.join(o2Root, "registry/empire-todo-seeds.json"), "utf8"));
  const expectedIds = expectedTodoIds ?? seeds.items?.map((item) => item.id);
  assert.ok(Array.isArray(expectedIds), "fixture Empire To-Do seed registry must contain items");
  assert.deepEqual(todo.items?.map((item) => item.id), expectedIds, "fixture Empire To-Do seed is missing or unexpected");
  const registry = JSON.parse(await readFile(path.join(o2Root, "registry/projects.json"), "utf8"));
  assert.ok(Array.isArray(registry) && registry.length >= 1, "fixture project registry must contain its deterministic fixture");
  for (const row of registry) {
    assert.ok(
      row && typeof row.key === "string" && row.key && typeof row.label === "string" && row.label
        && typeof row.archetype === "string" && row.archetype && typeof row.retired === "boolean",
      "fixture project registry row is missing required identity, archetype, or retired fields",
    );
    const repoPath = await canonicalDirectory(row.repoPath, `fixture project ${row.key} root`);
    assert.ok(pathInside(repoPath, tempRoot), `fixture project ${row.key} escaped the test-owned temp root`);
  }

  return { installed, tempRoot, o2Root };
}

export function assertWritableRuntimeAttestation(diagnostics, fixture) {
  assert.equal(diagnostics?.runtimeMode, "e2e", "native writable artifact did not attest E2E mode");
  assert.equal(diagnostics?.o2Root, fixture.o2Root, "native writable artifact did not consume the preflighted O2 root");
  assert.equal(diagnostics?.bridgeFailure ?? null, null, "native writable artifact reported a bridge failure");
  assert.equal(diagnostics?.empireTodoStoreAvailable, true, "native writable artifact cannot see the seeded To-Do store");
  return diagnostics;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

export async function createBubblewrapApplication({
  app,
  tempRoot,
  home,
  xdgCacheHome,
  xdgConfigHome,
  xdgDataHome,
  writablePaths = [],
  overlays = [],
  environment = {},
}) {
  command("/usr/bin/bwrap", ["--version"]);
  const canonicalApp = await canonicalRegularFile(app, "native acceptance application");
  const canonicalTemp = await privateDirectory(tempRoot, "native acceptance temp root");
  const writable = [];
  for (const candidate of [canonicalTemp, ...writablePaths]) {
    const canonical = await canonicalDirectory(candidate, "sandbox writable path");
    if (!writable.includes(canonical)) writable.push(canonical);
  }
  const canonicalOverlays = [];
  for (const overlay of overlays) {
    canonicalOverlays.push({
      source: await canonicalDirectory(overlay.source, "sandbox overlay source"),
      destination: await canonicalDirectory(overlay.destination, "sandbox overlay destination"),
    });
  }

  const args = [
    "--ro-bind", "/", "/",
    "--dev-bind", "/dev", "/dev",
    "--proc", "/proc",
    "--unshare-all",
    "--share-net",
    "--die-with-parent",
  ];
  for (const candidate of writable) args.push("--bind", candidate, candidate);
  for (const overlay of canonicalOverlays) args.push("--bind", overlay.source, overlay.destination);
  for (const [key, value] of Object.entries({
    HOME: home,
    XDG_CACHE_HOME: xdgCacheHome,
    XDG_CONFIG_HOME: xdgConfigHome,
    XDG_DATA_HOME: xdgDataHome,
    ...environment,
  })) {
    args.push("--setenv", key, value);
  }
  args.push("--", canonicalApp);

  const wrapper = path.join(canonicalTemp, "launch-native-acceptance");
  const source = [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    `exec /usr/bin/bwrap ${args.map(shellQuote).join(" ")} \"$@\"`,
    "",
  ].join("\n");
  await writeFile(wrapper, source, { mode: 0o700 });
  await chmod(wrapper, 0o700);
  return wrapper;
}

export function assertProcessNotRunning(name) {
  const result = spawnSync("pgrep", ["-x", name], { encoding: "utf8" });
  if (result.status === 0 && result.stdout.trim()) {
    throw new Error(`${name} must be stopped before native acceptance`);
  }
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`could not determine whether ${name} is running`);
  }
}

export function tcpListeners() {
  const output = command("/usr/bin/ss", ["-ltnH"]);
  return new Set(output.split("\n").map((line) => line.trim()).filter(Boolean));
}

export function assertNoNewTcpListeners(before, after) {
  const additions = [...after].filter((line) => !before.has(line));
  assert.deepEqual(additions, [], `native acceptance left TCP listeners behind: ${additions.join("; ")}`);
}

export function assertPortAbsent(listeners, port) {
  const pattern = new RegExp(`:${port}(?:\\s|$)`);
  assert.ok(![...listeners].some((line) => pattern.test(line)), `TCP port ${port} must remain free`);
}

export function installNativeAcceptanceSignalCleanup(cleanup) {
  assert.equal(typeof cleanup, "function", "native acceptance cleanup must be callable");
  let cleanupPromise;
  const handlers = new Map();
  const removeHandlers = () => {
    for (const [signal, handler] of handlers) process.removeListener(signal, handler);
  };
  const runCleanup = () => {
    cleanupPromise ??= Promise.resolve().then(cleanup);
    return cleanupPromise;
  };

  for (const [signal, exitCode] of [["SIGINT", 130], ["SIGTERM", 143]]) {
    const handler = () => {
      process.exitCode = exitCode;
      void runCleanup()
        .catch((error) => console.error(`[native-acceptance] cleanup after ${signal} failed:`, error))
        .finally(() => {
          removeHandlers();
          process.exit(process.exitCode ?? exitCode);
        });
    };
    handlers.set(signal, handler);
    process.once(signal, handler);
  }

  return async () => {
    try {
      await runCleanup();
    } finally {
      removeHandlers();
    }
  };
}

// scripts/tauri_preflight.mjs
// Fail-fast check for Tauri dev attach mode.
// Purpose:
//   1) Resolve RadControl devUrl from O2 registry (canonical truth).
//   2) Assert src-tauri/tauri.conf.json devUrl matches registry (no parallel truth).
//   3) Probe the devUrl and exit non-zero if unreachable.
//
// This script does NOT start Vite.

import fs from "node:fs/promises";
import path from "node:path";

const TIMEOUT_MS = Number(process.env.RADCONTROL_PREFLIGHT_TIMEOUT_MS || 1200);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function probeOnce(url, timeoutMs) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { method: "GET", signal: controller.signal });
    // Any HTTP response means "server is up" for our purposes.
    return { ok: true, status: res.status };
  } finally {
    clearTimeout(t);
  }
}

async function probe(url, timeoutMs) {
  // Quick retry helps when Vite is in the last moments of boot.
  try {
    return await probeOnce(url, timeoutMs);
  } catch {
    await sleep(120);
    return await probeOnce(url, timeoutMs);
  }
}

function die(msg, code = 2) {
  console.error(msg);
  process.exit(code);
}

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

async function readJsonFile(fp) {
  const raw = await fs.readFile(fp, "utf8");
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`Invalid JSON in ${fp}: ${String(e)}`);
  }
}

async function resolveRegistryRadcontrolUrl(homeDir) {
  const registryPath = path.join(
    homeDir,
    "dev",
    "o2",
    "registry",
    "projects.json",
  );
  const v = await readJsonFile(registryPath);
  if (!Array.isArray(v)) {
    throw new Error(`Registry is not an array: ${registryPath}`);
  }

  const row = v.find(
    (r) => r && typeof r === "object" && r.key === "radcontrol",
  );

  const url = row?.url;
  if (!isNonEmptyString(url)) {
    throw new Error(
      `Registry row for key="radcontrol" missing valid "url" (${registryPath})`,
    );
  }
  return { url: url.trim(), registryPath };
}

async function readTauriDevUrl() {
  const tauriConfPath = path.join("src-tauri", "tauri.conf.json");
  const v = await readJsonFile(tauriConfPath);

  const devUrl = v?.build?.devUrl;
  if (!isNonEmptyString(devUrl)) {
    throw new Error(`Missing build.devUrl in ${tauriConfPath}`);
  }

  return { devUrl: devUrl.trim(), tauriConfPath };
}

async function main() {
  const home = process.env.HOME;
  if (!isNonEmptyString(home)) {
    die("[tauri-preflight] ERROR: HOME not set", 2);
  }

  const { url: registryUrl, registryPath } =
    await resolveRegistryRadcontrolUrl(home);
  const { devUrl: tauriDevUrl, tauriConfPath } = await readTauriDevUrl();

  // Optional override for emergencies only.
  const override = process.env.RADCONTROL_DEV_URL;
  const resolvedUrl = isNonEmptyString(override)
    ? override.trim()
    : registryUrl;

  // Assert wiring matches canonical truth (registry).
  // If you REALLY need an override, you should update the registry and config together.
  if (tauriDevUrl !== registryUrl) {
    die(
      [
        `[tauri-preflight] ERROR: tauri.conf.json devUrl does not match O2 registry`,
        `  - ${tauriConfPath}: build.devUrl = ${tauriDevUrl}`,
        `  - ${registryPath}: radcontrol.url = ${registryUrl}`,
        ``,
        `Fix: make these match (registry is canonical).`,
      ].join("\n"),
      3,
    );
  }

  if (isNonEmptyString(override) && resolvedUrl !== registryUrl) {
    die(
      [
        `[tauri-preflight] ERROR: RADCONTROL_DEV_URL override conflicts with O2 registry`,
        `  - RADCONTROL_DEV_URL = ${resolvedUrl}`,
        `  - ${registryPath}: radcontrol.url = ${registryUrl}`,
        ``,
        `Fix: unset RADCONTROL_DEV_URL, or update registry + tauri.conf.json together.`,
      ].join("\n"),
      4,
    );
  }

  // Probe reachability.
  try {
    const r = await probe(resolvedUrl, TIMEOUT_MS);
    console.log(
      `[tauri-preflight] OK: frontend reachable at ${resolvedUrl} (HTTP ${r.status})`,
    );
  } catch {
    die(
      [
        `[tauri-preflight] ERROR: frontend dev server is NOT reachable at ${resolvedUrl}`,
        ``,
        `Expected dev attach model:`,
        `  - Start Vite on the registry-defined url (typically via O2 'radcontrol.dev')`,
        `  - Then run Tauri dev attach`,
        ``,
        `Why you saw the hang previously:`,
        `  - Tauri devUrl is hard-set in tauri.conf.json`,
        `  - beforeDevCommand was a no-op, so Tauri waited indefinitely`,
      ].join("\n"),
      2,
    );
  }
}

main().catch((e) => {
  die(`[tauri-preflight] ERROR: ${String(e?.message || e)}`, 2);
});

import path from "node:path";
import {
  RADCONTROL_DEV_URL,
  die,
  probeRadcontrolDevServer,
  readPositiveIntEnv,
  readTauriDevUrl,
  repoRootFromMeta,
} from "./dev_local_lib.mjs";

const PRECHECK_TIMEOUT_MS = readPositiveIntEnv(
  "RADCONTROL_PREFLIGHT_TIMEOUT_MS",
  1_500,
);

async function main() {
  const repoRoot = repoRootFromMeta(import.meta.url);
  const { devUrl, tauriConfPath } = await readTauriDevUrl(repoRoot);
  const relTauriConfPath =
    path.relative(repoRoot, tauriConfPath) || tauriConfPath;

  // 0) Enforce canonical devUrl
  if (devUrl !== RADCONTROL_DEV_URL) {
    die(
      [
        `[tauri-preflight] ERROR: non-canonical Tauri devUrl`,
        `  - ${relTauriConfPath}: build.devUrl = ${devUrl}`,
        `  - expected: ${RADCONTROL_DEV_URL}`,
        "",
        `Fix: set build.devUrl to ${RADCONTROL_DEV_URL} and keep Vite on port 1420 (strictPort).`,
      ].join("\n"),
      3,
    );
  }

  // 1) Probe only. This script must NOT start Vite.
  const probe = await probeRadcontrolDevServer(devUrl, PRECHECK_TIMEOUT_MS);

  if (probe.ok) {
    console.log(
      `[tauri-preflight] OK: RadControl Vite dev server reachable at ${devUrl} (root=${probe.rootStatus}, vite=${probe.viteStatus}, main=${probe.mainStatus})`,
    );
    return;
  }

  if (probe.kind === "wrong-server") {
    die(
      [
        `[tauri-preflight] ERROR: port 1420 is serving the wrong app`,
        `  - expected RadControl Vite at ${devUrl}`,
        `  - probe details:`,
        `  - ${probe.details}`,
        "",
        `Fix: stop the process currently using port 1420, then run from repo root:`,
        `  node scripts/tauri_dev.mjs`,
      ].join("\n"),
      4,
    );
  }

  // Down / unreachable / degraded -> fail fast with a deterministic instruction.
  die(
    [
      `[tauri-preflight] ERROR: RadControl Vite dev server not reachable at ${devUrl}`,
      `  - probe kind: ${probe.kind || "unknown"}`,
      `  - timeout: ${PRECHECK_TIMEOUT_MS}ms`,
      "",
      `Fix (golden path):`,
      `  node scripts/tauri_dev.mjs`,
      "",
      `Note: this preflight does not start Vite (runner owns startup).`,
    ].join("\n"),
    2,
  );
}

main().catch((err) => {
  die(`[tauri-preflight] ERROR: ${String(err?.message || err)}`, 2);
});

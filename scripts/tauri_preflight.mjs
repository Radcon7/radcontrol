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
  const relTauriConfPath = path.relative(repoRoot, tauriConfPath) || tauriConfPath;

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
        `Fix:`,
        `  1) Stop the process currently using port 1420`,
        `  2) Run the golden path from repo root: node scripts/tauri_dev.mjs`,
      ].join("\n"),
      4,
    );
  }

  die(
    [
      `[tauri-preflight] ERROR: RadControl Vite dev server is not reachable at ${devUrl}`,
      `  - timeout per probe: ${PRECHECK_TIMEOUT_MS}ms`,
      "",
      `Fix:`,
      `  1) Start local dev from repo root with: node scripts/tauri_dev.mjs`,
      `  2) Or start Vite manually on ${RADCONTROL_DEV_URL} and retry`,
      "",
      `This check exits fast on purpose to avoid Tauri hanging while waiting for devUrl.`,
    ].join("\n"),
    2,
  );
}

main().catch((err) => {
  die(`[tauri-preflight] ERROR: ${String(err?.message || err)}`, 2);
});

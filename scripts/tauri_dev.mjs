import { spawn } from "node:child_process";
import {
  RADCONTROL_DEV_URL,
  RADCONTROL_HOST,
  RADCONTROL_PORT,
  die,
  probeRadcontrolDevServer,
  readPositiveIntEnv,
  repoRootFromMeta,
} from "./dev_local_lib.mjs";

const START_TIMEOUT_MS = readPositiveIntEnv(
  "RADCONTROL_TAURI_DEV_TIMEOUT_MS",
  90_000,
);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForVite(devUrl, timeoutMs) {
  const started = Date.now();
  let last = { ok: false, kind: "unreachable" };

  while (Date.now() - started < timeoutMs) {
    const probe = await probeRadcontrolDevServer(devUrl, 1_000);
    last = probe;
    if (probe.ok) return { ok: true, probe };
    if (probe.kind === "wrong-server")
      return { ok: false, kind: "wrong-server", probe };
    await sleep(250);
  }
  return { ok: false, kind: "timeout", probe: last };
}

function startVite(repoRoot) {
  // Deterministic spawn:
  // - Call Vite directly to avoid npm arg-forwarding edge cases.
  // - Ignore stdin to reduce TTY/readline EIO fragility.
  const child = spawn(
    "npx",
    [
      "vite",
      "--host",
      RADCONTROL_HOST,
      "--port",
      String(RADCONTROL_PORT),
      "--strictPort",
    ],
    {
      cwd: repoRoot,
      stdio: ["ignore", "inherit", "inherit"],
      shell: false,
      env: { ...process.env, CI: "1" },
    },
  );
  return child;
}

function startTauri(repoRoot) {
  // Use local installed tauri via npx (stable and avoids path weirdness)
  const child = spawn("npx", ["tauri", "dev"], {
    cwd: repoRoot,
    stdio: ["ignore", "inherit", "inherit"],
    shell: false,
    env: { ...process.env, CI: "1" },
  });
  return child;
}

async function main() {
  const repoRoot = repoRootFromMeta(import.meta.url);

  console.log(`[tauri-dev] repo: ${repoRoot}`);
  console.log(`[tauri-dev] canonical dev url: ${RADCONTROL_DEV_URL}`);

  // 1) Probe FIRST to avoid double-start.
  const probeNow = await probeRadcontrolDevServer(RADCONTROL_DEV_URL, 1_000);
  if (probeNow.ok) {
    const p = probeNow;
    console.log(
      `[tauri-dev] OK: Vite already reachable at ${RADCONTROL_DEV_URL} (root=${p.rootStatus}, vite=${p.viteStatus}, main=${p.mainStatus})`,
    );
    console.log(`[tauri-dev] Starting Tauri dev...`);
    startTauri(repoRoot);
    return;
  }

  if (probeNow.kind === "wrong-server") {
    die(
      [
        `[tauri-dev] ERROR: port ${RADCONTROL_PORT} is serving the wrong app`,
        `  - expected RadControl Vite at ${RADCONTROL_DEV_URL}`,
        `  - probe details: ${probeNow.details || "(no details)"}`,
        "",
        `Fix: stop whatever is on ${RADCONTROL_PORT} and rerun: node scripts/tauri_dev.mjs`,
      ].join("\n"),
      4,
    );
  }

  // 2) Start Vite only if needed, then wait for readiness.
  console.log(
    `[tauri-dev] Starting Vite (npx vite) and waiting up to ${Math.floor(START_TIMEOUT_MS / 1000)}s...`,
  );

  const vite = startVite(repoRoot);

  const ready = await waitForVite(RADCONTROL_DEV_URL, START_TIMEOUT_MS);
  if (!ready.ok) {
    try {
      vite.kill("SIGTERM");
    } catch {}

    if (ready.kind === "wrong-server") {
      die(
        [
          `[tauri-dev] ERROR: port ${RADCONTROL_PORT} is serving the wrong app`,
          `  - expected RadControl Vite at ${RADCONTROL_DEV_URL}`,
          `  - probe details: ${ready.probe?.details || "(no details)"}`,
          "",
          `Fix: stop whatever is on ${RADCONTROL_PORT} and rerun: node scripts/tauri_dev.mjs`,
        ].join("\n"),
        4,
      );
    }

    die(
      [
        `[tauri-dev] ERROR: timed out waiting for RadControl Vite (${Math.floor(START_TIMEOUT_MS / 1000)}s)`,
        `  - last probe: ${ready.probe?.kind || "unreachable"}`,
        "",
        `Fix: review Vite output above and rerun: node scripts/tauri_dev.mjs`,
      ].join("\n"),
      2,
    );
  }

  const p = ready.probe;
  console.log(
    `[tauri-dev] OK: Vite reachable at ${RADCONTROL_DEV_URL} (root=${p.rootStatus}, vite=${p.viteStatus}, main=${p.mainStatus})`,
  );

  console.log(`[tauri-dev] Starting Tauri dev...`);
  startTauri(repoRoot);
}

main().catch((err) => {
  die(`[tauri-dev] ERROR: ${String(err?.message || err)}`, 2);
});

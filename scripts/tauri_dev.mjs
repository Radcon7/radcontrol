import {
  DEV_READY_TIMEOUT_MS,
  RADCONTROL_DEV_URL,
  detectPackageManager,
  die,
  ensureRepoCwd,
  maybePrintEpermBindGuidance,
  probeRadcontrolDevServer,
  repoRootFromMeta,
  spawnChild,
  waitForExit,
  waitForRadcontrolDevServer,
} from "./dev_local_lib.mjs";

async function main() {
  const repoRoot = repoRootFromMeta(import.meta.url);
  ensureRepoCwd({ repoRoot });

  const pm = detectPackageManager(repoRoot);
  console.log(`[tauri-dev] repo: ${repoRoot}`);
  console.log(`[tauri-dev] package manager: ${pm.name}`);
  console.log(`[tauri-dev] canonical dev url: ${RADCONTROL_DEV_URL}`);

  const initialProbe = await probeRadcontrolDevServer(RADCONTROL_DEV_URL);
  let viteChild = null;

  if (initialProbe.ok) {
    console.log(`[tauri-dev] Reusing existing RadControl Vite server on ${RADCONTROL_DEV_URL}`);
  } else if (initialProbe.kind === "wrong-server") {
    die(
      [
        `[tauri-dev] ERROR: port 1420 is already in use by a non-RadControl server`,
        `  - ${initialProbe.details}`,
        "",
        `Fix: stop that process, then rerun:`,
        `  node scripts/tauri_dev.mjs`,
      ].join("\n"),
      5,
    );
  } else {
    const viteCmd = pm.runScript("vite:dev");
    console.log(`[tauri-dev] Starting Vite (${pm.name}) and waiting up to ${Math.round(DEV_READY_TIMEOUT_MS / 1000)}s...`);
    viteChild = spawnChild({ cmd: viteCmd.cmd, args: viteCmd.args, cwd: repoRoot });

    const viteExitPromise = waitForExit(viteChild, "vite:dev");
    const readyPromise = waitForRadcontrolDevServer({ baseUrl: RADCONTROL_DEV_URL, timeoutMs: DEV_READY_TIMEOUT_MS });

    const first = await Promise.race([
      viteExitPromise.then((v) => ({ type: "vite-exit", ...v })),
      readyPromise.then((v) => ({ type: "ready", probe: v })),
    ]);

    if (first.type === "vite-exit") {
      await maybePrintEpermBindGuidance({
        context: "Vite exited before dev server became reachable.",
      });
      die(
        [
          `[tauri-dev] ERROR: Vite exited before RadControl became reachable`,
          first.signal ? `  - signal: ${first.signal}` : `  - exit code: ${String(first.code)}`,
          "",
          `Fix: resolve the Vite error shown above, then rerun node scripts/tauri_dev.mjs`,
        ].join("\n"),
        6,
      );
    }

    if (!first.probe.ok) {
      killChild(viteChild);
      if (first.probe.kind === "wrong-server") {
        die(
          [
            `[tauri-dev] ERROR: a server on port 1420 came up, but it is not RadControl`,
            `  - ${first.probe.details}`,
            "",
            `Fix: stop the conflicting process and rerun node scripts/tauri_dev.mjs`,
          ].join("\n"),
          7,
        );
      }
      die(
        [
          `[tauri-dev] ERROR: timed out waiting for RadControl Vite (${Math.round(DEV_READY_TIMEOUT_MS / 1000)}s)`,
          `  - last probe: ${first.probe.details || "unreachable"}`,
          "",
          `Fix: review Vite output above and rerun node scripts/tauri_dev.mjs`,
        ].join("\n"),
        8,
      );
    }

    console.log(`[tauri-dev] Vite is ready at ${RADCONTROL_DEV_URL}`);

    const onSignal = (signal) => {
      if (viteChild) killChild(viteChild, signal);
    };
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);
  }

  const tauriCmd = pm.runScript("tauri", ["dev"]);
  console.log(`[tauri-dev] Launching Tauri dev...`);
  const tauriChild = spawnChild({
    cmd: tauriCmd.cmd,
    args: tauriCmd.args,
    cwd: repoRoot,
    env: { ...process.env, RADCONTROL_TAURI_LOCAL_DEV: "1" },
  });

  const tauriExit = await waitForExit(tauriChild, "tauri dev");
  if (viteChild) killChild(viteChild);

  if (tauriExit.code === 0) {
    return;
  }

  die(
    [
      `[tauri-dev] ERROR: Tauri dev exited`,
      tauriExit.signal
        ? `  - signal: ${tauriExit.signal}`
        : `  - exit code: ${String(tauriExit.code)}`,
      "",
      `If Vite logs above look healthy, rerun and inspect the Tauri error output.`,
    ].join("\n"),
    typeof tauriExit.code === "number" && tauriExit.code > 0 ? tauriExit.code : 9,
  );
}

function killChild(child, signal = "SIGTERM") {
  if (!child || child.killed) return;
  try {
    child.kill(signal);
  } catch {
    // ignore shutdown races
  }
}

main().catch((err) => {
  die(`[tauri-dev] ERROR: ${String(err?.message || err)}`, 1);
});

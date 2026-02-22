// scripts/tauri_preflight.mjs
// Fail-fast check for Tauri dev attach mode.
// Purpose: prevent "Waiting for frontend dev server..." by exiting with a clear message
// when devUrl (http://localhost:1420) is not reachable.
// This is dev ergonomics only; it does NOT start Vite.

const URL = process.env.RADCONTROL_DEV_URL || "http://localhost:1420";
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
  } catch (e) {
    return { ok: false, err: e?.name || String(e) };
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  // Try a couple of quick probes to avoid false negatives during startup.
  const tries = 3;
  for (let i = 1; i <= tries; i++) {
    const r = await probeOnce(URL, TIMEOUT_MS);
    if (r.ok) {
      console.log(
        `[tauri-preflight] OK: frontend reachable at ${URL} (HTTP ${r.status})`,
      );
      process.exit(0);
    }
    if (i < tries) await sleep(250);
  }

  console.error("");
  console.error(
    `[tauri-preflight] ERROR: frontend dev server is NOT reachable at ${URL}`,
  );
  console.error("");
  console.error("Expected dev attach model:");
  console.error(
    "  - Start Vite on port 1420 (e.g. `npm run vite:dev`) OR use O2 `radcontrol.dev`",
  );
  console.error("  - Then run Tauri dev attach");
  console.error("");
  console.error("Why you saw the hang:");
  console.error("  - Tauri devUrl is hard-set to http://localhost:1420");
  console.error(
    "  - beforeDevCommand was a no-op, so Tauri waited indefinitely",
  );
  console.error("");
  process.exit(2);
}

main().catch((e) => {
  console.error("[tauri-preflight] ERROR:", e);
  process.exit(2);
});

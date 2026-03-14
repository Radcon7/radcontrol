import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {
  DEV_READY_TIMEOUT_MS,
  RADCONTROL_DEV_URL,
  commandVersion,
  detectPackageManager,
  ensureRepoCwd,
  maybePrintEpermBindGuidance,
  probeRadcontrolDevServer,
  readTauriDevUrl,
  repoRootFromMeta,
  spawnChild,
  waitForExit,
  waitForRadcontrolDevServer,
} from "./dev_local_lib.mjs";

async function main() {
  const repoRoot = repoRootFromMeta(import.meta.url);
  ensureRepoCwd({ repoRoot });
  const failures = [];

  console.log("[sanity] RadControl local dev sanity check");
  console.log(`[sanity] repo root: ${repoRoot}`);

  const pm = detectPackageManager(repoRoot);
  console.log(`[sanity] package manager: ${pm.name}`);

  console.log("\n[sanity] Repos detected");
  const repos = detectRelevantRepos(repoRoot);
  for (const repo of repos) {
    console.log(`  - ${repo.key}: ${repo.path} ${repo.exists ? "(present)" : "(missing)"}`);
  }

  console.log("\n[sanity] Tool checks");
  const nodeV = await commandVersion("node", ["--version"]);
  if (!nodeV.ok) failures.push(`node not usable: ${nodeV.error || nodeV.stderr || "unknown error"}`);
  console.log(`  - node: ${nodeV.ok ? nodeV.stdout : `FAIL (${nodeV.error || nodeV.stderr})`}`);

  const pmV = await commandVersion(pm.name, ["--version"]);
  if (!pmV.ok) failures.push(`${pm.name} not usable: ${pmV.error || pmV.stderr || "unknown error"}`);
  console.log(`  - ${pm.name}: ${pmV.ok ? (pmV.stdout || pmV.stderr || "ok") : `FAIL (${pmV.error || pmV.stderr})`}`);

  const tauriCheck = await commandVersion(pm.runScript("tauri", ["--version"]).cmd, pm.runScript("tauri", ["--version"]).args, 12_000);
  const tauriDetail = tauriCheck.ok ? (tauriCheck.stdout || tauriCheck.stderr || "ok") : (tauriCheck.error || tauriCheck.stderr || tauriCheck.stdout || "failed");
  if (!tauriCheck.ok) failures.push(`Tauri CLI check failed: ${tauriDetail}`);
  console.log(`  - tauri CLI: ${tauriCheck.ok ? tauriDetail : `FAIL (${tauriDetail})`}`);

  console.log("\n[sanity] Config checks");
  const { devUrl } = await readTauriDevUrl(repoRoot);
  if (devUrl !== RADCONTROL_DEV_URL) {
    failures.push(`tauri.conf.json devUrl is ${devUrl}; expected ${RADCONTROL_DEV_URL}`);
    console.log(`  - tauri devUrl: FAIL (${devUrl})`);
  } else {
    console.log(`  - tauri devUrl: OK (${devUrl})`);
  }

  const rcPort = await parseRadcontrolPort(repoRoot);
  if (rcPort !== 1420) {
    failures.push(`vite.config.ts port is ${String(rcPort)}; expected 1420`);
    console.log(`  - radcontrol vite port: FAIL (${String(rcPort)})`);
  } else {
    console.log(`  - radcontrol vite port: OK (${rcPort})`);
  }

  const portRows = await collectKnownRepoPorts(repos);
  const duplicates = findDuplicatePorts(portRows);
  for (const row of portRows) {
    console.log(`  - port map: ${row.key} -> ${row.port} (${row.source})`);
  }
  if (duplicates.length) {
    for (const dup of duplicates) {
      failures.push(`duplicate port ${dup.port}: ${dup.keys.join(", ")}`);
      console.log(`  - duplicate port: FAIL ${dup.port} (${dup.keys.join(", ")})`);
    }
  } else {
    console.log("  - duplicate ports: OK (none among detected repos)");
  }

  console.log("\n[sanity] Dev server smoke check (bounded)");
  const existing = await probeRadcontrolDevServer(RADCONTROL_DEV_URL);
  if (existing.ok) {
    console.log(`  - existing server: OK (RadControl already running at ${RADCONTROL_DEV_URL})`);
  } else if (existing.kind === "wrong-server") {
    failures.push(`port 1420 serves wrong app\n${existing.details}`);
    console.log("  - existing server: FAIL (wrong app on 1420)");
    console.log(`    ${existing.details}`);
  } else {
    const viteCmd = pm.runScript("vite:dev");
    console.log(`  - existing server: none (starting smoke Vite via ${pm.name})`);
    const vite = spawnChild({ cmd: viteCmd.cmd, args: viteCmd.args, cwd: repoRoot });
    const first = await Promise.race([
      waitForExit(vite, "vite:dev").then((v) => ({ type: "exit", ...v })),
      waitForRadcontrolDevServer({ baseUrl: RADCONTROL_DEV_URL, timeoutMs: Math.min(DEV_READY_TIMEOUT_MS, 20_000) }).then((v) => ({ type: "ready", probe: v })),
    ]);

    if (first.type === "exit") {
      await maybePrintEpermBindGuidance({
        context: "Vite smoke start exited early.",
      });
      failures.push(`Vite smoke start exited early (code=${String(first.code)} signal=${String(first.signal)})`);
      console.log(`  - smoke start: FAIL (vite exited early)`);
    } else if (!first.probe.ok) {
      failures.push(`Vite smoke start did not produce RadControl on ${RADCONTROL_DEV_URL}: ${first.probe.details || first.probe.kind}`);
      console.log(`  - smoke start: FAIL (${first.probe.kind})`);
      console.log(`    ${first.probe.details || "no details"}`);
    } else {
      console.log(`  - smoke start: OK (${RADCONTROL_DEV_URL})`);
    }

    killChild(vite);
  }

  if (failures.length) {
    console.log("\n[sanity] RESULT: FAIL");
    for (const f of failures) {
      console.log(`  - ${f}`);
    }
    console.log("\n[sanity] Next step: run `node scripts/tauri_dev.mjs` from the repo root after fixing the items above.");
    process.exit(1);
  }

  console.log("\n[sanity] RESULT: PASS");
  console.log(`[sanity] Golden path: cd ${repoRoot} && node scripts/tauri_dev.mjs`);
}

function detectRelevantRepos(radcontrolRepoRoot) {
  const empireRoot = path.resolve(radcontrolRepoRoot, "../../../");
  return [
    { key: "radcontrol", path: radcontrolRepoRoot, exists: fs.existsSync(radcontrolRepoRoot) },
    { key: "dqotd", path: path.join(empireRoot, "radcon", "dev", "charliedino"), exists: fs.existsSync(path.join(empireRoot, "radcon", "dev", "charliedino")) },
    { key: "tbis", path: path.join(empireRoot, "radcon", "dev", "tbis"), exists: fs.existsSync(path.join(empireRoot, "radcon", "dev", "tbis")) },
    { key: "offroad", path: path.join(empireRoot, "radwolfe", "dev", "offroadcroquet"), exists: fs.existsSync(path.join(empireRoot, "radwolfe", "dev", "offroadcroquet")) },
    { key: "o2", path: path.join(path.dirname(empireRoot), "o2"), exists: fs.existsSync(path.join(path.dirname(empireRoot), "o2")) },
  ];
}

async function parseRadcontrolPort(repoRoot) {
  const fp = path.join(repoRoot, "vite.config.ts");
  const raw = await fsp.readFile(fp, "utf8");
  const m = raw.match(/RADCONTROL_VITE_PORT\s*=\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

async function collectKnownRepoPorts(repos) {
  const rows = [];
  for (const repo of repos) {
    if (!repo.exists) continue;
    if (repo.key === "radcontrol") {
      rows.push({ key: repo.key, port: 1420, source: "vite.config.ts + tauri.conf.json" });
      continue;
    }
    if (!["dqotd", "tbis", "offroad"].includes(repo.key)) continue;
    const pkgPath = path.join(repo.path, "package.json");
    if (!fs.existsSync(pkgPath)) continue;
    let port = null;
    let source = "package.json scripts.dev";
    try {
      const pkg = JSON.parse(await fsp.readFile(pkgPath, "utf8"));
      const devScript = String(pkg?.scripts?.dev || "");
      const m = devScript.match(/(?:^|\s)-p\s+(\d+)(?:\s|$)/);
      if (m) {
        port = Number(m[1]);
      } else if (repo.key === "dqotd") {
        port = 3000;
        source = "next default (no -p override)";
      }
    } catch {
      // ignore parse errors; the caller will just miss the row
    }
    if (port) rows.push({ key: repo.key, port, source });
  }
  return rows;
}

function findDuplicatePorts(rows) {
  const byPort = new Map();
  for (const row of rows) {
    if (!byPort.has(row.port)) byPort.set(row.port, []);
    byPort.get(row.port).push(row.key);
  }
  const out = [];
  for (const [port, keys] of byPort.entries()) {
    if (keys.length > 1) out.push({ port, keys });
  }
  return out.sort((a, b) => a.port - b.port);
}

function killChild(child) {
  if (!child || child.killed) return;
  try {
    child.kill("SIGTERM");
  } catch {
    // ignore
  }
}

main().catch((err) => {
  console.error(`[sanity] ERROR: ${String(err?.message || err)}`);
  process.exit(1);
});

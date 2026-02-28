import fs from "node:fs";
import fsp from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

export const RADCONTROL_HOST = "127.0.0.1";
export const RADCONTROL_PORT = 1420;
export const RADCONTROL_DEV_URL = `http://${RADCONTROL_HOST}:${RADCONTROL_PORT}`;
export const DEV_READY_TIMEOUT_MS = 90_000;
export const HTTP_PROBE_TIMEOUT_MS = 1_500;
export const RADCONTROL_HTML_FINGERPRINT =
  'name="radcontrol-dev-fingerprint" content="radcontrol-app"';

export function repoRootFromMeta(metaUrl) {
  return path.resolve(path.dirname(fileURLToPath(metaUrl)), "..");
}

export function normalizePath(p) {
  return path.resolve(p);
}

export function ensureRepoCwd({ repoRoot, repoName = "radcontrol-app" }) {
  const cwd = normalizePath(process.cwd());
  if (cwd !== normalizePath(repoRoot)) {
    die(
      [
        `[local-dev] ERROR: wrong directory`,
        `  - current: ${cwd}`,
        `  - expected: ${repoRoot}`,
        "",
        `Run from repo root:`,
        `  cd ${repoRoot}`,
        `  node scripts/tauri_dev.mjs`,
      ].join("\n"),
      2,
    );
  }

  const pkgPath = path.join(repoRoot, "package.json");
  if (!fs.existsSync(pkgPath)) {
    die(
      `[local-dev] ERROR: package.json not found in ${repoRoot} (${repoName})`,
      2,
    );
  }
}

export function die(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

export function readPositiveIntEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${name} must be a positive number (got: ${raw})`);
  }
  return Math.trunc(n);
}

export async function readJsonFile(fp) {
  const raw = await fsp.readFile(fp, "utf8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in ${fp}: ${String(err)}`);
  }
}

export async function readTauriDevUrl(repoRoot) {
  const tauriConfPath = path.join(repoRoot, "src-tauri", "tauri.conf.json");
  const cfg = await readJsonFile(tauriConfPath);
  const devUrl = cfg?.build?.devUrl;
  if (typeof devUrl !== "string" || !devUrl.trim()) {
    throw new Error(`Missing build.devUrl in ${tauriConfPath}`);
  }
  return { devUrl: devUrl.trim(), tauriConfPath };
}

export function detectPackageManager(repoRoot) {
  const hasPnpm = fs.existsSync(path.join(repoRoot, "pnpm-lock.yaml"));
  const hasYarn = fs.existsSync(path.join(repoRoot, "yarn.lock"));
  const hasNpm = fs.existsSync(path.join(repoRoot, "package-lock.json"));

  if (hasPnpm) {
    return {
      name: "pnpm",
      runScript(script, extraArgs = []) {
        return {
          cmd: "pnpm",
          args: ["run", script, ...withDoubleDash(extraArgs)],
        };
      },
    };
  }

  if (hasYarn) {
    return {
      name: "yarn",
      runScript(script, extraArgs = []) {
        return { cmd: "yarn", args: ["run", script, ...extraArgs] };
      },
    };
  }

  if (hasNpm) {
    return {
      name: "npm",
      runScript(script, extraArgs = []) {
        return {
          cmd: "npm",
          args: ["run", script, ...withDoubleDash(extraArgs)],
        };
      },
    };
  }

  throw new Error(
    `No supported lockfile found in ${repoRoot} (expected pnpm-lock.yaml, yarn.lock, or package-lock.json)`,
  );
}

function withDoubleDash(extraArgs) {
  if (!extraArgs.length) return [];
  return ["--", ...extraArgs];
}

export function spawnChild({
  cmd,
  args,
  cwd,
  env = process.env,
  stdio = "inherit",
}) {
  return spawn(cmd, args, { cwd, env, stdio });
}

export async function maybePrintEpermBindGuidance({
  port = RADCONTROL_PORT,
  host = RADCONTROL_HOST,
  context = "",
} = {}) {
  const diag = await collectPortBindDiagnostics({ port, host });
  if (diag.bindProbe?.code !== "EPERM") {
    return false;
  }

  const title = context ? `[local-dev] ${context}` : "[local-dev]";
  const nodePathLine = diag.nodePath
    ? `  - node path: ${diag.nodePath}`
    : "  - node path: (not found)";
  const nodeRealPathLine = diag.nodeRealPath
    ? `  - node realpath: ${diag.nodeRealPath}`
    : "  - node realpath: (unresolved)";
  const sandboxHintLine = diag.nodeSandboxHint
    ? `  - node packaging hint: ${diag.nodeSandboxHint}`
    : "  - node packaging hint: none detected (snap/flatpak not obvious)";
  const sysctlLine = diag.unprivilegedPortStart?.ok
    ? `  - net.ipv4.ip_unprivileged_port_start = ${diag.unprivilegedPortStart.value}`
    : `  - net.ipv4.ip_unprivileged_port_start: ${diag.unprivilegedPortStart?.detail || "unavailable"}`;
  const sysctlMeaning =
    diag.unprivilegedPortStart?.ok && diag.unprivilegedPortStart.value > port
      ? `  - meaning: ${port} is below the unprivileged threshold, so non-root Node cannot bind it`
      : `  - meaning: if the value is > ${port}, port ${port} is treated as privileged for unprivileged processes`;
  const ssLine = diag.ssCheck?.detail
    ? `  - ss check now: ${diag.ssCheck.detail}`
    : "  - ss check now: unavailable";

  console.error(
    [
      "",
      `${title} EPERM bind diagnosis for ${host}:${port}`,
      "Short checklist (read-only checks + next actions):",
      "  1) Check the kernel threshold:",
      "     sysctl net.ipv4.ip_unprivileged_port_start",
      `     If that value is > ${port}, then ${port} is treated as privileged and unprivileged Node cannot bind it.`,
      "  2) Check whether the port is already in use (to rule out EADDRINUSE):",
      `     ss -ltnp | grep ':${port}' || true`,
      "  3) Run the minimal Node bind reproduction:",
      `     node -e "require('node:net').createServer().once('error',e=>{console.error(e.code,e.message);process.exit(1)}).listen(${port},'${host}',()=>{console.log('OK bind ${host}:${port}');process.exit(0)})"`,
      "  4) Simplest fix paths (do not change system from this script):",
      "     - Restore the usual unprivileged threshold (commonly 1024) if your environment changed it",
      `     - Or move the canonical RadControl dev port above the threshold and keep the port invariant aligned in one place`,
      "",
      "Observed on this machine:",
      sysctlLine,
      sysctlMeaning,
      ssLine,
      nodePathLine,
      nodeRealPathLine,
      sandboxHintLine,
      diag.bindProbe?.detail
        ? `  - bind repro result: ${diag.bindProbe.detail}`
        : "  - bind repro result: unavailable",
      "",
    ].join("\n"),
  );

  return true;
}

export function waitForExit(child, label) {
  return new Promise((resolve, reject) => {
    child.once("error", (err) => {
      reject(
        new Error(`${label} failed to start: ${String(err.message || err)}`),
      );
    });
    child.once("exit", (code, signal) => {
      resolve({ code, signal });
    });
  });
}

export async function fetchText(url, timeoutMs = HTTP_PROBE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const text = await res.text();
    return {
      ok: true,
      status: res.status,
      text,
      contentType: res.headers.get("content-type") || "",
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function probeRadcontrolDevServer(
  baseUrl,
  timeoutMs = HTTP_PROBE_TIMEOUT_MS,
) {
  // What we want to prove:
  // - The RadControl Vite dev server is serving on baseUrl
  // - Root is reachable
  // - Vite client is reachable at /@vite/client
  // - Your app entry is reachable at /src/main.tsx (dev mode)
  //
  // If root is up but Vite client is NOT, it's likely "wrong server" on that port.

  const rootUrl = new URL("/", baseUrl).toString();
  const viteUrl = new URL("/@vite/client", baseUrl).toString();
  const mainUrl = new URL("/src/main.tsx", baseUrl).toString();

  async function hit(url) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      return { ok: true, status: res.status };
    } catch (e) {
      return { ok: false, status: 0, err: e };
    }
  }

  const root = await hit(rootUrl);
  const vite = await hit(viteUrl);
  const main = await hit(mainUrl);

  const rootStatus = root.ok ? root.status : 0;
  const viteStatus = vite.ok ? vite.status : 0;
  const mainStatus = main.ok ? main.status : 0;

  // If nothing answers, it's simply down.
  if (!root.ok && !vite.ok && !main.ok) {
    return {
      ok: false,
      kind: "down",
      rootStatus,
      viteStatus,
      mainStatus,
      details: `no endpoints reachable at ${baseUrl}`,
    };
  }

  // "Wrong server" means: something is answering on /, but it is NOT a Vite dev server.
  // Vite dev should serve /@vite/client (200/304 typical).
  const viteLooksOk = viteStatus === 200 || viteStatus === 304;
  if (root.ok && !viteLooksOk) {
    return {
      ok: false,
      kind: "wrong-server",
      rootStatus,
      viteStatus,
      mainStatus,
      details: `root is up but /@vite/client is not (status=${viteStatus || "no response"})`,
    };
  }

  // "OK" means: root + Vite client are live.
  // main.tsx may be 200 in dev; if it isn't, still allow as OK because some setups
  // may not expose source entry directly (but root+vite is the key).
  if (root.ok && viteLooksOk) {
    return {
      ok: true,
      kind: "ok",
      rootStatus,
      viteStatus,
      mainStatus,
      details: `root=${rootStatus}, vite=${viteStatus}, main=${mainStatus}`,
    };
  }

  // Anything else is "degraded" (reachable but not clearly ok/wrong).
  return {
    ok: false,
    kind: "degraded",
    rootStatus,
    viteStatus,
    mainStatus,
    details: `reachable but not clearly ok: root=${rootStatus}, vite=${viteStatus}, main=${mainStatus}`,
  };
}
export async function waitForRadcontrolDevServer(
  baseUrl,
  timeoutMs,
  probeTimeoutMs = 750,
  pollMs = 250,
) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const probe = await probeRadcontrolDevServer(baseUrl, probeTimeoutMs);
    if (probe.ok) return { ok: true, probe };
    if (probe.kind === "wrong-server")
      return { ok: false, kind: "wrong-server", probe };
    await new Promise((r) => setTimeout(r, pollMs));
  }

  return { ok: false, kind: "timeout" };
}
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function commandVersion(
  cmd,
  args = ["--version"],
  timeoutMs = 5_000,
) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      resolve({ ok: false, error: `timeout after ${timeoutMs}ms` });
    }, timeoutMs);

    child.stdout.on("data", (buf) => {
      stdout += String(buf);
    });
    child.stderr.on("data", (buf) => {
      stderr += String(buf);
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, error: String(err.message || err) });
    });
    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: code === 0,
        code,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });
  });
}

async function collectPortBindDiagnostics({ port, host }) {
  const [unprivilegedPortStart, nodePath, nodeRealPath, ssCheck, bindProbe] =
    await Promise.all([
      readUnprivilegedPortStart(),
      Promise.resolve(process.execPath || null),
      resolveNodeRealPath(),
      checkListeningPortFromProc(port),
      probeNodeBind({ port, host }),
    ]);

  return {
    unprivilegedPortStart,
    nodePath,
    nodeRealPath,
    nodeSandboxHint: detectNodeSandboxHint(nodePath, nodeRealPath),
    ssCheck,
    bindProbe,
  };
}

async function resolveNodeRealPath() {
  try {
    return await fsp.realpath(process.execPath);
  } catch {
    return null;
  }
}

function detectNodeSandboxHint(nodePath, nodeRealPath) {
  const joined = [nodePath, nodeRealPath]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!joined) return "";
  if (joined.includes("/snap/"))
    return "node appears to come from Snap; confinement can block local binds";
  if (joined.includes("flatpak"))
    return "node path mentions Flatpak; sandboxing can block local binds";
  return "";
}

async function readUnprivilegedPortStart() {
  const procPath = "/proc/sys/net/ipv4/ip_unprivileged_port_start";
  try {
    const raw = (await fsp.readFile(procPath, "utf8")).trim();
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      return {
        ok: false,
        detail: `unexpected ${procPath} contents: ${raw || "(empty)"}`,
      };
    }
    return { ok: true, value: Math.trunc(n) };
  } catch (err) {
    return { ok: false, detail: String(err?.message || err) };
  }
}

async function checkListeningPortFromProc(port) {
  try {
    const listening = [];
    for (const fp of ["/proc/net/tcp", "/proc/net/tcp6"]) {
      if (!fs.existsSync(fp)) continue;
      const raw = await fsp.readFile(fp, "utf8");
      const rows = raw.split(/\r?\n/).slice(1).filter(Boolean);
      for (const row of rows) {
        const cols = row.trim().split(/\s+/);
        const local = cols[1] || "";
        const state = cols[3] || "";
        if (state !== "0A") continue; // LISTEN
        const portHex = local.split(":")[1];
        if (!portHex) continue;
        const parsedPort = Number.parseInt(portHex, 16);
        if (parsedPort === port) {
          listening.push(`${path.basename(fp)} LISTEN ${local}`);
        }
      }
    }
    return {
      ok: true,
      detail: listening.length
        ? listening.join("; ")
        : `no listener on :${port}`,
    };
  } catch (err) {
    return { ok: false, detail: String(err?.message || err) };
  }
}

async function probeNodeBind({ port, host }) {
  return new Promise((resolve) => {
    const server = net.createServer();
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        server.close();
      } catch {
        // ignore
      }
      resolve({ ok: false, code: "TIMEOUT", detail: "bind probe timed out" });
    }, 4_000);

    server.once("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        code: String(err?.code || ""),
        detail:
          `${String(err?.code || "ERROR")} ${String(err?.message || err)}`.trim(),
      });
    });

    server.listen(port, host, () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      server.close(() => {
        resolve({ ok: true, detail: `OK bind ${host}:${port}` });
      });
    });
  });
}

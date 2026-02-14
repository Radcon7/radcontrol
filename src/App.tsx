import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

type TabKey = "chat" | "projects" | "roadmap" | "personal";

type PortStatus = {
  port: number;
  listening: boolean;
  pid?: number | null;
  cmd?: string | null;
  err?: string | null;
};

type LogMsg = { who: "me" | "o2"; text: string };

type ProjectKey = string;

type ProjectRow = {
  key: ProjectKey;
  label: string;
  repoHint?: string;
  port?: number;
  url?: string;

  // Existing O2 hooks
  o2StartKey?: string;
  o2SnapshotKey?: string;
  o2CommitKey?: string;

  // New: per-project tooling map (Codex/O2 resources + constraints)
  o2MapKey?: string;

  // New: empire-only proof pack (system-wide O2+Codex capabilities snapshot)
  o2ProofPackKey?: string;
};

type ProjectOrg = "radcon" | "radwolfe" | "labs" | "other";
type ProjectKind = "nextjs" | "tauri" | "python" | "docs" | "static" | "other";

type AddProjectPayload = {
  // Identity
  key: string; // slug, e.g. "radcrm"
  label: string; // display name
  org: ProjectOrg;

  // Location
  repoPath: string; // full path
  repoHint?: string; // brief hint shown in list

  // Runtime
  kind: ProjectKind;
  port?: number;
  url?: string;

  // O2 hooks (optional)
  o2StartKey?: string;
  o2SnapshotKey?: string;
  o2CommitKey?: string;
  o2MapKey?: string;
  o2ProofPackKey?: string;

  // Notes
  notes?: string;
};

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button className={`tab ${active ? "tabActive" : ""}`} onClick={onClick}>
      {children}
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="sectionTitle">{children}</div>;
}

function fmtErr(e: unknown) {
  if (!e) return "Unknown error";

  if (typeof e === "object") {
    const any = e as any;

    const direct =
      any?.error ??
      any?.message ??
      any?.cause?.error ??
      any?.cause?.message ??
      any?.data?.error ??
      any?.data?.message;

    if (typeof direct === "string" && direct.trim()) return direct;

    // Sometimes: { error: { message: "..." } }
    if (typeof direct === "object" && direct) {
      const nested = direct?.message ?? direct?.error;
      if (typeof nested === "string" && nested.trim()) return nested;
    }

    if (typeof any?.toString === "function") {
      const s = String(any);
      if (s && s !== "[object Object]") return s;
    }

    try {
      return JSON.stringify(e, null, 2);
    } catch {
      return "[unstringifiable error object]";
    }
  }

  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message + (e.stack ? `\n${e.stack}` : "");
  return String(e);
}

function slugify(s: string) {
  return (s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function isValidSlug(s: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s);
}

function asPort(n: string) {
  const v = Number(n);
  if (!Number.isFinite(v)) return undefined;
  if (v < 1 || v > 65535) return undefined;
  return Math.trunc(v);
}

export default function App() {
  const [tab, setTab] = useState<TabKey>("projects");
  const [_chat, setChat] = useState<LogMsg[]>([
    { who: "o2", text: "RadControl online. Start a session from Projects." },
  ]);

  const [log, setLog] = useState("");
  const [busy, setBusy] = useState(false);

  const appendLog = (s: string) => {
    setLog((prev) => (prev ? prev + "\n" + s : s));
  };

  function clearLogs() {
    setLog("");
  }

  // --- Projects config (single source of truth) ---
  const BASE_PROJECTS: ProjectRow[] = useMemo(
    () => [
      {
        key: "empire-tech",
        label: "Empire Technology",
        repoHint: "RadControl / O2 / patterns / proofpacks",
        o2SnapshotKey: "empire.snapshot",
        o2MapKey: "empire.map",
        o2ProofPackKey: "empire.proofpack",
      },
      {
        key: "empire-biz",
        label: "Empire Business",
        repoHint: "LLCs / legal / finance / governance (site + docs soon)",
        // Temporary: same working keys until empire-biz gets its own repo/tooling
        o2SnapshotKey: "empire.snapshot",
        o2MapKey: "empire.map",
        o2ProofPackKey: "empire.proofpack",
      },
      {
        key: "tbis",
        label: "TBIS",
        repoHint: "radcon/dev/tbis",
        port: 3001,
        url: "http://localhost:3001",
        o2StartKey: "tbis.dev",
        o2SnapshotKey: "tbis.snapshot",
        o2CommitKey: "tbis.commit",
        o2MapKey: "tbis.map",
      },
      {
        key: "dqotd",
        label: "DQOTD",
        repoHint: "radcon/dev/charliedino",
        port: 3000,
        url: "http://localhost:3000/dqotd",
        o2StartKey: "dqotd.dev",
        o2SnapshotKey: "dqotd.snapshot",
        o2CommitKey: "dqotd.commit",
        o2MapKey: "dqotd.map",
      },
      {
        key: "offroad",
        label: "Offroad Croquet",
        repoHint: "radwolfe/dev/offroadcroquet",
        port: 3002,
        url: "http://localhost:3002",
        o2StartKey: "offroad.dev",
        o2SnapshotKey: "offroad.snapshot",
        o2CommitKey: "offroad.commit",
        o2MapKey: "offroad.map",
      },
      {
        key: "radstock",
        label: "RadStock",
        repoHint: "TBD",
        o2MapKey: "radstock.map",
      },
      {
        key: "radcrm",
        label: "RadCRM",
        repoHint:
          "radcon/dev/radcrm — Companies / People / Interactions / Trips / Campaigns",
        port: 3011,
        url: "http://localhost:3011",
      },
    ],
    [],
  );
  const [projects, setProjects] = useState<ProjectRow[]>([]);

  function mergeProjects(base: ProjectRow[], reg: any[]): ProjectRow[] {
    const byKey = new Map<string, ProjectRow>();
    for (const b of base) byKey.set(b.key, b);

    for (const r of reg) {
      if (!r || typeof r !== "object") continue;
      const key = typeof r.key === "string" ? r.key : "";
      if (!key) continue;

      // IMPORTANT: base wins for known keys; registry only adds new keys.
      if (byKey.has(key)) continue;

      const row: ProjectRow = {
        key,
        label: typeof r.label === "string" ? r.label : key,
        repoHint: typeof r.repoHint === "string" ? r.repoHint : undefined,
        port: typeof r.port === "number" ? r.port : undefined,
        url: typeof r.url === "string" ? r.url : undefined,
        o2StartKey: typeof r.o2StartKey === "string" ? r.o2StartKey : undefined,
        o2SnapshotKey:
          typeof r.o2SnapshotKey === "string" ? r.o2SnapshotKey : undefined,
        o2CommitKey:
          typeof r.o2CommitKey === "string" ? r.o2CommitKey : undefined,
        o2MapKey: typeof r.o2MapKey === "string" ? r.o2MapKey : undefined,
        o2ProofPackKey:
          typeof r.o2ProofPackKey === "string" ? r.o2ProofPackKey : undefined,
      };

      byKey.set(key, row);
    }

    return Array.from(byKey.values());
  }

  useEffect(() => {
    // Always start from base immediately (so UI isn't empty)
    setProjects(BASE_PROJECTS);

    // Then try to append registry projects
    (async () => {
      try {
        const raw = await invoke<string>("radpattern_list_projects");
        const reg = JSON.parse(raw);
        if (!Array.isArray(reg)) throw new Error("registry is not an array");
        const merged = mergeProjects(BASE_PROJECTS, reg);
        setProjects(merged);
        appendLog(
          `\n[radpattern] list projects OK: ${reg.length} registry rows → ${merged.length} total projects\n`,
        );
      } catch (e) {
        appendLog("\n[radpattern] list projects failed:\n" + fmtErr(e));
        // keep BASE_PROJECTS only
        setProjects(BASE_PROJECTS);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [BASE_PROJECTS]);
  const usedPorts = useMemo(() => {
    const s = new Set<number>();
    for (const p of projects) {
      if (typeof p.port === "number") s.add(p.port);
    }
    s.add(1420);
    return s;
  }, [projects]);

  function suggestPort() {
    // Prefer 3010-3099 block for new “internal apps”
    for (let p = 3010; p <= 3099; p++) {
      if (!usedPorts.has(p)) return p;
    }
    // Fallback: next available above 3000
    for (let p = 3000; p <= 3999; p++) {
      if (!usedPorts.has(p)) return p;
    }
    return undefined;
  }

  // --- Add Project modal state ---
  const [addOpen, setAddOpen] = useState(false);
  const [addErr, setAddErr] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);

  const defaultSuggestedPort = useMemo(() => suggestPort(), [usedPorts]); // stable enough
  const defaultPayload = useMemo<AddProjectPayload>(() => {
    const port = defaultSuggestedPort;
    return {
      key: "",
      label: "",
      org: "radcon",
      kind: "nextjs",
      repoPath: "",
      repoHint: "",
      port,
      url: typeof port === "number" ? `http://localhost:${port}` : "",
      o2StartKey: "",
      o2SnapshotKey: "",
      o2CommitKey: "",
      o2MapKey: "",
      o2ProofPackKey: "",
      notes: "",
    };
  }, [defaultSuggestedPort]);

  const [form, setForm] = useState<AddProjectPayload>(defaultPayload);

  function openAddProject() {
    setAddErr(null);
    setForm(defaultPayload);
    setAddOpen(true);
  }

  function closeAddProject() {
    if (addBusy) return;
    setAddOpen(false);
    setAddErr(null);
  }

  function setFormField<K extends keyof AddProjectPayload>(
    k: K,
    v: AddProjectPayload[K],
  ) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function inferRepoPath(org: ProjectOrg, key: string) {
    const slug = slugify(key);
    if (!slug) return "";
    // Canonical defaults (you can expand later)
    if (org === "radcon") return `~/dev/rad-empire/radcon/dev/${slug}`;
    if (org === "radwolfe") return `~/dev/rad-empire/radwolfe/dev/${slug}`;
    if (org === "labs") return `~/dev/rad-empire/radcon/dev/${slug}`;
    return `~/dev/rad-empire/${slug}`;
  }

  function validateAdd(p: AddProjectPayload) {
    const key = slugify(p.key);
    if (!key) return "Project Key is required.";
    if (!isValidSlug(key))
      return "Project Key must be lowercase letters/numbers with hyphens only (e.g. radcrm, offroad-croquet).";
    if (!p.label.trim()) return "Display Name is required.";
    if (!p.repoPath.trim()) return "Repo Path is required.";
    if (p.port != null) {
      if (typeof p.port !== "number" || p.port < 1 || p.port > 65535)
        return "Port must be a number between 1 and 65535.";
      if (usedPorts.has(p.port))
        return `Port ${p.port} is already in use by an existing project.`;
    }
    if (p.url && p.port && !p.url.includes(String(p.port))) {
      // not fatal, but usually a mistake
      return "URL doesn’t appear to match the chosen port.";
    }
    return null;
  }

  async function submitAddProject() {
    if (addBusy || busy) return;

    const normalized: AddProjectPayload = {
      ...form,
      key: slugify(form.key),
      label: form.label.trim(),
      repoPath: form.repoPath.trim(),
      repoHint: form.repoHint?.trim() || undefined,
      url: form.url?.trim() || undefined,
      o2StartKey: form.o2StartKey?.trim() || undefined,
      o2SnapshotKey: form.o2SnapshotKey?.trim() || undefined,
      o2CommitKey: form.o2CommitKey?.trim() || undefined,
      o2MapKey: form.o2MapKey?.trim() || undefined,
      o2ProofPackKey: form.o2ProofPackKey?.trim() || undefined,
      notes: form.notes?.trim() || undefined,
    };

    const err = validateAdd(normalized);
    if (err) {
      setAddErr(err);
      return;
    }

    setAddErr(null);
    setAddBusy(true);
    appendLog(
      `\n[radcontrol] Add Project requested:\n${JSON.stringify(normalized, null, 2)}\n`,
    );

    try {
      // radpattern will:
      // - scaffold dirs/app (optional)
      // - reserve/record port
      // - update O2 project registry
      const out = await invoke<string>("radpattern_add_project", {
        payload: normalized,
      });
      appendLog(out ? out.trimEnd() : "(no output)");

      // Immediately refresh registry-backed projects in the UI
      try {
        const raw = await invoke<string>("radpattern_list_projects");
        const reg = JSON.parse(raw);
        if (!Array.isArray(reg)) throw new Error("registry is not an array");
        const merged = mergeProjects(BASE_PROJECTS, reg);
        setProjects(merged);
        appendLog(
          `\n[radpattern] registry refreshed: ${merged.length} total projects\n`,
        );
      } catch (e2) {
        appendLog("\n[radpattern] registry refresh failed:\n" + fmtErr(e2));
        // keep whatever the UI already has
      }

      setChat((prev) => [
        ...prev,
        { who: "o2", text: `Add Project: ${normalized.label} complete.` },
      ]);
      setAddOpen(false);
    } catch (e) {
      const msg = fmtErr(e);
      appendLog("\n[radcontrol] Add Project ERROR:\n" + msg);
      setChat((prev) => [
        ...prev,
        { who: "o2", text: "Add Project failed. Check Logs." },
      ]);
      setAddErr(msg);
    } finally {
      setAddBusy(false);
    }
  }

  // ESC closes Add Project modal
  useEffect(() => {
    if (!addOpen) return;

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") closeAddProject();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addOpen, addBusy]);

  // Auto-helpers: when key changes, suggest defaults if fields are empty
  useEffect(() => {
    if (!addOpen) return;
    const key = slugify(form.key);
    // Suggest label if blank
    if (key && !form.label.trim()) {
      const pretty = key
        .split("-")
        .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
        .join(" ");
      setForm((prev) => ({ ...prev, label: pretty }));
    }
    // Suggest repoPath if blank
    if (key && !form.repoPath.trim()) {
      setForm((prev) => ({ ...prev, repoPath: inferRepoPath(prev.org, key) }));
    }
    // Suggest O2 keys if blank
    if (key && !form.o2MapKey?.trim()) {
      setForm((prev) => ({ ...prev, o2MapKey: `${key}.map` }));
    }
    if (key && !form.o2SnapshotKey?.trim()) {
      setForm((prev) => ({ ...prev, o2SnapshotKey: `${key}.snapshot` }));
    }
    if (key && !form.o2CommitKey?.trim()) {
      setForm((prev) => ({ ...prev, o2CommitKey: `${key}.commit` }));
    }
    if (
      key &&
      !form.o2StartKey?.trim() &&
      (form.kind === "nextjs" || form.kind === "tauri")
    ) {
      setForm((prev) => ({ ...prev, o2StartKey: `${key}.dev` }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addOpen, form.key]);

  // --- Port status per row ---
  const [portsBusy, setPortsBusy] = useState(false);
  const [ports, setPorts] = useState<Record<number, PortStatus | undefined>>(
    {},
  );

  const PORTS = useMemo(() => {
    const s = new Set<number>();
    for (const p of projects) {
      if (typeof p.port === "number") s.add(p.port);
    }
    s.add(1420);
    return Array.from(s.values()).sort((a, b) => a - b);
  }, [projects]);

  const refreshInFlightRef = useRef(false);
  const refreshQueuedRef = useRef(false);
  const burstTimerRef = useRef<number | null>(null);

  async function refreshPortsOnce() {
    if (refreshInFlightRef.current) {
      refreshQueuedRef.current = true;
      return;
    }
    refreshInFlightRef.current = true;
    setPortsBusy(true);

    try {
      const results = await Promise.all(
        PORTS.map(async (p): Promise<PortStatus> => {
          try {
            return await invoke<PortStatus>("port_status", { port: p });
          } catch (e) {
            const msg = fmtErr(e);
            return {
              port: p,
              listening: false,
              pid: null,
              cmd: null,
              err: msg,
            };
          }
        }),
      );

      setPorts((prev) => {
        const next: Record<number, PortStatus | undefined> = { ...prev };
        for (const r of results) next[r.port] = r;
        return next;
      });
    } finally {
      setPortsBusy(false);
      refreshInFlightRef.current = false;
      if (refreshQueuedRef.current) {
        refreshQueuedRef.current = false;
        setTimeout(() => void refreshPortsOnce(), 150);
      }
    }
  }

  function refreshPortsBurst() {
    if (burstTimerRef.current) window.clearTimeout(burstTimerRef.current);
    void refreshPortsOnce();
    burstTimerRef.current = window.setTimeout(() => {
      void refreshPortsOnce();
      burstTimerRef.current = null;
    }, 700);
  }

  async function freePort(port: number) {
    if (busy || portsBusy) return;
    setPortsBusy(true);
    try {
      appendLog(`\n[ports] Freeing port ${port} (best-effort)...`);
      await invoke("kill_port", { port });
      appendLog(`[ports] kill_port(${port}) OK`);
    } catch (e) {
      appendLog("\n[ports] kill_port ERROR:\n" + fmtErr(e));
    } finally {
      setPortsBusy(false);
      refreshPortsBurst();
    }
  }

  useEffect(() => {
    refreshPortsBurst();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tab === "projects") refreshPortsBurst();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // --- Logs controls ---
  async function copyLogsToClipboard() {
    try {
      await navigator.clipboard.writeText(log || "");
      setChat((prev) => [
        ...prev,
        { who: "o2", text: "Copied Logs to clipboard." },
      ]);
    } catch (e) {
      appendLog("\n[ui] Copy Logs failed:\n" + fmtErr(e));
    }
  }

  // --- O2 helpers ---
  async function runO2(title: string, key: string) {
    if (busy) return;
    setBusy(true);
    setChat((prev) => [...prev, { who: "me", text: `${title}…` }]);
    appendLog(`\n[o2] ${title} → run_o2("${key}")\n`);
    try {
      const out = await invoke<string>("run_o2", { key });
      appendLog(out ? out.trimEnd() : "(no output)");
      setChat((prev) => [
        ...prev,
        { who: "o2", text: `${title} complete. Output is in Logs.` },
      ]);
    } catch (e) {
      appendLog("\n[o2] ERROR:\n" + fmtErr(e));
      setChat((prev) => [
        ...prev,
        { who: "o2", text: `${title} failed. Check Logs.` },
      ]);
    } finally {
      setBusy(false);
      refreshPortsBurst();
    }
  }

  async function restartRadcontrolDev() {
    if (busy) return;
    setBusy(true);
    appendLog(`\n[radcontrol] Restart (Dev) requested…\n`);
    try {
      await invoke("restart_radcontrol_dev");
      appendLog(`[radcontrol] restart_radcontrol_dev invoked. Closing window…`);
      const win = getCurrentWindow();
      await win.close();
    } catch (e) {
      appendLog("\n[radcontrol] Restart failed:\n" + fmtErr(e));
      setChat((prev) => [
        ...prev,
        {
          who: "o2",
          text: "Restart failed. Check Logs + /tmp/radcontrol.restart.log",
        },
      ]);
      setBusy(false);
    }
  }

  // --- URL open ---
  async function openUrl(url?: string) {
    if (!url) return;

    // HARD RULE (A): RadControl should never open itself in a browser.
    // In Tauri dev, the UI is served from localhost:1420. Opening that in Chrome
    // breaks invoke() and causes "Command not found" confusion.
    try {
      const u = new URL(url);
      if (u.hostname === "localhost" && u.port === "1420") {
        appendLog(
          `\n[ui] Refusing to open RadControl UI in browser (${url}). Use the RadControl app window.\n`,
        );
        return;
      }
    } catch {
      // If it's not a valid URL, just fall through to the normal behavior
    }

    try {
      const out = await invoke<string>("open_url", { url });
      appendLog(`\n[ui] ${out}`);
      return;
    } catch (e) {
      appendLog("\n[ui] open_url ERROR:\n" + fmtErr(e));
    }

    try {
      await navigator.clipboard.writeText(url);
      appendLog(`\n[ui] URL copied to clipboard:\n${url}`);
    } catch (e) {
      appendLog("\n[ui] Clipboard copy failed:\n" + fmtErr(e));
    }
  }

  async function workOnProject(p: ProjectRow) {
    if (busy) return;

    const port = p.port;
    const s = typeof port === "number" ? ports[port] : undefined;
    const listening = Boolean(s?.listening);

    if (!listening && p.o2StartKey) {
      await runO2(`Start ${p.label}`, p.o2StartKey);
    } else if (!listening && !p.o2StartKey && typeof port === "number") {
      appendLog(
        `\n[workon] ${p.label}: not running, but no o2StartKey configured.\n`,
      );
    }

    await openUrl(p.url);
  }

  function statusForRow(p: ProjectRow) {
    if (typeof p.port !== "number") return { pill: "pillOff", text: "READY" };
    const s = ports[p.port];
    if (!s) return { pill: "pillWarn", text: "UNKNOWN" };
    return s.listening
      ? { pill: "pillOn", text: "RUNNING" }
      : { pill: "pillOff", text: "STOPPED" };
  }

  const titleText = useMemo(() => {
    if (tab === "projects") return "Start sessions the same way every time";
    if (tab === "chat") return "Chat";
    if (tab === "roadmap") return "Roadmap";
    return "Personal";
  }, [tab]);

  return (
    <div className="appShell">
      <header className="header">
        <div className="headerLeft">
          <div className="brand">RadControl</div>
          <div className="tagline">{titleText}</div>
        </div>

        <div className="tabs">
          <TabButton
            active={tab === "projects"}
            onClick={() => setTab("projects")}
          >
            Projects
          </TabButton>
          <TabButton active={tab === "chat"} onClick={() => setTab("chat")}>
            Chat
          </TabButton>
          <TabButton
            active={tab === "roadmap"}
            onClick={() => setTab("roadmap")}
          >
            Roadmap
          </TabButton>
          <TabButton
            active={tab === "personal"}
            onClick={() => setTab("personal")}
          >
            Personal
          </TabButton>
        </div>

        <div className="headerRight">
          <button
            className="btn btnGhost"
            onClick={() => void refreshPortsBurst()}
            disabled={busy || portsBusy}
            title="Refresh project runtime status"
          >
            {portsBusy ? "Refreshing…" : "Refresh Status"}
          </button>
          <button
            className="btn btnDanger"
            onClick={() => void restartRadcontrolDev()}
            disabled={busy}
            title="Restart RadControl dev + close window to avoid white screen"
          >
            Restart RadControl (Dev)
          </button>
        </div>
      </header>

      <main className="mainArea">
        {tab === "projects" ? (
          <div className="projectsWrap">
            <SectionTitle>Projects</SectionTitle>

            {/* Projects actions row */}
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button
                className="btn btnPrimary"
                onClick={() => openAddProject()}
                disabled={busy || portsBusy}
                title="Create a new project via radpattern"
              >
                Add Project
              </button>

              <div style={{ opacity: 0.8, fontSize: 12 }}>
                Creates repo + directories + port assignment + registry via{" "}
                <code>radpattern</code>.
              </div>
            </div>

            {/* Add Project modal */}
            {addOpen ? (
              <div
                role="dialog"
                aria-modal="true"
                onMouseDown={(e) => {
                  // click outside to close
                  if (e.target === e.currentTarget) closeAddProject();
                }}
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(0,0,0,0.55)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 20,
                  zIndex: 9999,
                }}
              >
                <div
                  style={{
                    width: "min(980px, 96vw)",
                    maxHeight: "90vh",
                    overflow: "auto",
                    background: "#0f141a",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 14,
                    padding: 16,
                    boxShadow: "0 18px 60px rgba(0,0,0,0.55)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <div style={{ fontSize: 16, fontWeight: 800 }}>
                      Add Project
                    </div>
                    <button
                      className="btn btnGhost"
                      onClick={() => closeAddProject()}
                      disabled={addBusy}
                    >
                      Close
                    </button>
                  </div>

                  <div style={{ marginTop: 10, opacity: 0.85, fontSize: 12 }}>
                    This will eventually call <code>radpattern</code> to
                    scaffold directories/apps, reserve ports, and update the
                    RadControl project registry.
                  </div>

                  {addErr ? (
                    <div
                      style={{
                        marginTop: 12,
                        padding: 10,
                        borderRadius: 10,
                        background: "rgba(255, 80, 80, 0.12)",
                        border: "1px solid rgba(255, 80, 80, 0.35)",
                        fontSize: 12,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {addErr}
                    </div>
                  ) : null}

                  <div
                    style={{
                      marginTop: 14,
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 12,
                    }}
                  >
                    {/* Left column */}
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                      }}
                    >
                      <label
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                        }}
                      >
                        <span style={{ fontSize: 12, opacity: 0.85 }}>
                          Project Key (slug)
                        </span>
                        <input
                          value={form.key}
                          onChange={(e) => setFormField("key", e.target.value)}
                          placeholder="radcrm"
                          style={inputStyle}
                          disabled={addBusy}
                        />
                      </label>

                      <label
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                        }}
                      >
                        <span style={{ fontSize: 12, opacity: 0.85 }}>
                          Display Name
                        </span>
                        <input
                          value={form.label}
                          onChange={(e) =>
                            setFormField("label", e.target.value)
                          }
                          placeholder="RadCRM"
                          style={inputStyle}
                          disabled={addBusy}
                        />
                      </label>

                      <label
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                        }}
                      >
                        <span style={{ fontSize: 12, opacity: 0.85 }}>
                          Org / Owner
                        </span>
                        <select
                          value={form.org}
                          onChange={(e) => {
                            const org = e.target.value as ProjectOrg;
                            setForm((prev) => ({
                              ...prev,
                              org,
                              repoPath: prev.repoPath.trim()
                                ? prev.repoPath
                                : inferRepoPath(org, prev.key),
                            }));
                          }}
                          style={inputStyle}
                          disabled={addBusy}
                        >
                          <option value="radcon">radcon</option>
                          <option value="radwolfe">radwolfe</option>
                          <option value="labs">labs</option>
                          <option value="other">other</option>
                        </select>
                      </label>

                      <label
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                        }}
                      >
                        <span style={{ fontSize: 12, opacity: 0.85 }}>
                          Repo Path
                        </span>
                        <input
                          value={form.repoPath}
                          onChange={(e) =>
                            setFormField("repoPath", e.target.value)
                          }
                          placeholder="~/dev/rad-empire/radcon/dev/radcrm"
                          style={inputStyle}
                          disabled={addBusy}
                        />
                      </label>

                      <label
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                        }}
                      >
                        <span style={{ fontSize: 12, opacity: 0.85 }}>
                          Repo Hint (shown in list)
                        </span>
                        <input
                          value={form.repoHint || ""}
                          onChange={(e) =>
                            setFormField("repoHint", e.target.value)
                          }
                          placeholder="radcon/dev/radcrm — Companies / People / Interactions"
                          style={inputStyle}
                          disabled={addBusy}
                        />
                      </label>

                      <label
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                        }}
                      >
                        <span style={{ fontSize: 12, opacity: 0.85 }}>
                          Notes
                        </span>
                        <textarea
                          value={form.notes || ""}
                          onChange={(e) =>
                            setFormField("notes", e.target.value)
                          }
                          placeholder="Anything special about this project…"
                          style={{
                            ...inputStyle,
                            minHeight: 90,
                            resize: "vertical",
                          }}
                          disabled={addBusy}
                        />
                      </label>
                    </div>

                    {/* Right column */}
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                      }}
                    >
                      <label
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                        }}
                      >
                        <span style={{ fontSize: 12, opacity: 0.85 }}>
                          Kind
                        </span>
                        <select
                          value={form.kind}
                          onChange={(e) =>
                            setFormField("kind", e.target.value as ProjectKind)
                          }
                          style={inputStyle}
                          disabled={addBusy}
                        >
                          <option value="nextjs">Next.js</option>
                          <option value="tauri">Tauri</option>
                          <option value="python">Python</option>
                          <option value="docs">Docs</option>
                          <option value="static">Static</option>
                          <option value="other">Other</option>
                        </select>
                      </label>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: 10,
                        }}
                      >
                        <label
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                          }}
                        >
                          <span style={{ fontSize: 12, opacity: 0.85 }}>
                            Port
                          </span>
                          <input
                            value={form.port == null ? "" : String(form.port)}
                            onChange={(e) => {
                              const v = asPort(e.target.value);
                              setForm((prev) => ({
                                ...prev,
                                port: v,
                                url: prev.url?.trim()
                                  ? prev.url
                                  : v != null
                                    ? `http://localhost:${v}`
                                    : "",
                              }));
                            }}
                            placeholder={
                              defaultSuggestedPort
                                ? String(defaultSuggestedPort)
                                : "3011"
                            }
                            style={inputStyle}
                            disabled={addBusy}
                          />
                        </label>

                        <label
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                          }}
                        >
                          <span style={{ fontSize: 12, opacity: 0.85 }}>
                            URL
                          </span>
                          <input
                            value={form.url || ""}
                            onChange={(e) =>
                              setFormField("url", e.target.value)
                            }
                            placeholder="http://localhost:3011"
                            style={inputStyle}
                            disabled={addBusy}
                          />
                        </label>
                      </div>

                      <div
                        style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}
                      >
                        O2 keys (optional). Leave blank if the project doesn’t
                        have these yet.
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: 10,
                        }}
                      >
                        <label
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                          }}
                        >
                          <span style={{ fontSize: 12, opacity: 0.85 }}>
                            o2StartKey
                          </span>
                          <input
                            value={form.o2StartKey || ""}
                            onChange={(e) =>
                              setFormField("o2StartKey", e.target.value)
                            }
                            placeholder="radcrm.dev"
                            style={inputStyle}
                            disabled={addBusy}
                          />
                        </label>

                        <label
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                          }}
                        >
                          <span style={{ fontSize: 12, opacity: 0.85 }}>
                            o2MapKey
                          </span>
                          <input
                            value={form.o2MapKey || ""}
                            onChange={(e) =>
                              setFormField("o2MapKey", e.target.value)
                            }
                            placeholder="radcrm.map"
                            style={inputStyle}
                            disabled={addBusy}
                          />
                        </label>

                        <label
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                          }}
                        >
                          <span style={{ fontSize: 12, opacity: 0.85 }}>
                            o2SnapshotKey
                          </span>
                          <input
                            value={form.o2SnapshotKey || ""}
                            onChange={(e) =>
                              setFormField("o2SnapshotKey", e.target.value)
                            }
                            placeholder="radcrm.snapshot"
                            style={inputStyle}
                            disabled={addBusy}
                          />
                        </label>

                        <label
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                          }}
                        >
                          <span style={{ fontSize: 12, opacity: 0.85 }}>
                            o2CommitKey
                          </span>
                          <input
                            value={form.o2CommitKey || ""}
                            onChange={(e) =>
                              setFormField("o2CommitKey", e.target.value)
                            }
                            placeholder="radcrm.commit"
                            style={inputStyle}
                            disabled={addBusy}
                          />
                        </label>

                        <label
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                          }}
                        >
                          <span style={{ fontSize: 12, opacity: 0.85 }}>
                            o2ProofPackKey (empire-tech)
                          </span>
                          <input
                            value={form.o2ProofPackKey || ""}
                            onChange={(e) =>
                              setFormField("o2ProofPackKey", e.target.value)
                            }
                            placeholder="empire.proofpack"
                            style={inputStyle}
                            disabled={addBusy}
                          />
                        </label>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: 10,
                          alignItems: "center",
                          marginTop: 10,
                        }}
                      >
                        <button
                          className="btn btnGhost"
                          onClick={() => {
                            const key = slugify(form.key);
                            setForm((prev) => ({
                              ...prev,
                              key,
                              repoPath: prev.repoPath.trim()
                                ? prev.repoPath
                                : inferRepoPath(prev.org, key),
                              port: prev.port ?? defaultSuggestedPort,
                              url: prev.url?.trim()
                                ? prev.url
                                : prev.port != null
                                  ? `http://localhost:${prev.port}`
                                  : defaultSuggestedPort != null
                                    ? `http://localhost:${defaultSuggestedPort}`
                                    : "",
                            }));
                          }}
                          disabled={addBusy}
                          title="Normalize key + fill common defaults"
                        >
                          Auto-fill defaults
                        </button>

                        <div style={{ flex: 1 }} />

                        <button
                          className="btn btnGhost"
                          onClick={() => closeAddProject()}
                          disabled={addBusy}
                        >
                          Cancel
                        </button>
                        <button
                          className="btn btnPrimary"
                          onClick={() => void submitAddProject()}
                          disabled={addBusy || busy}
                          title="Call radpattern to scaffold + register"
                        >
                          {addBusy ? "Creating…" : "Create Project"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="projectsTable">
              {projects.map((p) => {
                const st = statusForRow(p);
                const port = p.port;
                const s = typeof port === "number" ? ports[port] : undefined;
                const pid = s?.pid ?? null;
                const cmd = s?.cmd ?? null;
                const canKill =
                  typeof port === "number" && Boolean(s?.listening);

                const showProofPack =
                  p.key === "empire-tech" && !!p.o2ProofPackKey;

                return (
                  <div className="projectRow" key={p.key}>
                    <div className="projectLeft">
                      <div className="projectLabel">{p.label}</div>
                      {p.repoHint ? (
                        <div className="projectHint">{p.repoHint}</div>
                      ) : null}
                    </div>

                    <div className="projectRight">
                      <button
                        className="btn btnPrimary"
                        onClick={() => void workOnProject(p)}
                        disabled={busy}
                        title="Start dev server if needed, then open"
                      >
                        Work on
                      </button>

                      <button
                        className="btn"
                        onClick={() =>
                          p.o2SnapshotKey
                            ? void runO2(`Snapshot ${p.label}`, p.o2SnapshotKey)
                            : appendLog(
                                `\n[snapshot] ${p.label}: no o2SnapshotKey configured.\n`,
                              )
                        }
                        disabled={busy}
                        title="Generate paste-ready snapshot into Logs"
                      >
                        Snapshot
                      </button>

                      <button
                        className="btn"
                        onClick={() =>
                          p.o2CommitKey
                            ? void runO2(`Commit ${p.label}`, p.o2CommitKey)
                            : appendLog(
                                `\n[commit] ${p.label}: no o2CommitKey configured.\n`,
                              )
                        }
                        disabled={busy}
                        title="Run pre-commit checks; commit+push if green. Output goes to Logs."
                      >
                        Commit
                      </button>

                      <button
                        className="btn btnDanger btnIcon"
                        onClick={() =>
                          typeof port === "number" ? void freePort(port) : null
                        }
                        disabled={busy || portsBusy || !canKill}
                        title={
                          typeof port !== "number"
                            ? "No port"
                            : canKill
                              ? "Kill whatever is listening on this port"
                              : "Nothing is listening"
                        }
                      >
                        Kill
                      </button>

                      <button
                        className="btn btnGhost"
                        onClick={() =>
                          p.o2MapKey
                            ? void runO2(`${p.label} O2 Map`, p.o2MapKey)
                            : appendLog(
                                `\n[map] ${p.label}: no o2MapKey configured.\n`,
                              )
                        }
                        disabled={busy}
                        title="Paste-ready map of Codex + O2 resources and constraints for this project"
                      >
                        Map
                      </button>

                      {showProofPack ? (
                        <button
                          className="btn btnGhost"
                          onClick={() =>
                            p.o2ProofPackKey
                              ? void runO2(
                                  "Empire Tech Proof Pack",
                                  p.o2ProofPackKey,
                                )
                              : appendLog(
                                  `\n[proofpack] ${p.label}: no o2ProofPackKey configured.\n`,
                                )
                          }
                          disabled={busy}
                          title="Paste-ready proof of O2 + Codex infrastructure and available capabilities"
                        >
                          Proof Pack
                        </button>
                      ) : null}
                    </div>

                    <div className="projectMid">
                      <div className="projectStatusLine">
                        <span className={`pill ${st.pill}`}>{st.text}</span>
                        {typeof port === "number" ? (
                          <span className="portMono">:{port}</span>
                        ) : (
                          <span className="portMono">—</span>
                        )}
                        {typeof port === "number" && s?.listening && pid ? (
                          <span className="meta">
                            pid {pid}
                            {cmd ? ` • ${cmd}` : ""}
                          </span>
                        ) : null}
                        {typeof port === "number" && s?.err ? (
                          <span className="meta metaWarn">check failed</span>
                        ) : null}
                      </div>

                      {p.url ? (
                        <button
                          className="linkBtn"
                          onClick={() => void openUrl(p.url)}
                          title="Open project URL"
                        >
                          {p.url}
                        </button>
                      ) : (
                        <div className="projectUrlMuted">—</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="projectsFootnote">
              Uses <code>run_o2</code> only. No freeform shell.
            </div>
          </div>
        ) : (
          <div className="placeholderTab">
            <SectionTitle>
              {tab === "chat"
                ? "Chat"
                : tab === "roadmap"
                  ? "Roadmap"
                  : "Personal"}
            </SectionTitle>
            <div className="placeholderBody">
              This tab is unchanged in this step.
            </div>
          </div>
        )}
      </main>

      <footer className="logsBar">
        <div className="logsLeft">
          <div className="logsTitle">Logs</div>
          <div className="logsBox">
            {busy ? "Running…" : log || "No logs yet."}
          </div>
        </div>

        <div className="logsActionsRight">
          <button
            className="btn btnGhost"
            onClick={() => clearLogs()}
            disabled={busy}
          >
            Clear
          </button>
          <button
            className="btn btnPrimary"
            onClick={() => void copyLogsToClipboard()}
            disabled={busy}
            title="Copy Logs to clipboard"
          >
            Copy
          </button>
        </div>
      </footer>
    </div>
  );
}

// Minimal inline input style so modal is usable even before App.css tweaks
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 10px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.92)",
  outline: "none",
};

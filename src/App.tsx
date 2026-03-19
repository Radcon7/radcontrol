import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";

import { EmpireMapTab } from "./components/empire-map/EmpireMapTab";

import { DocumentLibraryPanel } from "./components/paste-tabs/DocumentLibraryPanel";
import { TimelineTab } from "./components/paste-tabs/TimelineTab";
import { ProjectsTab } from "./components/projects/ProjectsTab";
import { AddProjectModal } from "./components/projects/AddProjectModal";
import type { AddProjectModalPrefill } from "./components/projects/AddProjectModal";
import { ProjectLabsModal } from "./components/projects/ProjectLabsModal";

import { CodexChatTab } from "./components/codex/CodexChatTab";
import { CodexBuildTab } from "./components/codex/CodexBuildTab";

import { SnapshotTab } from "./components/snapshot/SnapshotTab";
import { EmpireSweepTab } from "./components/empire-sweep/EmpireSweepTab";
import GovernanceInventoryInspector from "./components/dev/GovernanceInventoryInspector";

import type {
  AddProjectPayload,
  PortStatus,
  ProjectRow,
} from "./components/projects/types";
import {
  fmtErr,
  registryToProjects,
  nextPortSuggestion,
} from "./components/projects/helpers";

type LibraryTabKey = "notes" | "legal" | "labs" | "orion_handoff";
type StreamTabKey = "timeline" | "snapshot";
type DocTabKey = LibraryTabKey | StreamTabKey;

type TabKey =
  | "projects"
  | "codex_chat"
  | "codex_build"
  | "empire_map"
  | "empire_sweep"
  | "governance"
  | DocTabKey;

type DocTabMeta = {
  key: DocTabKey;
  label: string;
  mode: "library" | "stream";
};

const DOC_TABS: DocTabMeta[] = [
  { key: "notes", label: "Notes", mode: "library" },
  { key: "legal", label: "Legal", mode: "library" },
  { key: "labs", label: "Patterns", mode: "library" },
  { key: "orion_handoff", label: "Orion Handoff", mode: "library" },
  { key: "timeline", label: "Timeline", mode: "stream" },
  { key: "snapshot", label: "Snapshot", mode: "stream" },
];

const ALL_TABS: TabKey[] = [
  "projects",
  "codex_chat",
  "codex_build",
  "empire_map",
  "snapshot",
  "empire_sweep",
  "governance",
  ...DOC_TABS.filter((t) => t.key !== "snapshot").map((t) => t.key),
];

type CanonicalProjectType =
  | "new_website"
  | "lab_from_existing"
  | "website_successor";

const canonicalProjectTypeMap: Record<string, CanonicalProjectType> = {
  website: "new_website",
  new_website: "new_website",

  lab: "lab_from_existing",
  lab_from_existing: "lab_from_existing",

  successor: "website_successor",
  website_successor: "website_successor",
  "v.x.x website from existing website": "website_successor",
};

function isDocTab(t: TabKey): t is DocTabKey {
  return DOC_TABS.some((d) => d.key === t);
}

function isLibraryTab(t: TabKey): t is LibraryTabKey {
  return DOC_TABS.some((d) => d.key === t && d.mode === "library");
}

function docTabMeta(t: DocTabKey): DocTabMeta {
  const found = DOC_TABS.find((d) => d.key === t);
  if (!found) {
    throw new Error(`Unknown doc tab: ${t}`);
  }
  return found;
}

function tabLabel(t: TabKey): string {
  if (isDocTab(t)) return docTabMeta(t).label;

  const m: Record<Exclude<TabKey, DocTabKey>, string> = {
    projects: "Projects",
    codex_chat: "Codex Chat",
    codex_build: "Codex Build",
    empire_map: "Empire Map",
    empire_sweep: "Empire Sweep",
    governance: "Governance",
  };

  return m[t] ?? t.replace(/_/g, " ");
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // fall through
  }

  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  } catch {
    // ignore
  }
}

type O2ListProjectsEnvelope = {
  ok?: boolean;
  projects?: unknown[];
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

function parseRegistryMaybeDoubleEncoded(raw: string): O2ListProjectsEnvelope {
  let first: unknown;
  try {
    first = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Registry response was not valid JSON: ${String(e)}`);
  }

  let reg: unknown = first;
  if (typeof first === "string") {
    try {
      reg = JSON.parse(first);
    } catch (e) {
      throw new Error(
        `Registry double-encoded JSON could not be parsed: ${String(e)}`,
      );
    }
  }

  if (Array.isArray(reg)) {
    return { ok: true, projects: reg };
  }

  const envelope = asRecord(reg);
  const projects = envelope?.projects;
  if (!envelope || !Array.isArray(projects)) {
    throw new Error(
      `Registry parsed but did not match { ok, projects: [] } envelope.`,
    );
  }

  return {
    ok: typeof envelope.ok === "boolean" ? envelope.ok : undefined,
    projects,
  };
}

function extractFirstHttpUrl(s: string): string | null {
  if (!s) return null;
  const m = s.match(/https?:\/\/localhost:\d+(?:\/[^\s]*)?/);
  return m ? m[0] : null;
}

function openByAnchor(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function tryAutoOpen(url: string) {
  try {
    if (isTauri()) {
      await openUrl(url);
      return;
    }
  } catch {
    // fall through
  }

  try {
    openByAnchor(url);
  } catch {
    // ignore
  }
}

type O2PortStatusJson = { port?: number; listening?: boolean };

function parsePortStatusJson(out: string, port: number): PortStatus {
  try {
    const obj = JSON.parse((out || "").trim()) as O2PortStatusJson;
    const listening = Boolean(obj?.listening);
    return { port, listening, pid: null, cmd: null, err: null };
  } catch {
    return {
      port,
      listening: false,
      pid: null,
      cmd: null,
      err: "invalid json",
    };
  }
}

function registryPortForKey(reg: unknown, key: string): number | null {
  const regObj = asRecord(reg);
  const projects = Array.isArray(reg)
    ? reg
    : Array.isArray(regObj?.projects)
      ? regObj.projects
      : null;
  if (!projects) return null;

  const row = projects.find(
    (r) =>
      r && typeof r === "object" && (r as Record<string, unknown>).key === key,
  ) as Record<string, unknown> | undefined;

  const port = row?.port;
  return typeof port === "number" && Number.isFinite(port) && port > 0
    ? port
    : null;
}

async function invokeText(cmd: string, payload?: Record<string, unknown>) {
  const out = (await invoke(cmd, payload ? payload : undefined)) as unknown;

  if (typeof out === "string") return out;

  if (out && typeof out === "object") {
    const o = out as Record<string, unknown>;

    if (typeof o.stdout === "string") return o.stdout;
    if (typeof o.output === "string") return o.output;

    try {
      return JSON.stringify(o);
    } catch {
      return "[unstringifiable object]";
    }
  }

  return (out ?? "").toString();
}

type FormationStartPayload = {
  projectType: CanonicalProjectType;
  name: string;
  label: string;
  key: string;
  mission: string;
  track: string;
  relationship: string;
  technicalKind: string;
  baseProjectKey: string;
  versionTag: string;
  patternHint: string;
  intent: string;
  notes: string;
};

type FormationStartResult = {
  ok?: boolean;
  action?: string;
  state?: string;
  projectKey?: string;
  artifactPath?: string;
  summary?: string;
  openQuestions?: string[];
  error?: string;
  details?: string[];
};

type ProjectLabRecommendedAction =
  | "launch_existing_lab"
  | "start_first_lab_flow"
  | "blocked";

function encodeBase64UrlJson(value: unknown): string {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);

  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function parseMaybeDoubleEncodedJson(raw: string): unknown | null {
  if (!raw.trim()) return null;

  let first: unknown;
  try {
    first = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof first !== "string") return first;
  try {
    return JSON.parse(first);
  } catch {
    return null;
  }
}

function didO2VerbSucceed(raw: string | null): boolean {
  if (raw === null) return false;
  const parsed = parseMaybeDoubleEncodedJson(raw);
  const obj = asRecord(parsed);
  if (!obj) return true;
  if (typeof obj.ok === "boolean") return obj.ok;
  return true;
}

function parseProjectLabOpenOrCreate(raw: string): {
  recommendedAction: ProjectLabRecommendedAction | null;
  message: string | null;
  labPath: string | null;
} {
  const parsed = parseMaybeDoubleEncodedJson(raw);
  const obj = asRecord(parsed);
  if (!obj) return { recommendedAction: null, message: null, labPath: null };

  const nested = asRecord(obj.data) ?? asRecord(obj.result) ?? obj;
  const action =
    typeof nested.recommendedAction === "string"
      ? nested.recommendedAction
      : typeof nested.recommended_action === "string"
        ? nested.recommended_action
        : null;

  const recommendedAction: ProjectLabRecommendedAction | null =
    action === "launch_existing_lab" ||
    action === "start_first_lab_flow" ||
    action === "blocked"
      ? action
      : null;

  const message =
    typeof nested.userMessage === "string"
      ? nested.userMessage
      : typeof nested.message === "string"
        ? nested.message
        : typeof obj.message === "string"
          ? obj.message
          : typeof obj.error === "string"
            ? obj.error
            : null;

  const labPath =
    typeof nested.labPath === "string" && nested.labPath.trim()
      ? nested.labPath.trim()
      : null;

  return { recommendedAction, message, labPath };
}

function toFriendlyLabMessage(
  project: ProjectRow,
  recommendedAction: ProjectLabRecommendedAction,
  contractMessage: string | null,
): string {
  if (recommendedAction === "launch_existing_lab") {
    return `Current governed lab is ready for ${project.label}.`;
  }
  if (recommendedAction === "start_first_lab_flow") {
    return `No current lab found for ${project.label}. Start Formation to create one.`;
  }
  if (
    contractMessage &&
    !/invalid_payload|recommendedAction|open_or_create|project_lab\./i.test(
      contractMessage,
    )
  ) {
    return contractMessage;
  }
  return `Labs are currently unavailable for ${project.label}. Please try again.`;
}

function normalizeProjectType(
  payload: AddProjectPayload,
): CanonicalProjectType {
  const rawProjectType = payload.projectType?.trim().toLowerCase() || "";
  const rawKind = payload.kind?.trim().toLowerCase() || "";

  if (rawProjectType in canonicalProjectTypeMap) {
    return canonicalProjectTypeMap[rawProjectType];
  }

  if (rawKind in canonicalProjectTypeMap) {
    return canonicalProjectTypeMap[rawKind];
  }

  if (payload.parentProjectKey?.trim()) {
    return "website_successor";
  }

  return "new_website";
}

function normalizeFormationStartPayload(
  payload: AddProjectPayload,
): FormationStartPayload {
  const projectType = normalizeProjectType(payload);
  const relationship = (payload.relationship || "new").trim();
  const technicalKind = (payload.kind || "other").trim();

  const name = (payload.label || payload.key).trim();
  const label = (payload.label || payload.key).trim();
  const key = payload.key.trim();

  const mission =
    payload.mission?.trim() ||
    payload.notes?.trim() ||
    "No mission provided yet.";

  const baseProjectKey = payload.parentProjectKey?.trim() || "";
  const patternHint =
    payload.patternHint?.trim() || payload.repoHint?.trim() || "";
  const intent = (
    payload.intent || (payload.o2LabKey ? "lab" : "production")
  ).trim();

  const track =
    projectType === "lab_from_existing" || intent === "lab"
      ? "lab"
      : "production";

  const versionTag = "";
  const notes = payload.notes?.trim() || "";

  return {
    projectType,
    name,
    label,
    key,
    mission,
    track,
    relationship,
    technicalKind,
    baseProjectKey,
    versionTag,
    patternHint,
    intent,
    notes,
  };
}

export default function App() {
  const [tab, setTab] = useState<TabKey>("projects");
  const [busy, setBusy] = useState(false);
  const [portsBusy, setPortsBusy] = useState(false);

  const [log, setLog] = useState("");
  const appendLog = (s: string) =>
    setLog((prev) => (prev ? prev + "\n" + s : s));

  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [rawRegistry, setRawRegistry] = useState<O2ListProjectsEnvelope>({
    ok: true,
    projects: [],
  });
  const [showAddProject, setShowAddProject] = useState(false);
  const [addProjectPrefill, setAddProjectPrefill] =
    useState<AddProjectModalPrefill | null>(null);
  const [showProjectLabsModal, setShowProjectLabsModal] = useState(false);
  const [projectLabsProject, setProjectLabsProject] =
    useState<ProjectRow | null>(null);
  const [projectLabsHasCurrentLab, setProjectLabsHasCurrentLab] =
    useState(false);
  const [projectLabsRecommendedAction, setProjectLabsRecommendedAction] =
    useState<ProjectLabRecommendedAction | null>(null);
  const [projectLabsLaunchPath, setProjectLabsLaunchPath] = useState<
    string | null
  >(null);
  const [projectLabsMessage, setProjectLabsMessage] = useState(
    "Checking governed lab doorway...",
  );
  const [projectLabsActionBusy, setProjectLabsActionBusy] = useState(false);
  const beforeTabChangeSaverRef = useRef<(() => Promise<boolean>) | null>(null);

  const loadRegistryOnceRef = useRef(false);
  const loadRegistryInFlightRef = useRef<Promise<ProjectRow[]> | null>(null);

  async function loadRegistry(): Promise<ProjectRow[]> {
    if (loadRegistryInFlightRef.current) return loadRegistryInFlightRef.current;

    loadRegistryInFlightRef.current = (async () => {
      try {
        const out = await invokeText("run_o2", { verb: "list_projects" });
        const parsed = parseRegistryMaybeDoubleEncoded(out ?? "");
        const reg = parsed.projects ?? [];

        setRawRegistry(parsed);
        const rows = registryToProjects(reg);
        setProjects(rows);

        appendLog(`[registry] loaded ${rows.length} project(s)`);
        return rows;
      } catch (e) {
        appendLog("\n[registry] failed:\n" + fmtErr(e));
        setRawRegistry({ ok: false, projects: [] });
        setProjects([]);
        return [];
      } finally {
        loadRegistryInFlightRef.current = null;
      }
    })();

    return loadRegistryInFlightRef.current;
  }

  useEffect(() => {
    if (loadRegistryOnceRef.current) return;
    loadRegistryOnceRef.current = true;
    void loadRegistry();
  }, []);

  const usedPorts = useMemo(() => {
    const s = new Set<number>();
    projects.forEach((p) => {
      if (typeof p.port === "number") s.add(p.port);
    });

    const rcPort = registryPortForKey(rawRegistry, "radcontrol");
    if (rcPort) s.add(rcPort);

    return s;
  }, [projects, rawRegistry]);

  const suggestedPort = useMemo(
    () => nextPortSuggestion(Array.from(usedPorts)),
    [usedPorts],
  );

  const [ports, setPorts] = useState<Record<number, PortStatus | undefined>>(
    {},
  );

  const PORTS = useMemo(() => {
    const s = new Set<number>();
    projects.forEach((p) => {
      if (typeof p.port === "number") s.add(p.port);
    });

    const rcPort = registryPortForKey(rawRegistry, "radcontrol");
    if (rcPort) s.add(rcPort);

    return Array.from(s.values()).sort((a, b) => a - b);
  }, [projects, rawRegistry]);

  const refreshInFlightRef = useRef<Promise<void> | null>(null);

  async function refreshPorts(): Promise<void> {
    if (refreshInFlightRef.current) return refreshInFlightRef.current;
    if (portsBusy) return Promise.resolve();

    refreshInFlightRef.current = (async () => {
      setPortsBusy(true);
      try {
        const results = await Promise.all(
          PORTS.map(async (p) => {
            try {
              const out = await invokeText("run_o2", {
                verb: `port_status.${p}`,
              });
              return parsePortStatusJson(out, p);
            } catch (e) {
              return {
                port: p,
                listening: false,
                pid: null,
                cmd: null,
                err: fmtErr(e),
              } as PortStatus;
            }
          }),
        );

        const next: Record<number, PortStatus> = {};
        results.forEach((r) => {
          if (typeof r.port === "number") next[r.port] = r;
        });
        setPorts(next);
      } finally {
        setPortsBusy(false);
        refreshInFlightRef.current = null;
      }
    })();

    return refreshInFlightRef.current;
  }

  useEffect(() => {
    void refreshPorts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, rawRegistry]);

  function statusForRow(p: ProjectRow) {
    if (typeof p.port !== "number") {
      return { pill: "pillWarn", text: "NO PORT" };
    }

    const s = ports[p.port];
    if (!s) return { pill: "pillWarn", text: "UNKNOWN" };

    return s.listening
      ? { pill: "pillOn", text: "RUNNING" }
      : { pill: "pillOff", text: "STOPPED" };
  }

  async function runO2(title: string, key?: string): Promise<string | null> {
    if (!key || busy) return null;

    setBusy(true);
    appendLog(`\n[o2] ${title} → run_o2("${key}")\n`);
    try {
      const out = await invokeText("run_o2", { verb: key });
      const text = (out ?? "(no output)").toString();
      appendLog(text);
      return text;
    } catch (e) {
      appendLog("\n[o2] ERROR:\n" + fmtErr(e));
      return null;
    } finally {
      setBusy(false);
      try {
        await refreshPorts();
      } catch {
        // ignore
      }
    }
  }

  async function restartRadcontrol() {
    void runO2("Restart RadControl + Refresh Status", "radcontrol.dev_strict");
  }

  const startRecheckTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (startRecheckTimerRef.current !== null) {
        window.clearTimeout(startRecheckTimerRef.current);
      }
    };
  }, []);

  async function startProject(p: ProjectRow) {
    if (!p?.o2StartKey) {
      appendLog(
        `[projects] Start unavailable for "${p?.label ?? "unknown"}": no O2 start key configured.`,
      );
      return;
    }

    const out = await runO2(`Start ${p.label}`, p.o2StartKey);

    const urlFromOut = out ? extractFirstHttpUrl(out) : null;
    const fallbackUrl =
      typeof p.url === "string" && p.url.startsWith("http") ? p.url : null;

    const finalUrl = urlFromOut ?? fallbackUrl;
    if (!finalUrl) return;

    void copyText(finalUrl);

    if (startRecheckTimerRef.current !== null) {
      window.clearTimeout(startRecheckTimerRef.current);
    }
    startRecheckTimerRef.current = window.setTimeout(() => {
      void refreshPorts();
    }, 1200);

    try {
      await tryAutoOpen(finalUrl);
    } catch (e) {
      appendLog(`\n[opener] failed: ${fmtErr(e)}\n`);
      appendLog(`[opener] URL copied: ${finalUrl}`);
    }
  }

  async function freePort(port: number) {
    void runO2("Kill requested", `kill_port.${port}`);
  }

  async function setProjectRetired(project: ProjectRow, retired: boolean) {
    if (busy) return;

    const payload = encodeBase64UrlJson({
      projectKey: project.key,
      retired,
    });
    const verb = `project_retired.set.${payload}`;

    setBusy(true);
    appendLog(
      `\n[o2] Set lifecycle for ${project.label} → run_o2("${verb}")\n`,
    );
    try {
      const out = await invokeText("run_o2", { verb });
      appendLog(out || "(no output)");
      await loadRegistry();
    } catch (e) {
      appendLog("\n[o2] ERROR:\n" + fmtErr(e));
    } finally {
      setBusy(false);
      try {
        await refreshPorts();
      } catch {
        // ignore
      }
    }
  }

  async function ensureProjectNotes(project: ProjectRow): Promise<ProjectRow> {
    if (busy) return project;

    const shouldEnsure = !project.notesAvailable;
    if (shouldEnsure) {
      const payload = encodeBase64UrlJson({ projectKey: project.key });
      const verb = `project_note.ensure.${payload}`;

      setBusy(true);
      appendLog(
        `\n[o2] Ensure notes for ${project.label} → run_o2("${verb}")\n`,
      );
      try {
        const out = await invokeText("run_o2", { verb });
        appendLog(out || "(no output)");
      } catch (e) {
        appendLog("\n[o2] ERROR:\n" + fmtErr(e));
      } finally {
        setBusy(false);
      }
    }

    const rows = await loadRegistry();
    const latest = rows.find((p) => p.key === project.key);
    return latest ?? project;
  }

  async function createProject(payload: AddProjectPayload) {
    const formationPayload = normalizeFormationStartPayload(payload);

    if (
      formationPayload.projectType === "lab_from_existing" &&
      formationPayload.baseProjectKey
    ) {
      const rows = await loadRegistry();
      const baseProject = rows.find(
        (row) => row.key === formationPayload.baseProjectKey,
      );
      if (!baseProject) {
        throw new Error(
          `Base project "${formationPayload.baseProjectKey}" was not found in Projects.`,
        );
      }
    }

    const verb = `project_create.start.${encodeBase64UrlJson(formationPayload)}`;

    setBusy(true);
    appendLog(
      `[new-project:intake]\n${JSON.stringify(formationPayload, null, 2)}`,
    );
    appendLog(`\n[o2] Start Formation → run_o2("${verb}")\n`);

    try {
      const out = await invokeText("run_o2", { verb });
      appendLog(out || "(no output)");

      let parsed: FormationStartResult | null = null;
      try {
        parsed = JSON.parse(out) as FormationStartResult;
      } catch {
        parsed = null;
      }

      if (parsed?.ok) {
        setShowAddProject(false);

        if (parsed.artifactPath) {
          void copyText(parsed.artifactPath);
          appendLog(
            `[new-project] artifact path copied: ${parsed.artifactPath}`,
          );
        }

        await loadRegistry();
        return;
      }

      if (parsed?.error) {
        appendLog(
          `[new-project] formation rejected: ${parsed.error}${
            parsed.details?.length ? ` :: ${parsed.details.join(" | ")}` : ""
          }`,
        );
        return;
      }

      appendLog("[new-project] unexpected non-JSON or non-contract response");
    } catch (e) {
      appendLog("\n[new-project] ERROR:\n" + fmtErr(e));
    } finally {
      setBusy(false);
      try {
        await refreshPorts();
      } catch {
        // ignore
      }
    }
  }

  async function refreshAfterProjectLabAction(
    projectKey: string,
  ): Promise<ProjectRow | null> {
    const rows = await loadRegistry();
    const latest = rows.find((row) => row.key === projectKey) ?? null;
    setProjectLabsProject(latest);

    try {
      await refreshPorts();
    } catch {
      // ignore
    }

    return latest;
  }

  async function launchExistingLab(
    project: ProjectRow,
    governedLaunchPath: string | null,
  ): Promise<boolean> {
    if (governedLaunchPath && isTauri()) {
      appendLog(
        `[labs] opening governed lab target for ${project.label}: ${governedLaunchPath}`,
      );
      try {
        await openPath(governedLaunchPath);
        return true;
      } catch (e) {
        appendLog(`[labs] failed to open governed lab target: ${fmtErr(e)}`);
      }
    }

    if (!project.o2LabKey) {
      setProjectLabsMessage(
        `No governed lab launch key is configured for ${project.label}.`,
      );
      return false;
    }
    appendLog(`[labs] fallback launch via O2 verb: ${project.o2LabKey}`);
    const out = await runO2(`${project.label} Lab`, project.o2LabKey);
    return didO2VerbSucceed(out);
  }

  async function runProjectLabOpenOrCreate(project: ProjectRow): Promise<void> {
    if (busy || projectLabsActionBusy) return;

    setProjectLabsActionBusy(true);
    setProjectLabsRecommendedAction(null);
    setProjectLabsLaunchPath(null);
    setProjectLabsMessage(`Checking lab access for ${project.label}...`);

    try {
      const payload = encodeBase64UrlJson({ projectKey: project.key });
      const verb = `project_lab.open_or_create.${payload}`;
      const out = await runO2(`${project.label} Lab Doorway`, verb);
      if (!didO2VerbSucceed(out)) {
        setProjectLabsMessage(
          `Labs are currently unavailable for ${project.label}. Please try again.`,
        );
        return;
      }

      const parsed = parseProjectLabOpenOrCreate(out || "");
      if (!parsed.recommendedAction) {
        setProjectLabsMessage(
          `Labs are currently unavailable for ${project.label}. Please try again.`,
        );
        return;
      }

      const latest = await refreshAfterProjectLabAction(project.key);
      const resolvedProject = latest ?? project;
      setProjectLabsHasCurrentLab(
        parsed.recommendedAction === "launch_existing_lab",
      );
      setProjectLabsRecommendedAction(parsed.recommendedAction);
      setProjectLabsLaunchPath(
        parsed.recommendedAction === "launch_existing_lab"
          ? parsed.labPath
          : null,
      );
      setProjectLabsMessage(
        toFriendlyLabMessage(
          resolvedProject,
          parsed.recommendedAction,
          parsed.message,
        ),
      );
    } finally {
      setProjectLabsActionBusy(false);
    }
  }

  async function runProjectLabPrimaryAction(): Promise<void> {
    if (busy || projectLabsActionBusy || !projectLabsProject) return;
    if (!projectLabsRecommendedAction || projectLabsRecommendedAction === "blocked") {
      return;
    }

    const project = projectLabsProject;
    if (projectLabsRecommendedAction === "start_first_lab_flow") {
      setAddProjectPrefill({
        projectType: "lab_from_existing",
        relatedProjectKey: project.key,
      });
      closeProjectLabsModal();
      setShowAddProject(true);
      return;
    }

    setProjectLabsActionBusy(true);
    try {
      setProjectLabsMessage(`Launching ${project.label} lab...`);
      await launchExistingLab(project, projectLabsLaunchPath);
    } finally {
      setProjectLabsActionBusy(false);
    }
  }

  async function deleteProjectLab(): Promise<void> {
    if (busy || projectLabsActionBusy || !projectLabsProject) return;

    setProjectLabsActionBusy(true);
    try {
      const project = projectLabsProject;
      const payload = encodeBase64UrlJson({ projectKey: project.key });
      const verb = `project_lab.delete.${payload}`;
      const out = await runO2(`Delete ${project.label} Lab`, verb);
      if (!didO2VerbSucceed(out)) return;

      await refreshAfterProjectLabAction(project.key);
      setProjectLabsHasCurrentLab(false);
      setProjectLabsRecommendedAction("start_first_lab_flow");
      setProjectLabsLaunchPath(null);
      setProjectLabsMessage(
        `${project.label} lab was deleted. Start Formation to create a new lab.`,
      );
    } finally {
      setProjectLabsActionBusy(false);
    }
  }

  function openProjectLabsModal(project: ProjectRow) {
    setProjectLabsProject(project);
    setProjectLabsHasCurrentLab(false);
    setProjectLabsRecommendedAction(null);
    setProjectLabsLaunchPath(null);
    setProjectLabsMessage(`Checking lab access for ${project.label}...`);
    setShowProjectLabsModal(true);
    void runProjectLabOpenOrCreate(project);
  }

  function closeProjectLabsModal() {
    setShowProjectLabsModal(false);
    setProjectLabsActionBusy(false);
    setProjectLabsHasCurrentLab(false);
    setProjectLabsRecommendedAction(null);
    setProjectLabsLaunchPath(null);
    setProjectLabsMessage("Checking governed lab doorway...");
  }

  function openAddProjectModal() {
    setAddProjectPrefill(null);
    setShowAddProject(true);
  }

  function closeAddProjectModal() {
    setShowAddProject(false);
    setAddProjectPrefill(null);
  }

  const logText = (busy ? "Running…" : log || "No logs yet.").toString();

  const tabPlaceholder = (t: DocTabKey) => {
    if (t === "labs") return "Write or edit patterns here…";
    if (t === "timeline") return "Timeline milestones surface...";
    if (isLibraryTab(t)) return `Write or edit ${tabLabel(t)} here…`;
    return `Type ${tabLabel(t)} here… (auto-loads latest, autosaves+commits on tab change)`;
  };

  function registerBeforeTabChangeSaver(fn: (() => Promise<boolean>) | null) {
    beforeTabChangeSaverRef.current = fn;
  }

  async function requestTabChange(nextTab: TabKey): Promise<void> {
    if (nextTab === tab) return;

    if (isLibraryTab(tab)) {
      const saver = beforeTabChangeSaverRef.current;
      if (saver) {
        try {
          const ok = await saver();
          if (!ok) return;
        } catch {
          return;
        }
      }
    }

    setTab(nextTab);
  }

  function renderDocTab(activeTab: DocTabKey) {
    if (isLibraryTab(activeTab)) {
      return (
        <DocumentLibraryPanel
          tabKey={activeTab}
          title={tabLabel(activeTab)}
          placeholder={tabPlaceholder(activeTab)}
          busy={busy}
          registerBeforeTabChangeSaver={registerBeforeTabChangeSaver}
        />
      );
    }

    if (activeTab === "timeline") {
      return <TimelineTab />;
    }

    if (activeTab === "snapshot") {
      return <SnapshotTab title={tabLabel(activeTab)} />;
    }

    return null;
  }

  return (
    <div className="appShell">
      <header className="header">
        <div className="brand">RadControl</div>

        <div className="tabs" style={{ flex: 1, minWidth: 0 }}>
          {ALL_TABS.map((t) => (
            <button
              key={t}
              className={`tab ${tab === t ? "tabActive" : ""}`}
              onClick={() => void requestTabChange(t)}
              title={tabLabel(t)}
            >
              {tabLabel(t)}
            </button>
          ))}
        </div>

        <div className="headerRight">
          <button
            className="btn"
            onClick={() => void restartRadcontrol()}
            disabled={busy}
            title="Restart RadControl (dev_strict) and refresh project status. Does not start/open projects."
          >
            Restart RadControl
          </button>
        </div>
      </header>

      <main className="mainArea">
        {tab === "projects" ? (
          <div className="projectsWrap">
            <div className="projectsHeaderRow">
              <div className="sectionTitle">Projects</div>

              <div className="projectsHeaderRight">
                <button
                  className="btn btnPrimary"
                  onClick={openAddProjectModal}
                  disabled={busy}
                  title="Start a governed project formation flow under O2 authority"
                >
                  New Project
                </button>

                <button
                  className="btn btnGhost"
                  onClick={() => void loadRegistry()}
                  disabled={busy}
                  title="Reload projects registry"
                >
                  Reload Projects
                </button>
                <button
                  className="btn btnGhost"
                  onClick={() => void refreshPorts()}
                  disabled={portsBusy}
                  title="Refresh port status"
                >
                  Refresh Ports
                </button>
              </div>
            </div>

            <ProjectsTab
              projects={projects}
              ports={ports}
              busy={busy}
              portsBusy={portsBusy}
              onStart={startProject}
              onSnapshot={(p) =>
                void runO2(`Snapshot ${p.label}`, p.o2SnapshotKey)
              }
              onCommit={(p) => void runO2(`Commit ${p.label}`, p.o2CommitKey)}
              onLab={openProjectLabsModal}
              onKill={freePort}
              onMap={(p) => void runO2(`${p.label} Map`, p.o2MapKey)}
              onProofPack={(p) =>
                void runO2(`${p.label} Proof Pack`, p.o2ProofPackKey)
              }
              onSetRetired={setProjectRetired}
              onEnsureNotes={ensureProjectNotes}
              statusForRow={statusForRow}
            />

            <AddProjectModal
              open={showAddProject}
              onClose={closeAddProjectModal}
              onCreate={createProject}
              defaultSuggestedPort={suggestedPort}
              existingProjects={projects}
              prefill={addProjectPrefill}
            />

            <ProjectLabsModal
              open={showProjectLabsModal}
              project={projectLabsProject}
              busy={busy || projectLabsActionBusy}
              message={projectLabsMessage}
              hasCurrentLab={projectLabsHasCurrentLab}
              recommendedAction={projectLabsRecommendedAction}
              onClose={closeProjectLabsModal}
              onPrimaryAction={() => {
                void runProjectLabPrimaryAction();
              }}
              onDelete={() => void deleteProjectLab()}
            />
          </div>
        ) : tab === "codex_chat" ? (
          <CodexChatTab />
        ) : tab === "codex_build" ? (
          <CodexBuildTab />
        ) : tab === "empire_map" ? (
          <EmpireMapTab />
        ) : tab === "empire_sweep" ? (
          <EmpireSweepTab />
        ) : tab === "governance" ? (
          <GovernanceInventoryInspector />
        ) : isDocTab(tab) ? (
          renderDocTab(tab)
        ) : null}
      </main>

      <footer className="logsBar">
        <div className="logsHeader">
          <div className="logsTitle">Logs</div>
          <div />
        </div>

        <div className="logsBoxRow">
          <div className="logsBox">{logText}</div>
          <div className="logsActionsStack">
            <button
              className="btn btnGhost"
              onClick={() => void copyText(logText)}
              disabled={logText.trim().length === 0}
            >
              Copy
            </button>
            <button
              className="btn btnGhost"
              onClick={() => setLog("")}
              disabled={busy || !log}
            >
              Clear
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

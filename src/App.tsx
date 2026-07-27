import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

import { EmpireUtilityTab } from "./components/empire-utility/EmpireUtilityTab";

import { NotesHubTab } from "./components/paste-tabs/NotesHubTab";
import { LegalHubTab } from "./components/paste-tabs/LegalHubTab";
import { ProjectsTab } from "./components/projects/ProjectsTab";
import { AddProjectModal } from "./components/projects/AddProjectModal";
import type {
  AddProjectModalPrefill,
  GovernedPortSuggestion,
  GovernedStarterPattern,
} from "./components/projects/AddProjectModal";

import { AgentRunsTab } from "./components/agents/AgentRunsTab";
import { InfrastructureTab } from "./components/agents/InfrastructureTab";

import type {
  AddProjectPayload,
  PortStatus,
  ProjectKind,
  ProjectRow,
} from "./components/projects/types";
import { fmtErr, registryToProjects } from "./components/projects/helpers";
import { copyText } from "./components/common/copyText";
import { encodeO2JsonPayload, runO2Text } from "./components/common/o2Files";

type LibraryTabKey = "notes" | "legal";
type DocTabKey = LibraryTabKey;

type TabKey =
  | "projects"
  | "infrastructure"
  | "agents"
  | "empire_utility"
  | DocTabKey;

type DocTabMeta = {
  key: DocTabKey;
  label: string;
  mode: "library" | "stream";
};

const DOC_TABS: DocTabMeta[] = [
  { key: "notes", label: "Notes", mode: "library" },
  { key: "legal", label: "Legal", mode: "library" },
];

const ALL_TABS: TabKey[] = [
  "projects",
  "infrastructure",
  "agents",
  "empire_utility",
  ...DOC_TABS.map((t) => t.key),
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
    infrastructure: "Infrastructure",
    agents: "Agents",
    empire_utility: "Empire Utility",
  };

  return m[t] ?? t.replace(/_/g, " ");
}


type O2ListProjectsEnvelope = {
  ok?: boolean;
  projects?: unknown[];
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
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

type FormationStartPayload = {
  projectType: CanonicalProjectType;
  name: string;
  label: string;
  key: string;
  org: string;
  repoPath: string;
  repoHint: string;
  port?: number;
  url: string;
  mission: string;
  goalSummary: string;
  track: string;
  relationship: string;
  technicalKind: string;
  baseProjectKey: string;
  similarProjectKey: string;
  referenceRepos: string;
  versionTag: string;
  patternHint: string;
  similarityNotes: string;
  intent: string;
  projectClass: string;
  deliverySurface: string;
  intendedUsers: string;
  domainIntent: string;
  googleWorkspacePlan: string;
  accessModel: string;
  securityPosture: string;
  buildStrategy: string;
  needsAuthentication: boolean;
  handlesSensitiveData: boolean;
  launchLocalFirst: boolean;
  shellPreference: string;
  initialSectionSet: string;
  needsAdminSurface: boolean;
  needsCommerceSurface: boolean;
  needsKnowledgeSurface: boolean;
  needsTimelineSurface: boolean;
  operatorBrief: string;
  initialConstraints: string;
  notes: string;
};

type FormationStartResult = {
  ok?: boolean;
  action?: string;
  state?: string;
  projectKey?: string;
  artifactPath?: string;
  intakeArtifactPath?: string;
  stateArtifactPath?: string;
  summary?: string;
  openQuestions?: string[];
  recommendedBuildLane?: string;
  buildAgentCandidate?: boolean;
  securityReviewRequired?: boolean;
  suggestedNextAction?: string;
  error?: string;
  details?: string[];
};

type ProjectBootstrapResult = {
  ok?: boolean;
  action?: string;
  projectKey?: string;
  repoPath?: string;
  workspaceFile?: string;
  projectStatePath?: string;
  bootstrapResultPath?: string;
  repoFormationDir?: string;
  repoBootstrapIntakeJsonPath?: string;
  repoBootstrapIntakeMdPath?: string;
  registryUpdated?: boolean;
  runtimeKind?: string;
  preferredUrl?: string;
  preferredPort?: number | string;
  error?: string;
  details?: string[];
};

type PortSuggestionResult = {
  ok?: boolean;
  kind?: string;
  preferredPort?: number;
  preferredUrl?: string;
  rangeStart?: number;
  rangeEnd?: number;
  error?: string;
  message?: string;
};

type PatternListResult = {
  ok?: boolean;
  patterns?: unknown[];
};

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

  const goalSummary = payload.goalSummary?.trim() || "";
  const baseProjectKey = payload.parentProjectKey?.trim() || "";
  const similarProjectKey = payload.similarProjectKey?.trim() || "";
  const referenceRepos = payload.referenceRepos?.trim() || "";
  const patternHint =
    payload.patternHint?.trim() || payload.repoHint?.trim() || "";
  const similarityNotes = payload.similarityNotes?.trim() || "";
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
    org: (payload.org || "other").trim(),
    repoPath: payload.repoPath.trim(),
    repoHint: payload.repoHint?.trim() || "",
    port: payload.port,
    url: payload.url?.trim() || "",
    mission,
    goalSummary,
    track,
    relationship,
    technicalKind,
    baseProjectKey,
    similarProjectKey,
    referenceRepos,
    versionTag,
    patternHint,
    similarityNotes,
    intent,
    projectClass: payload.projectClass?.trim() || "other",
    deliverySurface: payload.deliverySurface?.trim() || "public_website",
    intendedUsers: payload.intendedUsers?.trim() || "",
    domainIntent: payload.domainIntent?.trim() || "",
    googleWorkspacePlan: payload.googleWorkspacePlan?.trim() || "unknown",
    accessModel: payload.accessModel?.trim() || "unknown",
    securityPosture: payload.securityPosture?.trim() || "standard",
    buildStrategy: payload.buildStrategy?.trim() || "guided_followup",
    needsAuthentication: Boolean(payload.needsAuthentication),
    handlesSensitiveData: Boolean(payload.handlesSensitiveData),
    launchLocalFirst: Boolean(payload.launchLocalFirst),
    shellPreference: payload.shellPreference?.trim() || "o2_recommend",
    initialSectionSet: payload.initialSectionSet?.trim() || "o2_recommend",
    needsAdminSurface: Boolean(payload.needsAdminSurface),
    needsCommerceSurface: Boolean(payload.needsCommerceSurface),
    needsKnowledgeSurface: Boolean(payload.needsKnowledgeSurface),
    needsTimelineSurface: Boolean(payload.needsTimelineSurface),
    operatorBrief: payload.operatorBrief?.trim() || "",
    initialConstraints: payload.initialConstraints?.trim() || "",
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
  const [preferredProjectKey, setPreferredProjectKey] = useState<string | null>(null);
  const [showAddProject, setShowAddProject] = useState(false);
  const [addProjectPrefill, setAddProjectPrefill] =
    useState<AddProjectModalPrefill | null>(null);
  const [governedPatterns, setGovernedPatterns] = useState<
    GovernedStarterPattern[]
  >([]);
  const beforeTabChangeSaverRef = useRef<(() => Promise<boolean>) | null>(null);

  const clearPreferredProjectKey = useCallback(() => {
    setPreferredProjectKey(null);
  }, []);

  const loadRegistryOnceRef = useRef(false);
  const loadRegistryInFlightRef = useRef<Promise<ProjectRow[]> | null>(null);
  const loadGovernedPatternsInFlightRef = useRef<
    Promise<GovernedStarterPattern[]> | null
  >(null);

  async function loadRegistry(): Promise<ProjectRow[]> {
    if (loadRegistryInFlightRef.current) return loadRegistryInFlightRef.current;

    loadRegistryInFlightRef.current = (async () => {
      try {
        const out = await runO2Text("list_projects");
        const parsed = parseRegistryMaybeDoubleEncoded(out ?? "");
        const reg = parsed.projects ?? [];

        const rows = registryToProjects(reg);
        setProjects(rows);

        appendLog(`[registry] loaded ${rows.length} project(s)`);
        return rows;
      } catch (e) {
        appendLog("\n[registry] failed:\n" + fmtErr(e));
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

  async function loadGovernedPatterns(): Promise<GovernedStarterPattern[]> {
    if (loadGovernedPatternsInFlightRef.current) {
      return loadGovernedPatternsInFlightRef.current;
    }

    loadGovernedPatternsInFlightRef.current = (async () => {
      try {
        const out = await runO2Text("project_pattern.list");
        const parsed = parseMaybeDoubleEncodedJson(out ?? "") as PatternListResult | null;
        const envelope = asRecord(parsed);
        const patternsRaw = Array.isArray(envelope?.patterns)
          ? envelope.patterns
          : [];

        const next = patternsRaw.flatMap((entry) => {
          const row = asRecord(entry);
          const key = typeof row?.key === "string" ? row.key : null;
          const label = typeof row?.label === "string" ? row.label : null;
          const summary = typeof row?.summary === "string" ? row.summary : null;
          if (!key || !label || !summary) return [];

          return [
            {
              key,
              label,
              summary,
              kinds: Array.isArray(row?.kinds)
                ? row.kinds.filter((item): item is string => typeof item === "string")
                : [],
              projectClasses: Array.isArray(row?.projectClasses)
                ? row.projectClasses.filter(
                    (item): item is string => typeof item === "string",
                  )
                : [],
              deliverySurfaces: Array.isArray(row?.deliverySurfaces)
                ? row.deliverySurfaces.filter(
                    (item): item is string => typeof item === "string",
                  )
                : [],
              bootstrapMode:
                typeof row?.bootstrapMode === "string"
                  ? row.bootstrapMode
                  : undefined,
              repoContracts: Array.isArray(row?.repoContracts)
                ? row.repoContracts.filter(
                    (item): item is string => typeof item === "string",
                  )
                : [],
              starterArtifacts: Array.isArray(row?.starterArtifacts)
                ? row.starterArtifacts.filter(
                    (item): item is string => typeof item === "string",
                  )
                : [],
              securityPosture:
                typeof row?.securityPosture === "string"
                  ? row.securityPosture
                  : undefined,
              artifactPath:
                typeof row?.artifactPath === "string"
                  ? row.artifactPath
                  : undefined,
            },
          ];
        });

        setGovernedPatterns(next);
        appendLog(`[patterns] loaded ${next.length} governed starter pattern(s)`);
        return next;
      } catch (e) {
        appendLog("\n[patterns] failed:\n" + fmtErr(e));
        return [];
      } finally {
        loadGovernedPatternsInFlightRef.current = null;
      }
    })();

    return loadGovernedPatternsInFlightRef.current;
  }

  useEffect(() => {
    if (!showAddProject) return;
    void loadGovernedPatterns();
  }, [showAddProject]);

  const [ports, setPorts] = useState<Record<number, PortStatus | undefined>>(
    {},
  );

  const PORTS = useMemo(() => {
    const s = new Set<number>();
    projects.forEach((p) => {
      const candidates = [p.port, p.preferredPort, p.runtimePort];
      candidates.forEach((candidate) => {
        if (typeof candidate === "number" && Number.isFinite(candidate)) {
          s.add(candidate);
        }
      });
    });

    return Array.from(s.values()).sort((a, b) => a - b);
  }, [projects]);

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
              const out = await runO2Text(`port_status.${p}`);
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
  }, [projects]);

  useEffect(() => {
    if (tab !== "projects") return;

    void loadRegistry();
    void refreshPorts();

    const intervalId = window.setInterval(() => {
      void refreshPorts();
    }, 15000);

    return () => {
      window.clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

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

  async function requestPortSuggestion(
    kind: ProjectKind,
  ): Promise<GovernedPortSuggestion | null> {
    try {
      const out = await runO2Text(`port_suggest.${kind}`);
      const parsed = JSON.parse(out) as PortSuggestionResult;
      if (!parsed?.ok) return null;
      return {
        port:
          typeof parsed.preferredPort === "number" ? parsed.preferredPort : undefined,
        url:
          typeof parsed.preferredUrl === "string" ? parsed.preferredUrl : undefined,
      };
    } catch {
      return null;
    }
  }

  async function runO2(title: string, key?: string): Promise<string | null> {
    if (!key || busy) return null;

    setBusy(true);
    appendLog(`\n[o2] ${title} → run_o2("${key}")\n`);
    try {
      const out = await runO2Text(key);
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

  async function openProjectUrl(p: ProjectRow) {
    const finalUrl =
      typeof p?.url === "string" && p.url.startsWith("http") ? p.url : null;

    if (!finalUrl) {
      appendLog(
        `[projects] Open unavailable for "${p?.label ?? "unknown"}": no project URL is recorded.`,
      );
      return;
    }

    void copyText(finalUrl);

    try {
      await tryAutoOpen(finalUrl);
    } catch (e) {
      appendLog(`
[opener] failed: ${fmtErr(e)}
`);
      appendLog(`[opener] URL copied: ${finalUrl}`);
    }
  }

  async function startProject(p: ProjectRow) {
    if (!p?.o2StartKey) {
      appendLog(
        `[projects] Start unavailable for "${p?.label ?? "unknown"}": no O2 start key configured.`,
      );
      return;
    }

    const out = await runO2(`Start ${p.label}`, p.o2StartKey);
    const rows = await loadRegistry();
    const latest = rows.find((row) => row.key === p.key) ?? p;

    const urlFromOut = out ? extractFirstHttpUrl(out) : null;
    const fallbackUrl =
      typeof latest.url === "string" && latest.url.startsWith("http")
        ? latest.url
        : null;

    const finalUrl = urlFromOut ?? fallbackUrl;
    if (!finalUrl) return;

    if (startRecheckTimerRef.current !== null) {
      window.clearTimeout(startRecheckTimerRef.current);
    }
    startRecheckTimerRef.current = window.setTimeout(() => {
      void refreshPorts();
    }, 1200);

    await openProjectUrl({ ...latest, url: finalUrl });
  }

  async function freePort(port: number) {
    await runO2("Kill requested", `kill_port.${port}`);
    await loadRegistry();
  }

  async function setProjectRetired(project: ProjectRow, retired: boolean) {
    if (busy) return;

    const payload = encodeO2JsonPayload({
      projectKey: project.key,
      retired,
    });
    const verb = `project_retired.set.${payload}`;

    setBusy(true);
    appendLog(
      `\n[o2] Set lifecycle for ${project.label} → run_o2("${verb}")\n`,
    );
    try {
      const out = await runO2Text(verb);
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

  async function setProjectLaunchDate(project: ProjectRow, startDate: string) {
    if (busy) return;

    const payload = encodeO2JsonPayload({
      projectKey: project.key,
      startDate,
    });
    const verb = `project_launch_date.set.${payload}`;

    setBusy(true);
    appendLog(
      `\n[o2] Set launch date for ${project.label} → run_o2("${verb}")\n`,
    );
    try {
      const out = await runO2Text(verb);
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
      const payload = encodeO2JsonPayload({ projectKey: project.key });
      const verb = `project_note.ensure.${payload}`;

      setBusy(true);
      appendLog(
        `\n[o2] Ensure notes for ${project.label} → run_o2("${verb}")\n`,
      );
      try {
        const out = await runO2Text(verb);
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

    const verb = `project_create.start.${encodeO2JsonPayload(formationPayload)}`;

    setBusy(true);
    appendLog(
      `[new-project:intake]\n${JSON.stringify(formationPayload, null, 2)}`,
    );
    appendLog(`\n[o2] Start Formation → run_o2("${verb}")\n`);

    try {
      const out = await runO2Text(verb);
      appendLog(out || "(no output)");

      let parsed: FormationStartResult | null = null;
      try {
        parsed = JSON.parse(out) as FormationStartResult;
      } catch {
        parsed = null;
      }

      if (parsed?.ok) {
        if (parsed.recommendedBuildLane) {
          appendLog(`[new-project] recommended lane: ${parsed.recommendedBuildLane}`);
        }
        if (parsed.buildAgentCandidate) {
          appendLog("[new-project] build-agent planning is a candidate after governed follow-up.");
        }
        if (parsed.securityReviewRequired) {
          appendLog("[new-project] security review is required before scaffold.");
        }
        if (parsed.openQuestions?.length) {
          appendLog(
            `[new-project] open questions:\n- ${parsed.openQuestions.join("\n- ")}`,
          );
        }
        if (parsed.suggestedNextAction) {
          appendLog(`[new-project] suggested next action: ${parsed.suggestedNextAction}`);
        }

        if (parsed.artifactPath) {
          void copyText(parsed.artifactPath);
          appendLog(
            `[new-project] artifact path copied: ${parsed.artifactPath}`,
          );
        }
        if (parsed.intakeArtifactPath) {
          appendLog(
            `[new-project] intake dossier: ${parsed.intakeArtifactPath}`,
          );
        }
        if (parsed.stateArtifactPath) {
          appendLog(
            `[new-project] state dossier: ${parsed.stateArtifactPath}`,
          );
        }

        if (payload.bootstrapNow && parsed.projectKey) {
          const bootstrapVerb = `project_create.bootstrap.${encodeO2JsonPayload({
            projectKey: parsed.projectKey,
          })}`;
          appendLog(
            `\n[o2] Bootstrap Starter Surface → run_o2("${bootstrapVerb}")\n`,
          );

          const bootstrapOut = await runO2Text(bootstrapVerb);
          appendLog(bootstrapOut || "(no output)");

          let bootstrapParsed: ProjectBootstrapResult | null = null;
          try {
            bootstrapParsed = JSON.parse(bootstrapOut) as ProjectBootstrapResult;
          } catch {
            bootstrapParsed = null;
          }

          if (!bootstrapParsed?.ok) {
            const bootstrapMessage = bootstrapParsed?.details?.length
              ? bootstrapParsed.details.join(" ")
              : bootstrapParsed?.error
                ? `Bootstrap rejected: ${bootstrapParsed.error}`
                : "Bootstrap returned an unexpected response.";
            throw new Error(bootstrapMessage);
          }

          appendLog("[new-project] starter localhost surface bootstrapped.");
          if (bootstrapParsed.repoPath) {
            appendLog(`[new-project] repo path: ${bootstrapParsed.repoPath}`);
          }
          if (bootstrapParsed.workspaceFile) {
            appendLog(`[new-project] workspace file: ${bootstrapParsed.workspaceFile}`);
          }
          if (bootstrapParsed.repoFormationDir) {
            appendLog(`[new-project] repo formation dir: ${bootstrapParsed.repoFormationDir}`);
          }
          if (bootstrapParsed.repoBootstrapIntakeJsonPath) {
            appendLog(`[new-project] repo intake json: ${bootstrapParsed.repoBootstrapIntakeJsonPath}`);
          }
          if (bootstrapParsed.repoBootstrapIntakeMdPath) {
            appendLog(`[new-project] repo intake summary: ${bootstrapParsed.repoBootstrapIntakeMdPath}`);
          }
          if (bootstrapParsed.preferredUrl) {
            appendLog(`[new-project] preferred localhost: ${bootstrapParsed.preferredUrl}`);
          }
        }

        await loadRegistry();
        setPreferredProjectKey(parsed.projectKey || null);
        return;
      }

      if (parsed?.error) {
        const detailMessage = parsed.details?.length
          ? parsed.details.join(" ")
          : `Formation rejected: ${parsed.error}`;

        appendLog(
          `[new-project] formation rejected: ${parsed.error}${
            parsed.details?.length ? ` :: ${parsed.details.join(" | ")}` : ""
          }`,
        );
        throw new Error(detailMessage);
      }

      appendLog("[new-project] unexpected non-JSON or non-contract response");
      throw new Error(
        "Start Formation returned an unexpected response. Check the RadControl log for the O2 output.",
      );
    } catch (e) {
      appendLog("\n[new-project] ERROR:\n" + fmtErr(e));
      throw e instanceof Error ? e : new Error(fmtErr(e));
    } finally {
      setBusy(false);
      try {
        await refreshPorts();
      } catch {
        // ignore
      }
    }
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
    if (activeTab === "notes") {
      return (
        <NotesHubTab
          busy={busy}
          registerBeforeTabChangeSaver={registerBeforeTabChangeSaver}
        />
      );
    }

    if (activeTab === "legal") {
      return (
        <LegalHubTab
          busy={busy}
          registerBeforeTabChangeSaver={registerBeforeTabChangeSaver}
        />
      );
    }

    return null;
  }

  return (
    <div className="appShell">
      <header className="header">
        <div className="brand">RadControl</div>

        <div className="tabs tabsFill">
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
          <>
            <ProjectsTab
              projects={projects}
              ports={ports}
              busy={busy}
              portsBusy={portsBusy}
              onOpenAddProject={openAddProjectModal}
              preferredProjectKey={preferredProjectKey}
              onPreferredProjectKeyHandled={clearPreferredProjectKey}
              onStart={startProject}
              onSnapshot={(p) =>
                void runO2(`Repo Snapshot ${p.label}`, p.o2SnapshotKey)
              }
              onCommit={(p) => void runO2(`Commit ${p.label}`, p.o2CommitKey)}
              onKill={freePort}
              onMap={(p) => void runO2(`${p.label} Map`, p.o2MapKey)}
              onProofPack={(p) =>
                void runO2(`${p.label} Proof Pack`, p.o2ProofPackKey)
              }
              onSetRetired={setProjectRetired}
              onSetLaunchDate={setProjectLaunchDate}
              onEnsureNotes={ensureProjectNotes}
              statusForRow={statusForRow}
            />

            <AddProjectModal
              open={showAddProject}
              onClose={closeAddProjectModal}
              onCreate={createProject}
              requestPortSuggestion={requestPortSuggestion}
              governedPatterns={governedPatterns}
              existingProjects={projects}
              prefill={addProjectPrefill}
            />

          </>
        ) : tab === "infrastructure" ? (

          <InfrastructureTab projects={projects} />
        ) : tab === "agents" ? (
          <AgentRunsTab projects={projects} />
        ) : tab === "empire_utility" ? (
          <EmpireUtilityTab />
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

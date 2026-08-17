import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import "./App.css";

import { SecurityTab } from "./components/security/SecurityTab";

import { NotesHubTab } from "./components/paste-tabs/NotesHubTab";
import { LegalHubTab } from "./components/paste-tabs/LegalHubTab";
import { ProjectsTab } from "./components/projects/ProjectsTab";
import { AddProjectModal } from "./components/projects/AddProjectModal";

import { AgentsTab } from "./components/agents/AgentsTab";
import { InfrastructureTab } from "./components/agents/InfrastructureTab";
import { RuntimeDiagnosticsModal } from "./components/runtime/RuntimeDiagnosticsModal";

import type {
  AddProjectPayload,
  PortStatus,
  ProjectRootOverrides,
  ProjectRow,
} from "./components/projects/types";
import { fmtErr } from "./components/projects/helpers";
import {
  listGovernedProjects,
  loadPortStatuses,
} from "./components/projects/projectsApi";
import { normalizeFormationStartPayload } from "./components/projects/formationPayload";
import {
  assertFormationPreviewResult,
  type FormationPreviewResult,
} from "./components/projects/projectIntentPreview";
import {
  assertFormationLearningInheritance,
  type FormationLearningInheritance,
} from "./components/projects/formationLearning";
import { copyText } from "./components/common/copyText";
import { openGovernedUrl } from "./components/common/governedOpener";
import {
  encodeO2JsonPayload,
  getE2EProjectRoots,
  parseO2Json,
  redactO2Verb,
  runO2Text,
} from "./components/common/o2Client";
import { readO2File } from "./components/common/o2Files";

type LibraryTabKey = "notes" | "legal";
type DocTabKey = LibraryTabKey;

type TabKey =
  | "projects"
  | "infrastructure"
  | "agents"
  | "sentinel"
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
  "sentinel",
  ...DOC_TABS.map((t) => t.key),
];


function isDocTab(t: TabKey): t is DocTabKey {
  return DOC_TABS.some((d) => d.key === t);
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
    sentinel: "Security",
  };

  return m[t] ?? t.replace(/_/g, " ");
}

export function cacheFreshLocalUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      url.searchParams.set("_radcontrol_open", Date.now().toString());
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}


function extractFirstHttpUrl(s: string): string | null {
  if (!s) return null;
  const m = s.match(/https?:\/\/localhost:\d+(?:\/[^\s]*)?/);
  return m ? m[0] : null;
}

async function tryAutoOpen(url: string) {
  await openGovernedUrl(url);
}

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
  projectIntent?: FormationPreviewResult["projectIntent"];
  projectionDigest?: string;
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
  learningInheritance?: FormationLearningInheritance;
  error?: string;
  details?: string[];
};

export default function App() {
  const [tab, setTab] = useState<TabKey>("projects");
  const [busy, setBusy] = useState(false);
  const [portsBusy, setPortsBusy] = useState(false);

  const [log, setLog] = useState("");
  const appendLog = (entry: string) =>
    setLog((previous) => {
      const next = previous ? `${previous}\n${entry}` : entry;
      return next.length > 50000 ? next.slice(-50000) : next;
    });

  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const projectsRef = useRef<ProjectRow[]>([]);
  const [preferredProjectKey, setPreferredProjectKey] = useState<string | null>(null);
  const [showAddProject, setShowAddProject] = useState(false);
  const [showRuntimeDiagnostics, setShowRuntimeDiagnostics] = useState(false);
  const [registryState, setRegistryState] = useState<"loading" | "ready" | "error">("loading");
  const [registryError, setRegistryError] = useState("");
  const [projectRootOverrides, setProjectRootOverrides] = useState<ProjectRootOverrides | undefined>();
  const beforeTabChangeSaverRef = useRef<(() => Promise<boolean>) | null>(null);

  const clearPreferredProjectKey = useCallback(() => {
    setPreferredProjectKey(null);
  }, []);

  const loadRegistryOnceRef = useRef(false);
  const loadRegistryInFlightRef = useRef<Promise<ProjectRow[]> | null>(null);

  async function loadRegistry(): Promise<ProjectRow[]> {
    if (loadRegistryInFlightRef.current) return loadRegistryInFlightRef.current;

    loadRegistryInFlightRef.current = (async () => {
      setRegistryState("loading");
      setRegistryError("");
      try {
        const rows = await listGovernedProjects();
        projectsRef.current = rows;
        setProjects(rows);
        setRegistryState("ready");
        void refreshPorts(rows);

        appendLog(`[registry] loaded ${rows.length} project(s)`);
        return rows;
      } catch (e) {
        const message = fmtErr(e);
        appendLog("\n[registry] failed:\n" + message);
        setRegistryError(message);
        setRegistryState("error");
        return projectsRef.current;
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

  useEffect(() => {
    if (!isTauri()) return;
    void getE2EProjectRoots().then((roots) => {
      if (roots) setProjectRootOverrides(roots);
    }).catch(() => undefined);
  }, []);

  const [ports, setPorts] = useState<Record<number, PortStatus | undefined>>(
    {},
  );
  const [portStatusError, setPortStatusError] = useState("");
  const lastPortStatusErrorRef = useRef("");

  function projectPorts(rows: ProjectRow[]): number[] {
    const ports = new Set<number>();
    rows.forEach((project) => {
      [project.port, project.preferredPort, project.runtimePort].forEach(
        (candidate) => {
          if (typeof candidate === "number" && Number.isFinite(candidate)) {
            ports.add(candidate);
          }
        },
      );
    });
    return Array.from(ports).sort((a, b) => a - b);
  }

  const portRefreshInFlightRef = useRef<Promise<void> | null>(null);
  const pendingPortRefreshRowsRef = useRef<ProjectRow[] | null>(null);

  function refreshPorts(rows = projectsRef.current): Promise<void> {
    pendingPortRefreshRowsRef.current = rows;
    if (portRefreshInFlightRef.current) return portRefreshInFlightRef.current;

    const task = (async () => {
      setPortsBusy(true);
      while (pendingPortRefreshRowsRef.current) {
        const requestedRows = pendingPortRefreshRowsRef.current;
        pendingPortRefreshRowsRef.current = null;
        const requestedPorts = projectPorts(requestedRows);
        try {
          if (requestedPorts.length === 0) {
            setPorts({});
            setPortStatusError("");
            lastPortStatusErrorRef.current = "";
            continue;
          }
          const next = await loadPortStatuses(requestedPorts);
          setPorts(next);
          setPortStatusError("");
          lastPortStatusErrorRef.current = "";
        } catch (error) {
          const message = fmtErr(error);
          setPortStatusError(message);
          if (lastPortStatusErrorRef.current !== message) {
            appendLog("\n[ports] status unavailable:\n" + message);
            lastPortStatusErrorRef.current = message;
          }
        }
      }
    })().finally(() => {
      setPortsBusy(false);
      portRefreshInFlightRef.current = null;
      if (pendingPortRefreshRowsRef.current) void refreshPorts();
    });
    portRefreshInFlightRef.current = task;
    return task;
  }

  useEffect(() => {
    projectsRef.current = projects;
    void refreshPorts(projects);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);

  useEffect(() => {
    if (tab !== "projects") return;

    void loadRegistry();
    void refreshPorts(projectsRef.current);

    const intervalId = window.setInterval(() => {
      void refreshPorts(projectsRef.current);
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

    if (portStatusError) {
      return { pill: "pillWarn", text: "UNKNOWN" };
    }

    const port = p.runtimePort ?? p.port;
    const s = ports[port];
    if (!s) return { pill: "pillOff", text: "STOPPED" };

    return s.listening
      ? { pill: "pillOn", text: "RUNNING" }
      : { pill: "pillOff", text: "STOPPED" };
  }

  async function runO2Action(title: string, key?: string): Promise<string | null> {
    if (!key || busy) return null;

    setBusy(true);
    appendLog(`\n[o2] ${title} → run_o2("${redactO2Verb(key)}")\n`);
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
      typeof p?.operatorUrl === "string" && p.operatorUrl.startsWith("http")
        ? p.operatorUrl
        : typeof p?.launchUrl === "string" && p.launchUrl.startsWith("http")
        ? p.launchUrl
        : typeof p?.runtimeUrl === "string" && p.runtimeUrl.startsWith("http")
        ? p.runtimeUrl
        : typeof p?.url === "string" && p.url.startsWith("http")
          ? p.url
          : null;

    if (!finalUrl) {
      appendLog(
        `[projects] Open unavailable for "${p?.label ?? "unknown"}": no project URL is recorded.`,
      );
      return;
    }

    const openUrl = cacheFreshLocalUrl(finalUrl);
    void copyText(openUrl);

    try {
      await tryAutoOpen(openUrl);
    } catch (e) {
      appendLog(`
[opener] failed: ${fmtErr(e)}
`);
      appendLog(`[opener] URL copied: ${openUrl}`);
    }
  }

  async function launchProjectWebsite(p: ProjectRow) {
    const websiteUrl = p.websiteUrl?.startsWith("http") ? p.websiteUrl : null;
    if (!websiteUrl) {
      appendLog(`[projects] Website unavailable for "${p.label}": no live website URL is recorded.`);
      return;
    }
    void copyText(websiteUrl);
    try {
      await tryAutoOpen(websiteUrl);
    } catch (error) {
      appendLog(`[opener] failed: ${fmtErr(error)}`);
      appendLog(`[opener] URL copied: ${websiteUrl}`);
    }
  }

  async function ensureLaunchHost(project: ProjectRow): Promise<boolean> {
    if (!project.launchHostKey) return true;
    const rows = await loadRegistry();
    const host = rows.find((row) => row.key === project.launchHostKey);
    if (!host) {
      appendLog(`[projects] Launch host "${project.launchHostKey}" is not registered.`);
      return false;
    }
    if (!host.o2StartKey) {
      appendLog(`[projects] Launch host "${host.label}" has no O2 start command.`);
      return false;
    }

    return (await runO2Action(`Start ${host.label}`, host.o2StartKey)) !== null;
  }

  async function startProject(p: ProjectRow) {
    if (!p?.o2StartKey) {
      appendLog(
        `[projects] Start unavailable for "${p?.label ?? "unknown"}": no O2 start key configured.`,
      );
      return;
    }

    const out = await runO2Action(`Start ${p.label}`, p.o2StartKey);
    if (out === null) {
      appendLog(`[projects] Launch aborted because ${p.label} did not start successfully.`);
      return;
    }

    const rows = await loadRegistry();
    const latest = rows.find((row) => row.key === p.key) ?? p;
    if (!(await ensureLaunchHost(latest))) {
      appendLog(`[projects] Launch aborted because its Radcon Enterprises host did not start successfully.`);
      return;
    }

    const urlFromOut = out ? extractFirstHttpUrl(out) : null;
    const fallbackUrl =
      typeof latest.operatorUrl === "string" && latest.operatorUrl.startsWith("http")
        ? latest.operatorUrl
        : typeof latest.launchUrl === "string" && latest.launchUrl.startsWith("http")
          ? latest.launchUrl
          : typeof latest.url === "string" && latest.url.startsWith("http")
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

  async function stopProjectRuntime(project: ProjectRow) {
    await runO2Action(`Stop ${project.label}`, `${project.key}.stop`);
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
      `\n[o2] Set lifecycle for ${project.label} → run_o2("${redactO2Verb(verb)}")\n`,
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
      `\n[o2] Set launch date for ${project.label} → run_o2("${redactO2Verb(verb)}")\n`,
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
        `\n[o2] Ensure notes for ${project.label} → run_o2("${redactO2Verb(verb)}")\n`,
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

  async function showOriginalProjectRequest(project: ProjectRow): Promise<void> {
    if (!project.intakeAvailable || !project.intakePath) {
      appendLog(`[original-request] no governed request is available for ${project.label}`);
      return;
    }

    const path = project.intakePath;
    try {
      const record = await readO2File(path);
      let content = record.content || "";
      try {
        content = JSON.stringify(JSON.parse(content), null, 2);
      } catch {
        // Preserve non-JSON historical intake records as-is.
      }
      appendLog(`\n[original-request:${project.key}]\n${content || "(empty request record)"}`);
    } catch (error) {
      appendLog(`\n[original-request:${project.key}] unavailable: ${fmtErr(error)}`);
    }
  }

  async function createProject(payload: AddProjectPayload) {
    const formationPayload = normalizeFormationStartPayload(payload);
    if (!formationPayload.approvedProjectIntentDigest) {
      throw new Error("Review the O2 Project Intent before building.");
    }

    if (formationPayload.projectType === "website_successor" && formationPayload.baseProjectKey) {
      const rows = await loadRegistry();
      const baseProject = rows.find((row) => row.key === formationPayload.baseProjectKey);
      if (!baseProject) {
        throw new Error(`Base project "${formationPayload.baseProjectKey}" was not found in Projects.`);
      }
    }

    const verb = `project_create.start.${encodeO2JsonPayload(formationPayload)}`;

    setBusy(true);
    appendLog(`[new-project:intake] ${formationPayload.label} · payload omitted from runtime log`);
    appendLog(`\n[o2] Start Formation → run_o2("${redactO2Verb(verb)}")\n`);

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
        if (parsed.projectionDigest !== formationPayload.approvedProjectIntentDigest) {
          throw new Error("O2 start did not preserve the reviewed Project Intent digest.");
        }
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
            `\n[o2] Bootstrap Starter Surface → run_o2("${redactO2Verb(bootstrapVerb)}")\n`,
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

          const learning = assertFormationLearningInheritance(
            bootstrapParsed.learningInheritance,
            {
              projectKey: parsed.projectKey,
              projectArchetype: formationPayload.projectArchetype,
            },
          );

          appendLog("[new-project] starter localhost surface bootstrapped.");
          appendLog(
            `[new-project] learning inheritance conformant: ${learning.productAuthorityPath}; correction, roadblock, and quality routes available; memory not inherited.`,
          );
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

  async function previewProject(payload: AddProjectPayload): Promise<FormationPreviewResult> {
    const formationPayload = normalizeFormationStartPayload(payload);
    const verb = `project_create.preview.${encodeO2JsonPayload(formationPayload)}`;
    setBusy(true);
    appendLog(`[new-project:review] ${formationPayload.label} · payload omitted from runtime log`);
    try {
      const out = await runO2Text(verb);
      const parsed = parseO2Json<unknown>(
        out,
        "O2 Project Intent preview returned invalid JSON",
      );
      return assertFormationPreviewResult(parsed);
    } finally {
      setBusy(false);
    }
  }

  function openAddProjectModal() {
    setShowAddProject(true);
  }

  function closeAddProjectModal() {
    setShowAddProject(false);
  }

  const logText = (busy ? "Running…" : log || "No logs yet.").toString();

  function registerBeforeTabChangeSaver(fn: (() => Promise<boolean>) | null) {
    beforeTabChangeSaverRef.current = fn;
  }

  async function requestTabChange(nextTab: TabKey): Promise<void> {
    if (nextTab === tab) return;

    const saver = beforeTabChangeSaverRef.current;
    if (saver) {
      try {
        const ok = await saver();
        if (!ok) return;
      } catch {
        return;
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
              data-testid={`tab-${t}`}
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
            onClick={() => setShowRuntimeDiagnostics(true)}
            title="Show the installed app build, production O2 root, and live content smoke status."
          >
            Runtime
          </button>
        </div>
      </header>

      <main className="mainArea">
        {tab === "projects" ? (
          <>
            <ProjectsTab
              projects={projects}
              registryLoading={registryState === "loading"}
              registryError={registryError}
              ports={ports}
              busy={busy}
              portsBusy={portsBusy}
              onOpenAddProject={openAddProjectModal}
              preferredProjectKey={preferredProjectKey}
              onPreferredProjectKeyHandled={clearPreferredProjectKey}
              onStart={startProject}
              onLaunchWebsite={launchProjectWebsite}
              onSnapshot={(p) =>
                void runO2Action(`Repo Snapshot ${p.label}`, p.o2SnapshotKey)
              }
              onStop={stopProjectRuntime}
              onMap={(p) => void runO2Action(`${p.label} Map`, p.o2MapKey)}
              onShowOriginalRequest={showOriginalProjectRequest}
              onProofPack={(p) =>
                void runO2Action(`${p.label} Proof Pack`, p.o2ProofPackKey)
              }
              onSetRetired={setProjectRetired}
              onSetLaunchDate={setProjectLaunchDate}
              onEnsureNotes={ensureProjectNotes}
              registerBeforeTabChangeSaver={registerBeforeTabChangeSaver}
              statusForRow={statusForRow}
            />

            <AddProjectModal
              open={showAddProject}
              onClose={closeAddProjectModal}
              onCreate={createProject}
              onReview={previewProject}
              existingProjects={projects}
              projectRootOverrides={projectRootOverrides}
            />

          </>
        ) : tab === "infrastructure" ? (

          <InfrastructureTab
            projects={projects}
            onAppendLog={appendLog}
            registerBeforeTabChangeSaver={registerBeforeTabChangeSaver}
          />
        ) : tab === "agents" ? (
          <AgentsTab
            projects={projects}
            registerBeforeTabChangeSaver={registerBeforeTabChangeSaver}
          />
        ) : tab === "sentinel" ? (
          <SecurityTab
            registerBeforeTabChangeSaver={registerBeforeTabChangeSaver}
          />
        ) : isDocTab(tab) ? (
          renderDocTab(tab)
        ) : null}
      </main>

      <RuntimeDiagnosticsModal
        open={showRuntimeDiagnostics}
        onClose={() => setShowRuntimeDiagnostics(false)}
        projects={projects}
        registryState={registryState}
        registryError={registryError}
      />

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

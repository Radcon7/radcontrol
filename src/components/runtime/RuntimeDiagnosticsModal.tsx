import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { buildInfrastructureProfiles } from "../agents/infrastructureModel";
import { listEmpireTodos } from "../notes/empireTodoApi";
import type { ProjectRow } from "../projects/types";
import { filterOperatorProjects } from "../projects/projectModel";
import { loadSentinelStatus } from "../sentinel/sentinelApi";

type RegistryState = "loading" | "ready" | "error";

type RuntimeDiagnostics = {
  appVersion: string;
  gitSha: string;
  builtAtEpochSeconds: number;
  runtimeMode: string;
  executablePath: string;
  radcontrolRoot: string;
  o2Root: string;
  o2GitSha?: string | null;
  o2GitBranch?: string | null;
  dispatcherPath: string;
  projectRegistryPath: string;
  empireTodoSeedPath: string;
  empireTodoStorePath: string;
  dispatcherAvailable: boolean;
  projectRegistryAvailable: boolean;
  auditTransportAvailable: boolean;
  empireTodoSeedAvailable: boolean;
  empireTodoStoreAvailable: boolean;
  bridgeFailure?: string | null;
};

type SmokeState = {
  todoTitles: string[];
  todoError: string;
  sentinelAvailable: boolean;
  sentinelError: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  projects: ProjectRow[];
  registryState: RegistryState;
  registryError: string;
};

const EXPECTED_PROJECT_KEYS = [
  "dqotd",
  "tbis",
  "offroad",
  "radstock",
  "radcrm",
  "radconenterprises",
  "radfamily",
  "radwolfe",
  "radcalendar",
];

const EXPECTED_TODO_TITLES = [
  "Resolve Codex Memory Runtime Proof — Round 4B",
  "Finish New Project Questionnaire + Unified Project Build Pipeline",
  "Build Radcon Sentinel — Host + Empire Security",
];

const NOTES_VIEWS = ["Notes", "Timeline", "Empire Blueprint", "Empire To-Do"];

function sameSet(actual: string[], expected: string[]): boolean {
  return actual.length === expected.length && expected.every((value) => actual.includes(value));
}

function Check({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="runtimeCheckRow">
      <span className={`pill ${ok ? "pillOn" : "pillWarn"}`}>{ok ? "READY" : "CHECK"}</span>
      <div>
        <strong>{label}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}

function diagnosticRows(diagnostics: RuntimeDiagnostics): Array<[string, string]> {
  return [
    ["App build", `v${diagnostics.appVersion} · ${diagnostics.gitSha}`],
    ["Build time", new Date(diagnostics.builtAtEpochSeconds * 1000).toLocaleString()],
    ["Runtime", `${diagnostics.runtimeMode} · ${diagnostics.executablePath}`],
    ["RadControl source", diagnostics.radcontrolRoot],
    ["O2 runtime", `${diagnostics.o2Root} · ${diagnostics.o2GitBranch || "detached"} · ${diagnostics.o2GitSha || "unknown"}`],
    ["O2 dispatcher", diagnostics.dispatcherPath],
    ["Project registry", diagnostics.projectRegistryPath],
    ["Bridge status", diagnostics.bridgeFailure || "ready"],
    ["To-Do seed", diagnostics.empireTodoSeedPath],
    ["To-Do store", diagnostics.empireTodoStorePath],
  ];
}

export function RuntimeDiagnosticsModal({
  open,
  onClose,
  projects,
  registryState,
  registryError,
}: Props) {
  const [diagnostics, setDiagnostics] = useState<RuntimeDiagnostics | null>(null);
  const [diagnosticsError, setDiagnosticsError] = useState("");
  const [loading, setLoading] = useState(false);
  const [smoke, setSmoke] = useState<SmokeState>({
    todoTitles: [],
    todoError: "",
    sentinelAvailable: false,
    sentinelError: "",
  });

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setDiagnosticsError("");
    setSmoke({ todoTitles: [], todoError: "", sentinelAvailable: false, sentinelError: "" });

    void Promise.allSettled([
      invoke<RuntimeDiagnostics>("runtime_diagnostics"),
      listEmpireTodos(),
      loadSentinelStatus(),
    ]).then(([diagnosticsResult, todoResult, sentinelResult]) => {
      if (!active) return;
      if (diagnosticsResult.status === "fulfilled") setDiagnostics(diagnosticsResult.value);
      else setDiagnosticsError(String(diagnosticsResult.reason));
      setSmoke({
        todoTitles: todoResult.status === "fulfilled" ? todoResult.value.items.map((item) => item.title) : [],
        todoError: todoResult.status === "rejected" ? String(todoResult.reason) : "",
        sentinelAvailable: sentinelResult.status === "fulfilled" && sentinelResult.value.ok !== false,
        sentinelError: sentinelResult.status === "rejected" ? String(sentinelResult.reason) : "",
      });
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [open]);

  const operatorProjects = useMemo(() => filterOperatorProjects(projects), [projects]);
  const projectKeys = operatorProjects.map((project) => project.key);
  const infrastructureLabels = useMemo(
    () => buildInfrastructureProfiles(projects).map((profile) => profile.label),
    [projects],
  );
  const runtimeFilesReady = Boolean(
    diagnostics?.dispatcherAvailable &&
      diagnostics.projectRegistryAvailable &&
      diagnostics.auditTransportAvailable &&
      diagnostics.empireTodoSeedAvailable &&
      diagnostics.empireTodoStoreAvailable &&
      !diagnostics.bridgeFailure,
  );
  const productReady =
    diagnostics?.runtimeMode === "production" &&
    runtimeFilesReady &&
    registryState === "ready" &&
    sameSet(projectKeys, EXPECTED_PROJECT_KEYS) &&
    sameSet(smoke.todoTitles, EXPECTED_TODO_TITLES) &&
    infrastructureLabels.length === 10 &&
    smoke.sentinelAvailable;

  if (!open) return null;

  return (
    <div className="modalOverlay" role="presentation" onMouseDown={onClose}>
      <section
        className="modalCard runtimeModalCard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="runtime-diagnostics-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modalHeader">
          <div>
            <div className="modalTitle" id="runtime-diagnostics-title">Runtime &amp; Build</div>
            <div className="runtimeVerdict">
              <span className={`pill ${productReady ? "pillOn" : "pillWarn"}`}>
                {loading ? "CHECKING" : productReady ? "LIVE PRODUCT READY" : "ATTENTION REQUIRED"}
              </span>
            </div>
          </div>
          <button className="btn btnGhost" type="button" onClick={onClose}>Close</button>
        </div>

        <div className="runtimeModalBody">
          {diagnosticsError ? <div className="panelError">Runtime diagnostics unavailable: {diagnosticsError}</div> : null}
          {diagnostics ? (
            <div className="runtimeIdentityGrid">
              {diagnosticRows(diagnostics).map(([label, value]) => (
                <div className="runtimeIdentityRow" key={label}>
                  <span>{label}</span>
                  <code>{value}</code>
                </div>
              ))}
            </div>
          ) : loading ? <div className="surfaceEmptyState">Reading installed runtime identity…</div> : null}

          <div className="runtimeChecks">
            <Check
              ok={diagnostics?.runtimeMode === "production"}
              label="Listener-free production mode"
              detail={diagnostics ? `${diagnostics.runtimeMode} · ${diagnostics.executablePath}` : "Runtime identity unavailable"}
            />
            <Check
              ok={runtimeFilesReady}
              label="Canonical O2 data root"
              detail={runtimeFilesReady ? "Dispatcher, registry, audit transport, To-Do seed, and durable store are present." : `Canonical runtime boundary unavailable${diagnostics?.bridgeFailure ? `: ${diagnostics.bridgeFailure}` : "."}`}
            />
            <Check
              ok={registryState === "ready" && sameSet(projectKeys, EXPECTED_PROJECT_KEYS)}
              label={`Projects · ${operatorProjects.length} visible`}
              detail={registryError || operatorProjects.map((project) => project.label).join(" · ") || "Project data unavailable"}
            />
            <Check
              ok={sameSet(smoke.todoTitles, EXPECTED_TODO_TITLES)}
              label={`Empire To-Do · ${smoke.todoTitles.length} durable items`}
              detail={smoke.todoError || smoke.todoTitles.join(" · ") || "To-Do data unavailable"}
            />
            <Check
              ok={infrastructureLabels.length === 10}
              label={`Infrastructure · ${infrastructureLabels.length} governed profiles`}
              detail={infrastructureLabels.join(" · ")}
            />
            <Check
              ok={NOTES_VIEWS.length === 4}
              label="Notes content surfaces"
              detail={NOTES_VIEWS.join(" · ")}
            />
            <Check
              ok={smoke.sentinelAvailable}
              label="Security / Radcon Sentinel"
              detail={smoke.sentinelError || (smoke.sentinelAvailable ? "Sentinel status loaded from the canonical O2 runtime." : "Sentinel status unavailable")}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

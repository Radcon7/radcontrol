import { useEffect, useMemo, useState } from "react";
import { ArtifactListPanel } from "../common/ArtifactListPanel";
import {
  type FilesListItem,
  listO2Files,
  readO2File,
  runO2PayloadParsedJson,
} from "../common/o2Files";
import { SystemStateShell } from "../common/SystemStateShell";
import type { ProjectRow } from "../projects/types";

type CreateInfrastructureJson = {
  ok?: boolean;
  assetKey?: string;
  originArtifactPath?: string;
  error?: string;
};

type Props = {
  projects: ProjectRow[];
};

type InfrastructureTemplate = {
  id: string;
  label: string;
  assetType: string;
  provider: string;
  owningOrg: string;
  environmentScope: string;
  relatedProjectKeys: string;
  role: string;
  canonicalDomain: string;
  primaryConsoleUrl: string;
  statusSummary: string;
};

const RECORDS_DIR = "docs/infrastructure/records";

function isOriginArtifact(item: FilesListItem): boolean {
  const path = item.path || "";
  return path.startsWith(`${RECORDS_DIR}/`) && path.endsWith("/00_origin.md");
}

function sortNewest(items: FilesListItem[]) {
  return [...items].sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
}

export function InfrastructureTab({ projects }: Props) {
  const [items, setItems] = useState<FilesListItem[]>([]);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [currentText, setCurrentText] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState("");

  const firstProjectKey = projects[0]?.key || "dqotd";
  const dqotdProjectKey = projects.find((project) => project.key === "dqotd")?.key || firstProjectKey;
  const radcontrolProjectKey =
    projects.find((project) => project.key === "radcontrol")?.key || firstProjectKey;

  const templates = useMemo<InfrastructureTemplate[]>(
    () => [
      {
        id: "domain-public",
        label: "Public Domain",
        assetType: "domain",
        provider: "cloudflare",
        owningOrg: "radcon",
        environmentScope: "production",
        relatedProjectKeys: dqotdProjectKey,
        role: "Public-facing canonical domain used by a launched or launch-ready website.",
        canonicalDomain: "dinosaurquestionoftheday.com",
        primaryConsoleUrl: "",
        statusSummary: "Record the owner, DNS authority, and launch readiness for this public domain.",
      },
      {
        id: "vercel-runtime",
        label: "Vercel Runtime",
        assetType: "vercel_project",
        provider: "vercel",
        owningOrg: "radcon",
        environmentScope: "preview",
        relatedProjectKeys: dqotdProjectKey,
        role: "Deployment runtime and preview surface for a governed web property.",
        canonicalDomain: "",
        primaryConsoleUrl: "https://vercel.com/dashboard",
        statusSummary: "Track deploy ownership, environment variables, and preview stability.",
      },
      {
        id: "supabase-stack",
        label: "Supabase Stack",
        assetType: "supabase_project",
        provider: "supabase",
        owningOrg: "radcon",
        environmentScope: "mixed",
        relatedProjectKeys: dqotdProjectKey,
        role: "Backend data and auth surface supporting a governed application.",
        canonicalDomain: "",
        primaryConsoleUrl: "https://supabase.com/dashboard/projects",
        statusSummary: "Capture auth, storage, and migration responsibility under one governed record.",
      },
      {
        id: "radcontrol-ops",
        label: "RadControl Runtime",
        assetType: "uptime_target",
        provider: "local",
        owningOrg: "radcon",
        environmentScope: "local",
        relatedProjectKeys: radcontrolProjectKey,
        role: "Operational surface for the desktop command center itself.",
        canonicalDomain: "",
        primaryConsoleUrl: "http://localhost:1420",
        statusSummary: "Use this to track local runtime expectations, launch flow, and restart doctrine.",
      },
    ],
    [dqotdProjectKey, radcontrolProjectKey],
  );

  const [label, setLabel] = useState("DQOTD Domain");
  const [assetType, setAssetType] = useState("domain");
  const [provider, setProvider] = useState("cloudflare");
  const [owningOrg, setOwningOrg] = useState("radcon");
  const [environmentScope, setEnvironmentScope] = useState("production");
  const [relatedProjectKeys, setRelatedProjectKeys] = useState(dqotdProjectKey);
  const [role, setRole] = useState(
    "Primary public-facing domain asset for the first launched website.",
  );
  const [canonicalDomain, setCanonicalDomain] = useState(
    "dinosaurquestionoftheday.com",
  );
  const [primaryConsoleUrl, setPrimaryConsoleUrl] = useState("");
  const [canonicalNotesPath] = useState("");
  const [statusSummary, setStatusSummary] = useState(
    "Initial governed infrastructure record created from RadControl.",
  );
  const [openQuestions] = useState(
    "- Which provider-side health or status checks should be automated first?",
  );

  const originRecords = useMemo(
    () => sortNewest(items.filter(isOriginArtifact)),
    [items],
  );

  async function readPath(path: string): Promise<void> {
    const parsed = await readO2File(path);

    setCurrentPath(path);
    setCurrentText(parsed.content || "");
  }

  async function refreshList(preferredPath?: string | null): Promise<void> {
    setLoading(true);
    setErr("");
    try {
      const parsed = await listO2Files(RECORDS_DIR);

      const nextItems = parsed.items || [];
      const nextOrigins = sortNewest(nextItems.filter(isOriginArtifact));
      setItems(nextItems);

      const nextPath =
        preferredPath && nextOrigins.some((item) => item.path === preferredPath)
          ? preferredPath
          : currentPath && nextOrigins.some((item) => item.path === currentPath)
            ? currentPath
            : nextOrigins[0]?.path || null;

      if (nextPath) {
        await readPath(nextPath);
      } else {
        setCurrentPath(null);
        setCurrentText("");
      }
    } catch (error) {
      setErr(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyTemplate(template: InfrastructureTemplate): void {
    setLabel(template.label);
    setAssetType(template.assetType);
    setProvider(template.provider);
    setOwningOrg(template.owningOrg);
    setEnvironmentScope(template.environmentScope);
    setRelatedProjectKeys(template.relatedProjectKeys);
    setRole(template.role);
    setCanonicalDomain(template.canonicalDomain);
    setPrimaryConsoleUrl(template.primaryConsoleUrl);
    setStatusSummary(template.statusSummary);
  }

  async function createAsset(): Promise<void> {
    if (!label.trim() || !assetType.trim() || !provider.trim() || !role.trim()) {
      setErr("Label, asset type, provider, and role are required.");
      return;
    }

    setCreating(true);
    setErr("");
    try {
      const payload = {
        label,
        assetType,
        provider,
        owningOrg,
        environmentScope,
        relatedProjectKeys: relatedProjectKeys
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        role,
        canonicalDomain,
        primaryConsoleUrl,
        canonicalNotesPath,
        statusSummary,
        openQuestions,
      };

      const parsed = await runO2PayloadParsedJson<CreateInfrastructureJson>(
        "infrastructure_asset.create",
        payload,
        "infrastructure_asset.create failed",
        "infrastructure_asset.create returned invalid JSON",
      );
      if (!parsed.ok || !parsed.originArtifactPath) {
        throw new Error(parsed.error || "infrastructure_asset.create returned error");
      }

      await refreshList(parsed.originArtifactPath);
    } catch (error) {
      setErr(error instanceof Error ? error.message : String(error));
    } finally {
      setCreating(false);
    }
  }

  const actions = (
    <>
      <button className="btn btnGhost" onClick={() => applyTemplate(templates[0])}>
        Apply Domain Template
      </button>
      <button
        className="btn btnGhost"
        onClick={() => void refreshList()}
        disabled={loading || creating}
      >
        {loading ? "Loading…" : "Refresh"}
      </button>
    </>
  );


  return (
    <SystemStateShell
      title="Infrastructure"
      actions={actions}
      error={err ? <>{err}</> : null}
    >
      <div className="surfaceLayout">
        <div className="surfaceSidebarStack">
          <div className="surfaceCard">
            <div className="surfaceCardTitle">Infrastructure Templates</div>
            <div className="surfaceList">
              {templates.map((template) => (
                <button
                  key={template.id}
                  className="btn btnGhost surfaceButtonLeft"
                  onClick={() => applyTemplate(template)}
                >
                  <span className="surfaceButtonBody">
                    <span>{template.label}</span>
                    <span className="surfaceButtonMeta">
                      {template.provider} • {template.assetType} • {template.environmentScope}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <ArtifactListPanel
            title="Infrastructure Records"
            items={originRecords}
            currentPath={currentPath}
            emptyText="No governed infrastructure records yet."
            onSelect={(path) => void readPath(path)}
          />
        </div>

        <div className="surfaceCommandMain">
          <div className="surfaceTwoPane">
            <div className="surfaceCard surfaceFormGrid surfaceScrollCard">
              <div className="surfaceCardTitle">Create Infrastructure Asset</div>

              <label className="surfaceFormField">
                <span className="surfaceFormLabel">Label</span>
                <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} />
              </label>

              <div className="surfaceFormRow2">
                <label className="surfaceFormField">
                  <span className="surfaceFormLabel">Asset Type</span>
                  <select className="input" value={assetType} onChange={(e) => setAssetType(e.target.value)}>
                    <option value="domain">domain</option>
                    <option value="dns_zone">dns_zone</option>
                    <option value="vercel_project">vercel_project</option>
                    <option value="supabase_project">supabase_project</option>
                    <option value="google_workspace">google_workspace</option>
                    <option value="uptime_target">uptime_target</option>
                    <option value="analytics_property">analytics_property</option>
                    <option value="other">other</option>
                  </select>
                </label>
                <label className="surfaceFormField">
                  <span className="surfaceFormLabel">Provider</span>
                  <input className="input" value={provider} onChange={(e) => setProvider(e.target.value)} />
                </label>
              </div>

              <div className="surfaceFormRow2">
                <label className="surfaceFormField">
                  <span className="surfaceFormLabel">Owning Org</span>
                  <input className="input" value={owningOrg} onChange={(e) => setOwningOrg(e.target.value)} />
                </label>
                <label className="surfaceFormField">
                  <span className="surfaceFormLabel">Environment Scope</span>
                  <select className="input" value={environmentScope} onChange={(e) => setEnvironmentScope(e.target.value)}>
                    <option value="local">local</option>
                    <option value="preview">preview</option>
                    <option value="production">production</option>
                    <option value="mixed">mixed</option>
                    <option value="other">other</option>
                  </select>
                </label>
              </div>

              <label className="surfaceFormField">
                <span className="surfaceFormLabel">Related Project Keys</span>
                <input
                  className="input"
                  list="infrastructure-project-keys"
                  value={relatedProjectKeys}
                  onChange={(e) => setRelatedProjectKeys(e.target.value)}
                />
                <datalist id="infrastructure-project-keys">
                  {projects.map((project) => (
                    <option key={project.key} value={project.key} />
                  ))}
                </datalist>
              </label>

              <label className="surfaceFormField">
                <span className="surfaceFormLabel">Role</span>
                <textarea className="pasteArea surfaceTextAreaLg" value={role} onChange={(e) => setRole(e.target.value)} />
              </label>

              <label className="surfaceFormField">
                <span className="surfaceFormLabel">Canonical Domain</span>
                <input className="input" value={canonicalDomain} onChange={(e) => setCanonicalDomain(e.target.value)} />
              </label>

              <label className="surfaceFormField">
                <span className="surfaceFormLabel">Primary Console URL</span>
                <input className="input" value={primaryConsoleUrl} onChange={(e) => setPrimaryConsoleUrl(e.target.value)} />
              </label>

              <label className="surfaceFormField">
                <span className="surfaceFormLabel">Status Summary</span>
                <textarea className="pasteArea surfaceTextAreaMd" value={statusSummary} onChange={(e) => setStatusSummary(e.target.value)} />
              </label>

              <button className="btn btnPrimary" onClick={() => void createAsset()} disabled={creating || loading}>
                {creating ? "Creating…" : "Create Governed Asset"}
              </button>
            </div>

            <div className="surfaceCard surfaceViewer">
              <div className="surfaceCardTitle">Governed Record</div>
              <textarea
                className="pasteArea surfaceTextareaFill"
                value={currentText}
                placeholder="Selected infrastructure origin record will appear here…"
                spellCheck={false}
                readOnly
              />
            </div>
          </div>
        </div>
      </div>
    </SystemStateShell>
  );
}

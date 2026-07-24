import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ArtifactListPanel } from "../common/ArtifactListPanel";
import { SystemStateShell } from "../common/SystemStateShell";
import {
  formatMaybeUnixTime,
  type FilesListItem,
} from "../common/useArtifactStore";
import type { ProjectRow } from "../projects/types";

type RunO2Result = {
  ok?: boolean;
  code?: number;
  stdout?: string;
  stderr?: string;
};

type FilesListJson = {
  ok?: boolean;
  items?: FilesListItem[];
  error?: string;
};

type FilesReadJson = {
  ok?: boolean;
  content?: string;
  path?: string;
  error?: string;
  mtime?: number;
};

type CreateInfrastructureJson = {
  ok?: boolean;
  assetKey?: string;
  originArtifactPath?: string;
  error?: string;
};

type Props = {
  projects: ProjectRow[];
};

const RECORDS_DIR = "docs/infrastructure/records";

function b64urlEncodeUtf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function errMsg(res: RunO2Result, fallback: string): string {
  return (res.stderr || "").trim() || fallback;
}

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
  const [currentMtime, setCurrentMtime] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState("");

  const [label, setLabel] = useState("DQOTD Domain");
  const [assetType, setAssetType] = useState("domain");
  const [provider, setProvider] = useState("cloudflare");
  const [owningOrg, setOwningOrg] = useState("radcon");
  const [environmentScope, setEnvironmentScope] = useState("production");
  const [relatedProjectKeys, setRelatedProjectKeys] = useState("dqotd");
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

  const listVerb = useMemo(
    () => `files.list.${b64urlEncodeUtf8(RECORDS_DIR)}`,
    [],
  );

  const originRecords = useMemo(
    () => sortNewest(items.filter(isOriginArtifact)),
    [items],
  );

  async function readPath(path: string): Promise<void> {
    const res = (await invoke("run_o2", {
      verb: `files.read.${b64urlEncodeUtf8(path)}`,
    })) as RunO2Result;
    if (!res.ok) throw new Error(errMsg(res, "files.read failed"));

    let parsed: FilesReadJson;
    try {
      parsed = JSON.parse((res.stdout || "").trim()) as FilesReadJson;
    } catch {
      throw new Error("files.read returned invalid JSON");
    }
    if (!parsed.ok) throw new Error(parsed.error || "files.read returned error");

    setCurrentPath(path);
    setCurrentText(parsed.content || "");
    setCurrentMtime(parsed.mtime || null);
  }

  async function refreshList(preferredPath?: string | null): Promise<void> {
    setLoading(true);
    setErr("");
    try {
      const res = (await invoke("run_o2", { verb: listVerb })) as RunO2Result;
      if (!res.ok) throw new Error(errMsg(res, "files.list failed"));

      let parsed: FilesListJson;
      try {
        parsed = JSON.parse((res.stdout || "").trim()) as FilesListJson;
      } catch {
        throw new Error("files.list returned invalid JSON");
      }
      if (!parsed.ok) throw new Error(parsed.error || "files.list returned error");

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
        setCurrentMtime(null);
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

      const verb = `infrastructure_asset.create.${b64urlEncodeUtf8(JSON.stringify(payload))}`;
      const res = (await invoke("run_o2", { verb })) as RunO2Result;
      if (!res.ok) throw new Error(errMsg(res, "infrastructure_asset.create failed"));

      let parsed: CreateInfrastructureJson;
      try {
        parsed = JSON.parse((res.stdout || "").trim()) as CreateInfrastructureJson;
      } catch {
        throw new Error("infrastructure_asset.create returned invalid JSON");
      }
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
    <button
      className="btn btnGhost"
      onClick={() => void refreshList()}
      disabled={loading || creating}
    >
      {loading ? "Loading…" : "Load"}
    </button>
  );

  const meta = (
    <div className="panelMeta">
      <div>
        <strong>Record root:</strong> {RECORDS_DIR}
      </div>
      <div>
        <strong>Assets found:</strong> {originRecords.length}
      </div>
      <div>
        <strong>Selected file:</strong> {currentPath ?? "(none loaded)"}
      </div>
      <div>
        <strong>Last updated:</strong>{" "}
        {currentMtime ? formatMaybeUnixTime(currentMtime) : "—"}
      </div>
    </div>
  );

  return (
    <SystemStateShell title="Infrastructure" actions={actions} meta={meta} error={err ? <>{err}</> : null}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "340px 1fr",
          gap: 12,
          flex: 1,
          minHeight: 0,
        }}
      >
        <div style={{ display: "grid", gap: 12, minHeight: 0 }}>
          <div
            style={{
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 12,
              background: "rgba(255,255,255,0.03)",
              padding: 12,
              display: "grid",
              gap: 10,
            }}
          >
            <div style={{ fontWeight: 800 }}>Create Infrastructure Asset</div>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.76 }}>Label</span>
              <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 12, opacity: 0.76 }}>Asset Type</span>
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
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 12, opacity: 0.76 }}>Provider</span>
                <input className="input" value={provider} onChange={(e) => setProvider(e.target.value)} />
              </label>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 12, opacity: 0.76 }}>Owning Org</span>
                <input className="input" value={owningOrg} onChange={(e) => setOwningOrg(e.target.value)} />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 12, opacity: 0.76 }}>Environment Scope</span>
                <select className="input" value={environmentScope} onChange={(e) => setEnvironmentScope(e.target.value)}>
                  <option value="local">local</option>
                  <option value="preview">preview</option>
                  <option value="production">production</option>
                  <option value="mixed">mixed</option>
                  <option value="other">other</option>
                </select>
              </label>
            </div>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.76 }}>Related Project Keys</span>
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

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.76 }}>Role</span>
              <textarea className="pasteArea" style={{ minHeight: 90 }} value={role} onChange={(e) => setRole(e.target.value)} />
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.76 }}>Canonical Domain</span>
              <input className="input" value={canonicalDomain} onChange={(e) => setCanonicalDomain(e.target.value)} />
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.76 }}>Primary Console URL</span>
              <input className="input" value={primaryConsoleUrl} onChange={(e) => setPrimaryConsoleUrl(e.target.value)} />
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.76 }}>Status Summary</span>
              <textarea className="pasteArea" style={{ minHeight: 70 }} value={statusSummary} onChange={(e) => setStatusSummary(e.target.value)} />
            </label>

            <button className="btn btnPrimary" onClick={() => void createAsset()} disabled={creating || loading}>
              {creating ? "Creating…" : "Create Asset"}
            </button>
          </div>

          <ArtifactListPanel
            title="Infrastructure Records"
            items={originRecords}
            currentPath={currentPath}
            emptyText="No governed infrastructure records yet."
            onSelect={(path) => void readPath(path)}
          />
        </div>

        <div style={{ minHeight: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          <div
            style={{
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 12,
              background: "rgba(255,255,255,0.03)",
              padding: 10,
              fontSize: 13,
              opacity: 0.86,
            }}
          >
            <strong>View:</strong> governed <code>00_origin.md</code> anchor for the selected infrastructure asset
          </div>

          <textarea
            className="pasteArea"
            value={currentText}
            onChange={(e) => setCurrentText(e.target.value)}
            placeholder="Selected infrastructure origin record will appear here…"
            spellCheck={false}
            style={{ flex: 1, minHeight: 0 }}
          />
        </div>
      </div>
    </SystemStateShell>
  );
}

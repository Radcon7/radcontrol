import { useEffect, useMemo, useState } from "react";
import type { AddProjectPayload } from "./types";
import { slugify, inferRepoPath, asPort, validateAdd } from "./helpers";

type Org = "radcon" | "radwolfe" | "labs" | "other";
type Kind = "nextjs" | "tauri" | "python" | "docs" | "static" | "other";

export function AddProjectModal({
  open,
  onClose,
  onCreate,
  defaultSuggestedPort,
  usedPorts,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (payload: AddProjectPayload) => Promise<void> | void;
  defaultSuggestedPort?: number;
  usedPorts?: Set<number>;
}) {
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [org, setOrg] = useState<Org>("radcon");
  const [repoPath, setRepoPath] = useState("");
  const [kind, setKind] = useState<Kind>("nextjs");
  const [port, setPort] = useState<string>(
    defaultSuggestedPort ? String(defaultSuggestedPort) : "",
  );
  const [url, setUrl] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset on open so it doesn't get "stuck" between uses.
  useEffect(() => {
    if (!open) return;
    setKey("");
    setLabel("");
    setOrg("radcon");
    setRepoPath("");
    setKind("nextjs");
    setPort(defaultSuggestedPort ? String(defaultSuggestedPort) : "");
    setUrl("");
    setErr(null);
    setSaving(false);
  }, [open, defaultSuggestedPort]);

  const keySlug = useMemo(() => slugify(key), [key]);

  function autoFillRepo() {
    const slug = slugify(key);
    const inferred = inferRepoPath(org, slug);
    setRepoPath(inferred);
  }

  const parsedPort = useMemo(() => {
    const t = port.trim();
    return t ? asPort(t) : undefined;
  }, [port]);

  const payload: AddProjectPayload = useMemo(
    () => ({
      key: keySlug,
      label: label.trim(),
      org,
      repoPath: repoPath.trim(),
      kind,
      port: parsedPort,
      url: url.trim() ? url.trim() : undefined,
    }),
    [keySlug, label, org, repoPath, kind, parsedPort, url],
  );

  const validationError = useMemo(() => {
    const ports = usedPorts ?? new Set<number>();
    return validateAdd(payload, ports);
  }, [payload, usedPorts]);

  if (!open) return null;

  async function submit() {
    const vErr = validationError;
    if (vErr) {
      setErr(vErr);
      return;
    }
    setErr(null);
    setSaving(true);
    try {
      await onCreate(payload);
      onClose();
    } catch (e: any) {
      setErr(
        typeof e?.message === "string" && e.message.trim()
          ? e.message
          : "Failed to create project.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="modalOverlay"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modalCard">
        <div className="modalHeader">
          <div className="modalTitle">Add Project</div>
          <button className="btn btnGhost" onClick={onClose} disabled={saving}>
            Close
          </button>
        </div>

        <div className="modalBody">
          <label>Project Key</label>
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="tbis"
            disabled={saving}
          />
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6 }}>
            Saved key: <code>{keySlug || "—"}</code>
          </div>

          <label style={{ marginTop: 12 }}>Display Name</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="The Biggest Internet Store"
            disabled={saving}
          />

          <label style={{ marginTop: 12 }}>Organization</label>
          <select
            value={org}
            onChange={(e) => setOrg(e.target.value as Org)}
            disabled={saving}
          >
            <option value="radcon">radcon</option>
            <option value="radwolfe">radwolfe</option>
            <option value="labs">labs</option>
            <option value="other">other</option>
          </select>

          <label style={{ marginTop: 12 }}>Repo Path</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={repoPath}
              onChange={(e) => setRepoPath(e.target.value)}
              placeholder="~/dev/rad-empire/..."
              disabled={saving}
              style={{ flex: 1 }}
            />
            <button
              className="btn btnGhost"
              onClick={autoFillRepo}
              disabled={saving || !keySlug}
              title="Infer repo path from org + key"
              type="button"
            >
              Auto
            </button>
          </div>

          <label style={{ marginTop: 12 }}>Kind</label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}
            disabled={saving}
          >
            <option value="nextjs">nextjs</option>
            <option value="tauri">tauri</option>
            <option value="python">python</option>
            <option value="docs">docs</option>
            <option value="static">static</option>
            <option value="other">other</option>
          </select>

          <label style={{ marginTop: 12 }}>Port</label>
          <input
            value={port}
            onChange={(e) => setPort(e.target.value)}
            placeholder="3000"
            inputMode="numeric"
            disabled={saving}
          />

          <label style={{ marginTop: 12 }}>URL</label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://localhost:3000"
            disabled={saving}
          />

          {err || validationError ? (
            <div
              style={{
                marginTop: 12,
                padding: "10px 12px",
                borderRadius: 10,
                background: "rgba(255,0,0,0.10)",
                border: "1px solid rgba(255,0,0,0.25)",
                fontSize: 13,
              }}
            >
              {err ?? validationError}
            </div>
          ) : null}
        </div>

        <div className="modalFooter">
          <button
            className="btn btnGhost"
            onClick={onClose}
            disabled={saving}
            type="button"
          >
            Cancel
          </button>

          <button
            className="btn btnPrimary"
            onClick={submit}
            disabled={saving || Boolean(validationError)}
            type="button"
          >
            {saving ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

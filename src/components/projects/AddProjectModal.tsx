import { useEffect, useMemo, useState } from "react";
import type { AddProjectPayload, ProjectKind, ProjectOrg } from "./types";
import { validateAdd } from "./helpers";

export function AddProjectModal({
  open,
  onClose,
  onCreate,
  defaultSuggestedPort,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (payload: AddProjectPayload) => Promise<void> | void;
  defaultSuggestedPort?: number;
}) {
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [org, setOrg] = useState<ProjectOrg>("radcon");
  const [kind, setKind] = useState<ProjectKind>("nextjs");
  const [repoPath, setRepoPath] = useState("");
  const [repoHint, setRepoHint] = useState("");
  const [portInput, setPortInput] = useState("");
  const [url, setUrl] = useState("");
  const [o2StartKey, setO2StartKey] = useState("");
  const [o2SnapshotKey, setO2SnapshotKey] = useState("");
  const [o2CommitKey, setO2CommitKey] = useState("");
  const [o2LabKey, setO2LabKey] = useState("");
  const [o2MapKey, setO2MapKey] = useState("");
  const [o2ProofPackKey, setO2ProofPackKey] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;

    setKey("");
    setLabel("");
    setOrg("radcon");
    setKind("nextjs");
    setRepoPath("");
    setRepoHint("");
    setPortInput(
      typeof defaultSuggestedPort === "number"
        ? String(defaultSuggestedPort)
        : "",
    );
    setUrl("");
    setO2StartKey("");
    setO2SnapshotKey("");
    setO2CommitKey("");
    setO2LabKey("");
    setO2MapKey("");
    setO2ProofPackKey("");
    setNotes("");
    setErr(null);
    setSaving(false);
  }, [open, defaultSuggestedPort]);

  const parsedPort = useMemo(() => {
    const trimmed = portInput.trim();
    if (!trimmed) return undefined;
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return undefined;
    return Math.trunc(n);
  }, [portInput]);

  const payload: AddProjectPayload = useMemo(
    () => ({
      key: key.trim(),
      label: label.trim(),
      org,
      kind,
      repoPath: repoPath.trim(),
      repoHint: repoHint.trim() || undefined,
      port: parsedPort,
      url: url.trim() || undefined,
      o2StartKey: o2StartKey.trim() || undefined,
      o2SnapshotKey: o2SnapshotKey.trim() || undefined,
      o2CommitKey: o2CommitKey.trim() || undefined,
      o2LabKey: o2LabKey.trim() || undefined,
      o2MapKey: o2MapKey.trim() || undefined,
      o2ProofPackKey: o2ProofPackKey.trim() || undefined,
      notes: notes.trim() || undefined,
    }),
    [
      key,
      label,
      org,
      kind,
      repoPath,
      repoHint,
      parsedPort,
      url,
      o2StartKey,
      o2SnapshotKey,
      o2CommitKey,
      o2LabKey,
      o2MapKey,
      o2ProofPackKey,
      notes,
    ],
  );

  const validation = useMemo(
    () =>
      validateAdd({
        org: payload.org,
        key: payload.key,
        port: payload.port,
        url: payload.url,
        repo: payload.repoPath,
      }),
    [payload],
  );

  const validationError = validation.ok ? null : validation.errors.join(" ");

  if (!open) return null;

  async function submit() {
    if (validationError) {
      setErr(validationError);
      return;
    }

    setErr(null);
    setSaving(true);
    try {
      await onCreate(payload);
      onClose();
    } catch (e: unknown) {
      const msg =
        e instanceof Error
          ? e.message
          : e && typeof e === "object" && "message" in e
            ? String((e as { message: unknown }).message ?? "")
            : "";

      setErr(
        typeof msg === "string" && msg.trim()
          ? msg
          : "Failed to create project payload.",
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
          <label>Key</label>
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="tbis"
            disabled={saving}
          />

          <label style={{ marginTop: 12 }}>Label</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="The Biggest Internet Store"
            disabled={saving}
          />

          <label style={{ marginTop: 12 }}>Org</label>
          <select
            value={org}
            onChange={(e) => setOrg(e.target.value as ProjectOrg)}
            disabled={saving}
          >
            <option value="radcon">radcon</option>
            <option value="radwolfe">radwolfe</option>
            <option value="labs">labs</option>
            <option value="other">other</option>
          </select>

          <label style={{ marginTop: 12 }}>Kind</label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as ProjectKind)}
            disabled={saving}
          >
            <option value="nextjs">nextjs</option>
            <option value="tauri">tauri</option>
            <option value="python">python</option>
            <option value="docs">docs</option>
            <option value="static">static</option>
            <option value="other">other</option>
          </select>

          <label style={{ marginTop: 12 }}>Repo Path</label>
          <input
            value={repoPath}
            onChange={(e) => setRepoPath(e.target.value)}
            placeholder="/home/chris/dev/rad-empire/radcon/dev/tbis"
            disabled={saving}
          />

          <label style={{ marginTop: 12 }}>Repo Hint (optional)</label>
          <input
            value={repoHint}
            onChange={(e) => setRepoHint(e.target.value)}
            placeholder="radcon/dev/tbis"
            disabled={saving}
          />

          <label style={{ marginTop: 12 }}>Port (optional)</label>
          <input
            value={portInput}
            onChange={(e) => setPortInput(e.target.value)}
            placeholder={
              typeof defaultSuggestedPort === "number"
                ? String(defaultSuggestedPort)
                : "1420"
            }
            disabled={saving}
          />

          <label style={{ marginTop: 12 }}>URL (optional)</label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://localhost:3000"
            disabled={saving}
          />

          <label style={{ marginTop: 12 }}>O2 Start Key (optional)</label>
          <input
            value={o2StartKey}
            onChange={(e) => setO2StartKey(e.target.value)}
            placeholder="tbis.dev"
            disabled={saving}
          />

          <label style={{ marginTop: 12 }}>O2 Snapshot Key (optional)</label>
          <input
            value={o2SnapshotKey}
            onChange={(e) => setO2SnapshotKey(e.target.value)}
            placeholder="tbis.snapshot"
            disabled={saving}
          />

          <label style={{ marginTop: 12 }}>O2 Commit Key (optional)</label>
          <input
            value={o2CommitKey}
            onChange={(e) => setO2CommitKey(e.target.value)}
            placeholder="tbis.commit"
            disabled={saving}
          />

          <label style={{ marginTop: 12 }}>O2 Lab Key (optional)</label>
          <input
            value={o2LabKey}
            onChange={(e) => setO2LabKey(e.target.value)}
            placeholder="tbis.lab"
            disabled={saving}
          />

          <label style={{ marginTop: 12 }}>O2 Map Key (optional)</label>
          <input
            value={o2MapKey}
            onChange={(e) => setO2MapKey(e.target.value)}
            placeholder="tbis.map"
            disabled={saving}
          />

          <label style={{ marginTop: 12 }}>O2 Proof Pack Key (optional)</label>
          <input
            value={o2ProofPackKey}
            onChange={(e) => setO2ProofPackKey(e.target.value)}
            placeholder="tbis.proofpack"
            disabled={saving}
          />

          <label style={{ marginTop: 12 }}>Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes about this project..."
            disabled={saving}
            rows={5}
            style={{ width: "100%", resize: "vertical" }}
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
            {saving ? "Creating…" : "Create Project"}
          </button>
        </div>
      </div>
    </div>
  );
}

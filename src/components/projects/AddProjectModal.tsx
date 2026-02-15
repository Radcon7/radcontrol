import { useState } from "react";
import type { AddProjectPayload } from "./types";
import { slugify, inferRepoPath, asPort } from "./helpers";

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
  const [org, setOrg] = useState<"radcon" | "radwolfe" | "labs" | "other">(
    "radcon",
  );
  const [repoPath, setRepoPath] = useState("");
  const [kind, setKind] = useState<
    "nextjs" | "tauri" | "python" | "docs" | "static" | "other"
  >("nextjs");
  const [port, setPort] = useState<string>(
    defaultSuggestedPort ? String(defaultSuggestedPort) : "",
  );
  const [url, setUrl] = useState("");

  if (!open) return null;

  function autoFillRepo() {
    const slug = slugify(key);
    const inferred = inferRepoPath(org, slug);
    setRepoPath(inferred);
  }

  async function submit() {
    const payload: AddProjectPayload = {
      key: slugify(key),
      label,
      org,
      repoPath,
      kind,
      port: port ? asPort(port) : undefined,
      url: url || undefined,
    };

    await onCreate(payload);
    onClose();
  }

  return (
    <div className="modalOverlay">
      <div className="modalCard">
        <div className="modalHeader">
          <div className="modalTitle">Add Project</div>
          <button className="btn btnGhost" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="modalBody">
          <label>Project Key</label>
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="tbis"
          />

          <label>Display Name</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="The Biggest Internet Store"
          />

          <label>Organization</label>
          <select value={org} onChange={(e) => setOrg(e.target.value as any)}>
            <option value="radcon">radcon</option>
            <option value="radwolfe">radwolfe</option>
            <option value="labs">labs</option>
            <option value="other">other</option>
          </select>

          <label>Repo Path</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={repoPath}
              onChange={(e) => setRepoPath(e.target.value)}
              placeholder="~/dev/rad-empire/..."
            />
            <button className="btn btnGhost" onClick={autoFillRepo}>
              Auto
            </button>
          </div>

          <label>Kind</label>
          <select value={kind} onChange={(e) => setKind(e.target.value as any)}>
            <option value="nextjs">nextjs</option>
            <option value="tauri">tauri</option>
            <option value="python">python</option>
            <option value="docs">docs</option>
            <option value="static">static</option>
            <option value="other">other</option>
          </select>

          <label>Port</label>
          <input
            value={port}
            onChange={(e) => setPort(e.target.value)}
            placeholder="3000"
          />

          <label>URL</label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://localhost:3000"
          />
        </div>

        <div className="modalFooter">
          <button className="btn btnPrimary" onClick={submit}>
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

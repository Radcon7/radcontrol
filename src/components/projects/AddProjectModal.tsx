import { useEffect, useMemo, useState } from "react";
import type { AddProjectPayload } from "./types";
import { slugify, validateAdd } from "./helpers";

export function AddProjectModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (payload: AddProjectPayload) => Promise<void> | void;
}) {
  const [slugInput, setSlugInput] = useState("");
  const [name, setName] = useState("");
  const [essay, setEssay] = useState("");
  const [templateHint, setTemplateHint] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset on open so it doesn't get "stuck" between uses.
  useEffect(() => {
    if (!open) return;
    setSlugInput("");
    setName("");
    setEssay("");
    setTemplateHint("");
    setErr(null);
    setSaving(false);
  }, [open]);

  const slug = useMemo(() => slugify(slugInput), [slugInput]);

  const payload: AddProjectPayload = useMemo(
    () => ({
      name: name.trim(),
      slug,
      essay: essay.trim(),
      templateHint: templateHint.trim() || undefined,
    }),
    [name, slug, essay, templateHint],
  );

  const validation = useMemo(
    () =>
      validateAdd({
        name: payload.name,
        slug: slugInput,
        essay: payload.essay,
        templateHint: payload.templateHint,
      }),
    [payload, slugInput],
  );
  const validationError = validation.ok ? null : validation.errors.join(" ");

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
          : "Failed to send project plan.",
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
          <label>Project Slug</label>
          <input
            value={slugInput}
            onChange={(e) => setSlugInput(e.target.value)}
            placeholder="tbis"
            disabled={saving}
          />
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6 }}>
            Encoded slug: <code>{slug || "—"}</code>
          </div>

          <label style={{ marginTop: 12 }}>Project Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="The Biggest Internet Store"
            disabled={saving}
          />

          <label style={{ marginTop: 12 }}>Template Hint (optional)</label>
          <select
            value={templateHint}
            onChange={(e) => setTemplateHint(e.target.value)}
            disabled={saving}
          >
            <option value="">(none)</option>
            <option value="nextjs">nextjs</option>
            <option value="tauri">tauri</option>
            <option value="python">python</option>
            <option value="static">static</option>
          </select>

          <label style={{ marginTop: 12 }}>Project Essay</label>
          <textarea
            value={essay}
            onChange={(e) => setEssay(e.target.value)}
            placeholder="Describe intent, scope, and constraints for O2 plan..."
            disabled={saving}
            rows={6}
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
            {saving ? "Sending…" : "Send Plan to O2"}
          </button>
        </div>
      </div>
    </div>
  );
}

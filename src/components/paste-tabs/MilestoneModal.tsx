import { useEffect, useState } from "react";
import type { NewMilestoneInput } from "./timelineLoader";

type Props = {
  open: boolean;
  busy?: boolean;
  onCancel: () => void;
  onCreate: (input: NewMilestoneInput) => Promise<void>;
};

export function MilestoneModal({ open, busy, onCancel, onCreate }: Props) {
  const [entryText, setEntryText] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;

    setEntryText("");
    setError("");
  }, [open]);

  if (!open) return null;

  async function handleSubmit() {
    setError("");

    const trimmedEntry = entryText.trim();

    if (!trimmedEntry) {
      setError("Entry text is required.");
      return;
    }

    const today = new Date();
    const yyyy = String(today.getFullYear());
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const autoDate = `${yyyy}-${mm}-${dd}`;

    try {
      await onCreate({
        title: trimmedEntry,
        date: autoDate,
        category: "",
        notes: trimmedEntry,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="modalOverlay" onClick={onCancel}>
      <div className="notesModalCard timelineModalCard" onClick={(event) => event.stopPropagation()}>
        <div className="notesModalHeader">
          <div className="notesModalTitle">Add Timeline Milestone</div>
        </div>

        <div className="notesModalBody">
          <label className="surfaceFormField">
            <span className="surfaceFormLabel">Timeline Entry</span>
            <textarea
              value={entryText}
              onChange={(e) => setEntryText(e.target.value)}
              placeholder="Describe what was going on..."
              className="pasteArea surfaceTextAreaLg"
            />
          </label>

          {error ? <div className="panelError timelineModalError">{error}</div> : null}

          <div className="timelineModalActions">
            <button className="btn btnGhost" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button className="btn btnPrimary" onClick={handleSubmit} disabled={busy}>
              {busy ? "Creating…" : "Create"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import type { NewMilestoneInput } from "./timelineLoader";
import { localEventDate, validEventDate } from "./timelineModel";

type Props = {
  open: boolean;
  busy?: boolean;
  onCancel: () => void;
  onCreate: (input: NewMilestoneInput) => Promise<void>;
};

export function MilestoneModal({ open, busy, onCancel, onCreate }: Props) {
  const [entryText, setEntryText] = useState("");
  const [eventDate, setEventDate] = useState(localEventDate);
  const [notes, setNotes] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;

    setEntryText("");
    setEventDate(localEventDate()); setNotes(""); setCategory("");
    setError("");
  }, [open]);

  if (!open) return null;

  async function handleSubmit() {
    setError("");

    const trimmedEntry = entryText.trim();

    if (!trimmedEntry) {
      setError("A milestone title is required.");
      return;
    }

    if (!validEventDate(eventDate)) { setError("Enter a valid event date."); return; }

    try {
      await onCreate({
        title: trimmedEntry,
        date: eventDate,
        category,
        notes,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="modalOverlay" onClick={() => !busy && onCancel()}>
      <div className="notesModalCard timelineModalCard" role="dialog" aria-modal="true" aria-labelledby="milestone-title" onClick={(event) => event.stopPropagation()}>
        <div className="notesModalHeader">
          <div className="notesModalTitle" id="milestone-title">Add Timeline Milestone</div>
        </div>

        <div className="notesModalBody">
          <label className="surfaceFormField">
            <span className="surfaceFormLabel">Milestone</span>
            <input
              value={entryText}
              onChange={(e) => setEntryText(e.target.value)}
              disabled={busy}
              className="input"
            />
          </label>
          <label className="surfaceFormField"><span className="surfaceFormLabel">Event date</span><input className="input" type="date" value={eventDate} disabled={busy} onChange={(event) => setEventDate(event.target.value)} /></label>
          <label className="surfaceFormField"><span className="surfaceFormLabel">Context</span><input className="input" value={category} disabled={busy} onChange={(event) => setCategory(event.target.value)} /></label>
          <label className="surfaceFormField"><span className="surfaceFormLabel">Details</span><textarea className="pasteArea todoDetailText" value={notes} disabled={busy} onChange={(event) => setNotes(event.target.value)} /></label>

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

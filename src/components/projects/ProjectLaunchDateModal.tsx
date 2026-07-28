type Props = {
  open: boolean;
  value: string;
  currentValue: string;
  busy: boolean;
  onClose: () => void;
  onValueChange: (value: string) => void;
  onSave: () => void;
};

export function ProjectLaunchDateModal({
  open,
  value,
  currentValue,
  busy,
  onClose,
  onValueChange,
  onSave,
}: Props) {
  if (!open) return null;

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="notesModalCard" onClick={(event) => event.stopPropagation()}>
        <div className="notesModalHeader">
          <div className="notesModalTitle">Edit Launch Date</div>
          <button className="btn btnGhost" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="notesModalBody">
          <label className="surfaceFormField">
            <span className="surfaceFormLabel">Project launch date</span>
            <input
              className="input"
              type="date"
              value={value}
              onChange={(event) => onValueChange(event.target.value)}
            />
          </label>
          <div className="surfaceSummaryHeader">
            <div className="surfaceMutedSmall">
              Save updates the governed project record through O2.
            </div>
            <button
              className="btn btnPrimary btnCompact"
              disabled={!value || value === currentValue || busy}
              onClick={onSave}
            >
              Save Date
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

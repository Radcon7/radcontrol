import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ProjectRow } from "./types";

type Props = {
  open: boolean;
  project: ProjectRow | null;
  busy: boolean;
  message: string;
  hasCurrentLab: boolean;
  recommendedAction:
    | "launch_existing_lab"
    | "start_first_lab_flow"
    | "blocked"
    | null;
  onClose: () => void;
  onPrimaryAction: () => void;
  onDelete: () => void;
};

export function ProjectLabsModal({
  open,
  project,
  busy,
  message,
  hasCurrentLab,
  recommendedAction,
  onClose,
  onPrimaryAction,
  onDelete,
}: Props) {
  const [deleteConfirmClick, setDeleteConfirmClick] = useState(false);

  useEffect(() => {
    setDeleteConfirmClick(false);
  }, [open, project?.key, recommendedAction]);

  if (!open || !project) return null;

  const isHasLabState =
    recommendedAction === "launch_existing_lab" || hasCurrentLab;
  const isNoLabState = recommendedAction === "start_first_lab_flow";
  const primaryLabel = isHasLabState ? "Launch Lab" : "Start Formation";
  const primaryDisabled = busy || (!isHasLabState && !isNoLabState);
  const deleteEnabled = isHasLabState && !busy;

  return createPortal(
    <div
      className="modalOverlay"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modalCard projectLabsModalCard" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <div className="modalTitle">Labs</div>
          <button className="btn btnGhost" onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>

        <div className="modalBody modalBodySingle">
          <div className="projectLabsModalSection">
            <div className="projectLabsModalMeta">
              {project.label} ({project.key})
            </div>
            <div className="projectLabsModalTruth">{message}</div>
          </div>

          {(isHasLabState || isNoLabState) && (
            <div className="projectLabsModalActions">
              <button
                className="btn btnPrimary"
                type="button"
                onClick={onPrimaryAction}
                disabled={primaryDisabled}
              >
                {primaryLabel}
              </button>

              {isHasLabState && (
                <button
                  className="btn btnDanger"
                  type="button"
                  onClick={() => {
                    if (!deleteConfirmClick) {
                      setDeleteConfirmClick(true);
                      return;
                    }
                    onDelete();
                  }}
                  disabled={!deleteEnabled}
                  title="Delete current lab"
                >
                  {deleteConfirmClick ? "Confirm Delete Lab" : "Delete Lab"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

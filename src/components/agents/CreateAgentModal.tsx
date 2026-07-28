import type { ProjectRow } from "../projects/types";
import type { AgentProfileDraft } from "./agentModel";

type Props = {
  draft: AgentProfileDraft;
  projects: ProjectRow[];
  creating: boolean;
  loading: boolean;
  onClose: () => void;
  onDraftChange: (patch: Partial<AgentProfileDraft>) => void;
  onCreate: () => Promise<void> | void;
};

export function CreateAgentModal({
  draft,
  projects,
  creating,
  loading,
  onClose,
  onDraftChange,
  onCreate,
}: Props) {
  return (
    <div className="modalOverlay" onClick={onClose}>
      <div
        className="modalCard infrastructureModalCard"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modalHeader">
          <div className="modalTitle">New Agent</div>
          <button
            className="btn btnGhost"
            onClick={onClose}
            disabled={creating}
          >
            Close
          </button>
        </div>

        <div className="modalBody modalBodySingle">
          <div className="surfaceFormGrid">
            <label className="surfaceFormField">
              <span className="surfaceFormLabel">Name</span>
              <input
                className="input"
                data-testid="modal-agent-name"
                value={draft.name}
                onChange={(event) => onDraftChange({ name: event.target.value })}
              />
            </label>

            <div className="surfaceFormRow2">
              <label className="surfaceFormField">
                <span className="surfaceFormLabel">Handle</span>
                <input
                  className="input"
                  data-testid="modal-agent-handle"
                  value={draft.handle}
                  onChange={(event) =>
                    onDraftChange({ handle: event.target.value })
                  }
                />
              </label>
              <label className="surfaceFormField">
                <span className="surfaceFormLabel">Agent Type</span>
                <div className="surfaceSelectWrap">
                  <select
                    className="input"
                    value={draft.agentType}
                    onChange={(event) =>
                      onDraftChange({ agentType: event.target.value })
                    }
                  >
                    <option value="codex">codex</option>
                    <option value="orion">orion</option>
                    <option value="other">other</option>
                  </select>
                </div>
              </label>
            </div>

            <label className="surfaceFormField">
              <span className="surfaceFormLabel">Mission</span>
              <textarea
                className="pasteArea surfaceTextAreaMd"
                value={draft.mission}
                onChange={(event) =>
                  onDraftChange({ mission: event.target.value })
                }
              />
            </label>

            <label className="surfaceFormField">
              <span className="surfaceFormLabel">Role Summary</span>
              <textarea
                className="pasteArea surfaceTextAreaMd"
                value={draft.roleSummary}
                onChange={(event) =>
                  onDraftChange({ roleSummary: event.target.value })
                }
              />
            </label>

            <label className="surfaceFormField">
              <span className="surfaceFormLabel">Strengths</span>
              <textarea
                className="pasteArea surfaceTextAreaMd"
                value={draft.strengthsText}
                onChange={(event) =>
                  onDraftChange({ strengthsText: event.target.value })
                }
              />
            </label>

            <label className="surfaceFormField">
              <span className="surfaceFormLabel">Expected Outputs</span>
              <textarea
                className="pasteArea surfaceTextAreaMd"
                value={draft.outputsText}
                onChange={(event) =>
                  onDraftChange({ outputsText: event.target.value })
                }
              />
            </label>

            <label className="surfaceFormField">
              <span className="surfaceFormLabel">Assigned Projects</span>
              <input
                className="input"
                value={draft.assignedProjectsText}
                onChange={(event) =>
                  onDraftChange({ assignedProjectsText: event.target.value })
                }
              />
            </label>

            <div className="surfaceFormRow2">
              <label className="surfaceFormField">
                <span className="surfaceFormLabel">Default Target Type</span>
                <div className="surfaceSelectWrap">
                  <select
                    className="input"
                    value={draft.defaultTargetType}
                    onChange={(event) =>
                      onDraftChange({ defaultTargetType: event.target.value })
                    }
                  >
                    <option value="project">project</option>
                    <option value="infrastructure_asset">
                      infrastructure_asset
                    </option>
                    <option value="empire">empire</option>
                    <option value="other">other</option>
                  </select>
                </div>
              </label>
              <label className="surfaceFormField">
                <span className="surfaceFormLabel">Default Target Key</span>
                <input
                  className="input"
                  list="agent-profile-target-keys"
                  value={draft.defaultTargetKey}
                  onChange={(event) =>
                    onDraftChange({ defaultTargetKey: event.target.value })
                  }
                />
                <datalist id="agent-profile-target-keys">
                  {projects.map((project) => (
                    <option key={project.key} value={project.key} />
                  ))}
                </datalist>
              </label>
            </div>

            <label className="surfaceFormField">
              <span className="surfaceFormLabel">Default Task</span>
              <textarea
                className="pasteArea surfaceTextAreaLg"
                value={draft.defaultTask}
                onChange={(event) =>
                  onDraftChange({ defaultTask: event.target.value })
                }
              />
            </label>

            <div className="surfaceFormRow2">
              <label className="surfaceFormField">
                <span className="surfaceFormLabel">Default Mode</span>
                <div className="surfaceSelectWrap">
                  <select
                    className="input"
                    value={draft.defaultMode}
                    onChange={(event) =>
                      onDraftChange({ defaultMode: event.target.value })
                    }
                  >
                    <option value="read-only">read-only</option>
                    <option value="auto">auto</option>
                    <option value="governed-write">governed-write</option>
                    <option value="other">other</option>
                  </select>
                </div>
              </label>
              <label className="surfaceFormField">
                <span className="surfaceFormLabel">
                  Approval Requirement
                </span>
                <div className="surfaceSelectWrap">
                  <select
                    className="input"
                    value={draft.approvalRequirement}
                    onChange={(event) =>
                      onDraftChange({
                        approvalRequirement: event.target.value,
                      })
                    }
                  >
                    <option value="none">none</option>
                    <option value="required">required</option>
                    <option value="conditional">conditional</option>
                  </select>
                </div>
              </label>
            </div>

            <label className="surfaceFormField">
              <span className="surfaceFormLabel">Operator Intent</span>
              <textarea
                className="pasteArea surfaceTextAreaMd"
                value={draft.operatorIntent}
                onChange={(event) =>
                  onDraftChange({ operatorIntent: event.target.value })
                }
              />
            </label>

            <label className="surfaceFormField">
              <span className="surfaceFormLabel">Context Artifact</span>
              <input
                className="input"
                value={draft.contextArtifact}
                onChange={(event) =>
                  onDraftChange({ contextArtifact: event.target.value })
                }
              />
            </label>

            <label className="surfaceFormField">
              <span className="surfaceFormLabel">Notes</span>
              <textarea
                className="pasteArea surfaceTextAreaMd"
                value={draft.notes}
                onChange={(event) =>
                  onDraftChange({ notes: event.target.value })
                }
              />
            </label>

            <div className="surfaceSummaryHeader">
              <div className="surfaceMutedSmall">
                Create governed agent profiles here. Concurrent agent execution
                and run history are handled elsewhere.
              </div>
              <button
                className="btn btnPrimary"
                data-testid="modal-create-agent"
                onClick={() => void onCreate()}
                disabled={creating || loading}
              >
                {creating ? "Saving..." : "Create Agent"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import type { ProjectRow } from "../projects/types";
import {
  ASSET_TYPE_OPTIONS,
  ENVIRONMENT_SCOPE_OPTIONS,
  type InfrastructureDraft,
  type InfrastructureProfile,
} from "./infrastructureModel";

type Props = {
  draft: InfrastructureDraft;
  profiles: InfrastructureProfile[];
  projects: ProjectRow[];
  creating: boolean;
  loading: boolean;
  onClose: () => void;
  onApplyTemplate: (templateId: string) => void;
  onDraftChange: (patch: Partial<InfrastructureDraft>) => void;
  onCreate: () => Promise<void> | void;
};

export function CreateInfrastructureModal({
  draft,
  profiles,
  projects,
  creating,
  loading,
  onClose,
  onApplyTemplate,
  onDraftChange,
  onCreate,
}: Props) {
  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalCard infrastructureModalCard" onClick={(event) => event.stopPropagation()}>
        <div className="modalHeader">
          <div className="modalTitle">New Infrastructure</div>
          <button className="btn btnGhost" onClick={onClose} disabled={creating}>Close</button>
        </div>
        <div className="modalBody modalBodySingle">
          <div className="surfaceFormGrid">
            <label className="surfaceFormField">
              <span className="surfaceFormLabel">Starter Preset</span>
              <div className="surfaceSelectWrap">
                <select className="input" value={draft.templateId} onChange={(event) => onApplyTemplate(event.target.value)}>
                  {profiles.map((profile) => <option key={profile.key} value={profile.key}>{profile.label}</option>)}
                </select>
              </div>
            </label>
            <label className="surfaceFormField">
              <span className="surfaceFormLabel">Label</span>
              <input
                className="input"
                data-testid="modal-infrastructure-label"
                value={draft.label}
                onChange={(event) => onDraftChange({ label: event.target.value })}
              />
            </label>
            <div className="surfaceFormRow2">
              <label className="surfaceFormField">
                <span className="surfaceFormLabel">Infrastructure Kind</span>
                <div className="surfaceSelectWrap">
                  <select className="input" value={draft.assetType} onChange={(event) => onDraftChange({ assetType: event.target.value })}>
                    {ASSET_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </div>
              </label>
              <label className="surfaceFormField">
                <span className="surfaceFormLabel">Provider</span>
                <input className="input" value={draft.provider} onChange={(event) => onDraftChange({ provider: event.target.value })} />
              </label>
            </div>
            <div className="surfaceFormRow2">
              <label className="surfaceFormField">
                <span className="surfaceFormLabel">Owning Org</span>
                <input className="input" value={draft.owningOrg} onChange={(event) => onDraftChange({ owningOrg: event.target.value })} />
              </label>
              <label className="surfaceFormField">
                <span className="surfaceFormLabel">Coverage Scope</span>
                <div className="surfaceSelectWrap">
                  <select className="input" value={draft.environmentScope} onChange={(event) => onDraftChange({ environmentScope: event.target.value })}>
                    {ENVIRONMENT_SCOPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </div>
              </label>
            </div>
            <label className="surfaceFormField">
              <span className="surfaceFormLabel">Related Project Keys</span>
              <input className="input" list="infrastructure-project-keys" value={draft.relatedProjectKeys} onChange={(event) => onDraftChange({ relatedProjectKeys: event.target.value })} />
              <datalist id="infrastructure-project-keys">{projects.map((project) => <option key={project.key} value={project.key} />)}</datalist>
            </label>
            <label className="surfaceFormField">
              <span className="surfaceFormLabel">Operational Focus</span>
              <textarea className="pasteArea surfaceTextAreaLg" value={draft.role} onChange={(event) => onDraftChange({ role: event.target.value })} />
            </label>
            <label className="surfaceFormField">
              <span className="surfaceFormLabel">Primary Domain / Identifier</span>
              <input className="input" value={draft.canonicalDomain} onChange={(event) => onDraftChange({ canonicalDomain: event.target.value })} />
            </label>
            <label className="surfaceFormField">
              <span className="surfaceFormLabel">Primary Console URL</span>
              <input className="input" value={draft.primaryConsoleUrl} onChange={(event) => onDraftChange({ primaryConsoleUrl: event.target.value })} />
            </label>
            <label className="surfaceFormField">
              <span className="surfaceFormLabel">Status Summary</span>
              <textarea className="pasteArea surfaceTextAreaMd" value={draft.statusSummary} onChange={(event) => onDraftChange({ statusSummary: event.target.value })} />
            </label>
            <div className="surfaceSummaryHeader">
              <div className="surfaceMutedSmall">Creates a governed infrastructure record under O2 while keeping the infrastructure index centered on platforms and providers.</div>
              <button
                className="btn btnPrimary"
                data-testid="modal-create-infrastructure"
                onClick={() => void onCreate()}
                disabled={creating || loading}
              >
                {creating ? "Creating..." : "Create Infrastructure"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

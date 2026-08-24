import { useCallback, useEffect, useRef, useState } from "react";
import { DocumentLibraryPanel } from "./DocumentLibraryPanel";
import { PortfolioBlueprint, type LegalOperatorView } from "./PortfolioBlueprint";

type Props = {
  busy?: boolean;
  registerBeforeTabChangeSaver?: (fn: (() => Promise<boolean>) | null) => void;
};

type LegalModeConfig = {
  key: LegalOperatorView;
  label: string;
};

type ArchiveKey = "legal_notes" | "legal_documents" | "legal_entity_structure";

type ArchiveConfig = {
  key: ArchiveKey;
  label: string;
  title: string;
  description: string;
  placeholder: string;
};

const MODE_CONFIGS: LegalModeConfig[] = [
  { key: "structure", label: "Structure" },
  { key: "formation", label: "Formation" },
  { key: "addresses", label: "Addresses & Agent" },
  { key: "brands", label: "Brands & Ventures" },
  { key: "accounts", label: "Business Accounts" },
  { key: "documents", label: "Documents & Compliance" },
];

const ARCHIVES: ArchiveConfig[] = [
  {
    key: "legal_notes",
    label: "Legal working notes",
    title: "Legal Working Notes",
    description: "Editable governed notes for source mapping, decisions, and follow-up.",
    placeholder: "Write or edit governed legal working notes here…",
  },
  {
    key: "legal_documents",
    label: "Imported documents",
    title: "Imported Legal Documents",
    description: "Legacy drafts and reference material. Verify authority before relying on any record.",
    placeholder: "Imported and governed legal documents appear here…",
  },
  {
    key: "legal_entity_structure",
    label: "Historical structures",
    title: "Historical Structure Drawings",
    description: "Superseded diagrams retained as historical evidence, not current ownership truth.",
    placeholder: "Historical entity-structure drawings and notes appear here…",
  },
];

export function LegalHubTab({ busy, registerBeforeTabChangeSaver }: Props) {
  const [mode, setMode] = useState<LegalOperatorView>("structure");
  const [archive, setArchive] = useState<ArchiveKey | null>(null);
  const saverRef = useRef<(() => Promise<boolean>) | null>(null);

  const registerModeSaver = useCallback(
    (fn: (() => Promise<boolean>) | null) => {
      saverRef.current = fn;
      registerBeforeTabChangeSaver?.(fn);
    },
    [registerBeforeTabChangeSaver],
  );

  useEffect(() => {
    registerBeforeTabChangeSaver?.(saverRef.current);
    return () => registerBeforeTabChangeSaver?.(null);
  }, [registerBeforeTabChangeSaver]);

  async function canLeaveCurrentView(): Promise<boolean> {
    const saver = saverRef.current;
    if (!saver) return true;
    try {
      return await saver();
    } catch {
      return false;
    }
  }

  async function requestModeChange(nextMode: LegalOperatorView): Promise<void> {
    if (nextMode === mode) return;
    if (!(await canLeaveCurrentView())) return;
    setArchive(null);
    setMode(nextMode);
  }

  async function requestArchiveChange(nextArchive: ArchiveKey | null): Promise<void> {
    if (nextArchive === archive) return;
    if (!(await canLeaveCurrentView())) return;
    setArchive(nextArchive);
  }

  const activeArchive = ARCHIVES.find((item) => item.key === archive) ?? null;

  return (
    <section className="workspaceHubWrap legalHubWrap">
      <div className="workspaceModeRow legalModeRow" aria-label="Legal workspace views">
        {MODE_CONFIGS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`workspaceModeButton ${mode === item.key ? "workspaceModeButtonActive" : ""}`}
            onClick={() => void requestModeChange(item.key)}
            data-testid={`legal-mode-${item.key}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="workspaceHubBody legalHubBody">
        <PortfolioBlueprint view={mode} />
        {mode === "documents" ? (
          <section className="legalArchiveWorkspace" data-testid="legal-governed-archives">
            <header>
              <div><span>GOVERNED ARCHIVES</span><strong>Existing records remain available without driving current structure truth.</strong></div>
              {archive ? <button className="btn btnGhost btnCompact" type="button" onClick={() => void requestArchiveChange(null)}>Close archive</button> : null}
            </header>
            <div className="legalArchiveChoices">
              {ARCHIVES.map((item) => (
                <button key={item.key} type="button" className={archive === item.key ? "legalArchiveChoice legalArchiveChoiceActive" : "legalArchiveChoice"} onClick={() => void requestArchiveChange(item.key)}>
                  <strong>{item.label}</strong><span>{item.description}</span>
                </button>
              ))}
            </div>
            {activeArchive ? (
              <div className="legalArchivePanel">
                <DocumentLibraryPanel
                  tabKey={activeArchive.key}
                  title={activeArchive.title}
                  placeholder={activeArchive.placeholder}
                  busy={busy}
                  registerBeforeTabChangeSaver={registerModeSaver}
                />
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </section>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { DocumentLibraryPanel } from "./DocumentLibraryPanel";
import { PortfolioBlueprint } from "./PortfolioBlueprint";

type LegalMode =
  | "portfolio_blueprint"
  | "legal_notes"
  | "legal_documents"
  | "legal_entity_structure";

type Props = {
  busy?: boolean;
  registerBeforeTabChangeSaver?: (fn: (() => Promise<boolean>) | null) => void;
};

type LibraryLegalModeConfig = {
  key: Exclude<LegalMode, "portfolio_blueprint">;
  label: string;
  title: string;
  placeholder: string;
};

const MODE_CONFIGS: Array<
  | LibraryLegalModeConfig
  | { key: "portfolio_blueprint"; label: string }
> = [
  {
    key: "portfolio_blueprint",
    label: "Portfolio Blueprint",
  },
  {
    key: "legal_notes",
    label: "Legal Notes",
    title: "Legal Notes",
    placeholder: "Write or edit governed legal working notes here…",
  },
  {
    key: "legal_documents",
    label: "Legal Documents",
    title: "Legal Documents",
    placeholder: "Imported and governed legal documents appear here…",
  },
  {
    key: "legal_entity_structure",
    label: "Legal Entity Structure Drawing",
    title: "Legal Entity Structure Drawing",
    placeholder: "Rough entity-structure drawings and legal-structure notes appear here…",
  },
];

function libraryConfigFor(mode: LibraryLegalModeConfig["key"]): LibraryLegalModeConfig {
  const found = MODE_CONFIGS.find((item) => item.key === mode);
  if (!found || found.key === "portfolio_blueprint") {
    throw new Error(`Missing legal mode config for ${mode}`);
  }
  return found;
}

export function LegalHubTab({ busy, registerBeforeTabChangeSaver }: Props) {
  const [mode, setMode] = useState<LegalMode>("portfolio_blueprint");
  const saverRef = useRef<(() => Promise<boolean>) | null>(null);
  const activeLibraryConfig =
    mode === "portfolio_blueprint" ? null : libraryConfigFor(mode);

  const registerModeSaver = useCallback(
    (fn: (() => Promise<boolean>) | null) => {
      saverRef.current = fn;
      registerBeforeTabChangeSaver?.(fn);
    },
    [registerBeforeTabChangeSaver],
  );

  useEffect(() => {
    registerBeforeTabChangeSaver?.(saverRef.current);
    return () => {
      registerBeforeTabChangeSaver?.(null);
    };
  }, [registerBeforeTabChangeSaver]);

  async function requestModeChange(nextMode: LegalMode): Promise<void> {
    if (nextMode === mode) return;

    const saver = saverRef.current;
    if (saver) {
      try {
        const ok = await saver();
        if (!ok) return;
      } catch {
        return;
      }
    }

    setMode(nextMode);
  }

  return (
    <section className="workspaceHubWrap">
      <div className="workspaceModeRow">
        {MODE_CONFIGS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`workspaceModeButton ${mode === item.key ? "workspaceModeButtonActive" : ""}`}
            onClick={() => void requestModeChange(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="workspaceHubBody">
        {mode === "portfolio_blueprint" ? (
          <PortfolioBlueprint />
        ) : (
          <DocumentLibraryPanel
            tabKey={activeLibraryConfig!.key}
            title={activeLibraryConfig!.title}
            placeholder={activeLibraryConfig!.placeholder}
            busy={busy}
            registerBeforeTabChangeSaver={registerModeSaver}
          />
        )}
      </div>
    </section>
  );
}

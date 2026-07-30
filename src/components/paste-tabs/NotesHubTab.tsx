import { useCallback, useEffect, useRef, useState } from "react";
import { DocumentLibraryPanel } from "./DocumentLibraryPanel";
import { TimelineTab } from "./TimelineTab";

type NotesMode = "notes" | "timeline" | "empire_blueprint";

type Props = {
  busy?: boolean;
  registerBeforeTabChangeSaver?: (fn: (() => Promise<boolean>) | null) => void;
};

type LibraryModeConfig = {
  key: Extract<NotesMode, "notes" | "empire_blueprint">;
  label: string;
  title: string;
  placeholder: string;
};

const MODE_CONFIGS: Array<
  | LibraryModeConfig
  | {
      key: "timeline";
      label: string;
    }
> = [
  {
    key: "notes",
    label: "Notes",
    title: "Notes",
    placeholder: "Write or edit general notes here…",
  },
  {
    key: "timeline",
    label: "Timeline",
  },
  {
    key: "empire_blueprint",
    label: "Empire Blueprint",
    title: "Empire Blueprint",
    placeholder: "Write or edit empire blueprint notes here…",
  },
];

function libraryConfigFor(mode: LibraryModeConfig["key"]): LibraryModeConfig {
  const found = MODE_CONFIGS.find((item) => item.key === mode);
  if (!found || found.key === "timeline") {
    throw new Error(`Missing notes mode config for ${mode}`);
  }
  return found;
}

export function NotesHubTab({ busy, registerBeforeTabChangeSaver }: Props) {
  const [mode, setMode] = useState<NotesMode>("notes");
  const saverRef = useRef<(() => Promise<boolean>) | null>(null);
  const activeLibraryConfig = mode === "timeline" ? null : libraryConfigFor(mode);

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

  async function requestModeChange(nextMode: NotesMode): Promise<void> {
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
        {mode === "timeline" ? (
          <TimelineTab />
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

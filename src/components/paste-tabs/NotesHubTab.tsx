import { useCallback, useEffect, useRef, useState } from "react";
import { TimelineTab } from "./TimelineTab";
import { EmpireTodoWorkspace } from "../notes/EmpireTodoWorkspace";
import { O2KnowledgeWorkspace } from "../notes/O2KnowledgeWorkspace";
import { MyNotesScratchpad } from "../notes/MyNotesScratchpad";
import { BlueprintWorkspace } from "../notes/BlueprintWorkspace";

type NotesMode = "notes" | "empire_todo" | "timeline" | "empire_blueprint" | "o2_knowledge";

type Props = {
  busy?: boolean;
  registerBeforeTabChangeSaver?: (fn: (() => Promise<boolean>) | null) => void;
};

const MODE_CONFIGS: Array<
  {
      key: NotesMode;
      label: string;
    }
> = [
  {
    key: "empire_todo",
    label: "Empire To-Do",
  },
  {
    key: "timeline",
    label: "Timeline",
  },
  { key: "notes", label: "My Notes" },
  { key: "empire_blueprint", label: "Empire Blueprint" },
  {
    key: "o2_knowledge",
    label: "O2 Knowledge",
  },
];

export function NotesHubTab({ busy, registerBeforeTabChangeSaver }: Props) {
  const [mode, setMode] = useState<NotesMode>("notes");
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
            data-testid={`notes-mode-${item.key}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="workspaceHubBody">
        {mode === "timeline" ? (
          <TimelineTab />
        ) : mode === "o2_knowledge" ? (
          <O2KnowledgeWorkspace />
        ) : mode === "empire_todo" ? (
          <EmpireTodoWorkspace
            busy={busy}
            registerBeforeTabChangeSaver={registerModeSaver}
          />
        ) : mode === "notes" ? <MyNotesScratchpad registerBeforeTabChangeSaver={registerModeSaver} /> : <BlueprintWorkspace registerBeforeTabChangeSaver={registerModeSaver} />}
      </div>
    </section>
  );
}

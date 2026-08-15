import { useCallback, useEffect, useRef, useState } from "react";
import { EmpireOperationsWorkspace } from "./EmpireOperationsWorkspace";
import { SentinelTab } from "../sentinel/SentinelTab";

type SecurityMode = "sentinel" | "empire_operations";

type Props = {
  registerBeforeTabChangeSaver?: (fn: (() => Promise<boolean>) | null) => void;
};

const SECURITY_MODES: Array<{ key: SecurityMode; label: string }> = [
  { key: "sentinel", label: "Radcon Sentinel" },
  { key: "empire_operations", label: "Empire Operations" },
];

export function SecurityTab({ registerBeforeTabChangeSaver }: Props) {
  const [mode, setMode] = useState<SecurityMode>("sentinel");
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

  async function requestModeChange(nextMode: SecurityMode): Promise<void> {
    if (nextMode === mode) return;
    if (saverRef.current && !(await saverRef.current())) return;
    setMode(nextMode);
  }

  return (
    <section className="workspaceHubWrap" data-testid="security-workspace">
      <div className="workspaceModeRow" role="tablist" aria-label="Security workspaces">
        {SECURITY_MODES.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`workspaceModeButton ${mode === item.key ? "workspaceModeButtonActive" : ""}`}
            onClick={() => void requestModeChange(item.key)}
            data-testid={`security-mode-${item.key}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="workspaceHubBody">
        {mode === "sentinel" ? (
          <SentinelTab registerBeforeTabChangeSaver={registerModeSaver} />
        ) : (
          <EmpireOperationsWorkspace />
        )}
      </div>
    </section>
  );
}

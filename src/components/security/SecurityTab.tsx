import { useCallback, useEffect, useRef, useState } from "react";
import { EmpireOperationsWorkspace } from "./EmpireOperationsWorkspace";
import { SentinelTab } from "../sentinel/SentinelTab";
import { SecurityGuardianTab } from "../sentinel/SecurityGuardianTab";

type SecurityMode = "sentinel" | "empire_operations" | "security_guardian";

const SECURITY_MODE_STORAGE_KEY = "radcontrol.security.mode";

type Props = {
  registerBeforeTabChangeSaver?: (fn: (() => Promise<boolean>) | null) => void;
};

const SECURITY_MODES: Array<{ key: SecurityMode; label: string }> = [
  { key: "sentinel", label: "Radcon Sentinel" },
  { key: "empire_operations", label: "Empire Operations" },
  { key: "security_guardian", label: "Security Guardian" },
];

function initialSecurityMode(): SecurityMode {
  try {
    const stored = window.sessionStorage.getItem(SECURITY_MODE_STORAGE_KEY);
    if (SECURITY_MODES.some((item) => item.key === stored)) return stored as SecurityMode;
  } catch {
    // Session state is a convenience; an unavailable store must not block Security.
  }
  return "sentinel";
}

export function SecurityTab({ registerBeforeTabChangeSaver }: Props) {
  const [mode, setMode] = useState<SecurityMode>(initialSecurityMode);
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

  useEffect(() => {
    try {
      window.sessionStorage.setItem(SECURITY_MODE_STORAGE_KEY, mode);
    } catch {
      // Keep the active in-memory mode when session storage is unavailable.
    }
  }, [mode]);

  async function requestModeChange(nextMode: SecurityMode): Promise<void> {
    if (nextMode === mode) return;
    if (saverRef.current && !(await saverRef.current())) return;
    setMode(nextMode);
  }

  return (
    <section className="workspaceHubWrap securityControlRoom" data-testid="security-workspace">
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
        ) : mode === "empire_operations" ? (
          <EmpireOperationsWorkspace />
        ) : (
          <SecurityGuardianTab />
        )}
      </div>
    </section>
  );
}

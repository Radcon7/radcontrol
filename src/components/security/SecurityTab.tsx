import { useEffect, useState } from "react";
import { EmpireOperationsWorkspace } from "./EmpireOperationsWorkspace";
import { SentinelTab } from "../sentinel/SentinelTab";
import { SecurityGuardianTab } from "../sentinel/SecurityGuardianTab";

type SecurityMode = "sentinel" | "empire_operations" | "security_guardian";

const SECURITY_MODE_STORAGE_KEY = "radcontrol.security.mode";

type Props = {
  registerBeforeTabChangeSaver?: (fn: (() => Promise<boolean>) | null) => void;
};

const SECURITY_MODES: Array<{ key: SecurityMode; label: string; description: string }> = [
  { key: "sentinel", label: "Radcon Sentinel", description: "This computer — health, loud fans, resources, services and maintenance." },
  { key: "empire_operations", label: "Empire Operations", description: "Development-system integrity — O2/RadControl pair, repositories, release, audit and reports." },
  { key: "security_guardian", label: "Security Guardian", description: "Online technology estate — websites, apps, providers and connected security coverage." },
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

  useEffect(() => {
    registerBeforeTabChangeSaver?.(null);
    return () => registerBeforeTabChangeSaver?.(null);
  }, [registerBeforeTabChangeSaver]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(SECURITY_MODE_STORAGE_KEY, mode);
    } catch {
      // Keep the active in-memory mode when session storage is unavailable.
    }
  }, [mode]);

  function requestModeChange(nextMode: SecurityMode): void {
    if (nextMode === mode) return;
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
            onClick={() => requestModeChange(item.key)}
            role="tab"
            aria-selected={mode === item.key}
            data-testid={`security-mode-${item.key}`}
          >
            <strong>{item.label}</strong>
            <small>{item.description}</small>
          </button>
        ))}
      </div>

      <div className="workspaceHubBody">
        {mode === "sentinel" ? (
          <SentinelTab />
        ) : mode === "empire_operations" ? (
          <EmpireOperationsWorkspace />
        ) : (
          <SecurityGuardianTab />
        )}
      </div>
    </section>
  );
}

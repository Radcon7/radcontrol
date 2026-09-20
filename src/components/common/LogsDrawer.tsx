import { useState } from "react";
import { logStatus } from "./logStatus";

export function LogsDrawer({ log, busy, onCopy, onClear }: { log: string; busy: boolean; onCopy: (text: string) => void; onClear: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const status = logStatus(log, busy);
  return <footer className={`logsBar ${expanded ? "isExpanded" : "isCollapsed"}`} data-testid="logs-drawer">
    <div className="logsHeader">
      <button className="btn btnGhost btnCompact logsToggle" type="button" data-testid="logs-toggle" aria-expanded={expanded} aria-controls="command-output" onClick={() => setExpanded(!expanded)}>{expanded ? "▾" : "▸"} Logs</button>
      <span className={`logsStatus logsStatus-${status.tone}`} role="status" data-testid="logs-status">{status.label}</span>
    </div>
    {expanded ? <div className="logsBoxRow" id="command-output">
      <div className="logsBox">{log || (busy ? "Running…" : "No logs yet.")}</div>
      <div className="logsActionsStack">
        <button className="btn btnGhost btnCompact" onClick={() => onCopy(log)} disabled={!log}>Copy</button>
        <button className="btn btnGhost btnCompact" onClick={onClear} disabled={busy || !log}>Clear</button>
      </div>
    </div> : null}
  </footer>;
}

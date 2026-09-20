/** Diagnostic output only; this never claims the workstation itself is healthy. */
export function logStatus(log: string, busy: boolean): { tone: string; label: string } {
  if (/\[(?:ERR|ERROR|FATAL)\]|\b(?:ERROR|FATAL):|"ok"\s*:\s*false|"(?:status|state)"\s*:\s*"(?:failed|error)"|\b(?:command|request|save|load|build|launch) failed\b/i.test(log)) return { tone: "error", label: "Error · inspect output" };
  if (/\b(?:WARN|WARNING|attention)\b/i.test(log)) return { tone: "warning", label: "Attention" };
  if (busy) return { tone: "running", label: "Running…" };
  return { tone: "normal", label: log ? "Output available" : "No output" };
}

import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SplitTextPanel } from "../common/SplitTextPanel";

type RunO2Result = {
  ok: boolean;
  code?: number;
  stdout: string;
  stderr: string;
};

function joinOut(r: RunO2Result): string {
  const a = (r.stdout || "").trimEnd();
  const b = (r.stderr || "").trimEnd();
  if (a && b) return `${a}\n${b}`;
  return a || b || "";
}

async function copyText(text: string) {
  // Try modern clipboard first (may fail depending on permissions/context)
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // fall through
  }

  // Reliable fallback for many WebView contexts
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  } catch {
    // ignore
  }
}

export function SnapshotTab() {
  const [verb, setVerb] = useState("snapshot");
  const [out, setOut] = useState("");
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    try {
      const res = await invoke<RunO2Result>("run_o2", { verb });
      const text = joinOut(res);
      setOut(text || (res.ok ? "(no output)" : `${verb} failed`));
    } catch (e: any) {
      setOut(String(e?.message ?? e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <SplitTextPanel
      title="Snapshot"
      topLabel="O2 verb (editable)"
      topValue={verb}
      onTopChange={setVerb}
      topPlaceholder="snapshot"
      bottomLabel="Output"
      bottomValue={out}
      bottomPlaceholder="Output will appear here…"
      busy={running}
      onRun={run}
      onCopy={() => void copyText(out)}
      onClear={() => setOut("")}
      runLabel="Run"
    />
  );
}

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
      onCopy={() => void navigator.clipboard.writeText(out)}
      onClear={() => setOut("")}
      runLabel="Run"
    />
  );
}

import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SplitTextPanel } from "../common/SplitTextPanel";
import { copyText } from "../common/copyText";

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

export function CodexBuildTab() {
  const [prompt, setPrompt] = useState("");
  const [out, setOut] = useState("");
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    try {
      const res = await invoke<RunO2Result>("run_o2_with_input", {
        verb: "codex.build",
        input: prompt,
      });
      const text = joinOut(res);
      setOut(text || (res.ok ? "(no output)" : "codex.build failed"));
    } catch (e: any) {
      setOut(String(e?.message ?? e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <SplitTextPanel
      title="Codex Build"
      topLabel="Build prompt (sent to O2 codex.build stdin)"
      topValue={prompt}
      onTopChange={setPrompt}
      topPlaceholder="Paste your Codex build instructions here…"
      bottomLabel="Output"
      bottomValue={out}
      bottomPlaceholder="Command output will appear here…"
      busy={running}
      onRun={run}
      onCopy={() => void copyText(out)}
      onClear={() => setOut("")}
      runLabel="Run codex.build"
    />
  );
}

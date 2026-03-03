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
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {}

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
  } catch {}
}

export function CodexChatTab() {
  const [prompt, setPrompt] = useState("");
  const [out, setOut] = useState("");
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    try {
      const res = await invoke<RunO2Result>("run_o2_with_input", {
        verb: "codex.chat",
        input: prompt,
      });
      const text = joinOut(res);
      setOut(text || (res.ok ? "(no output)" : "codex.chat failed"));
    } catch (e: any) {
      setOut(String(e?.message ?? e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <SplitTextPanel
      title="Codex Chat"
      topLabel="Prompt (sent to O2 codex.chat stdin)"
      topValue={prompt}
      onTopChange={setPrompt}
      topPlaceholder="Paste your Codex prompt here…"
      bottomLabel="Output"
      bottomValue={out}
      bottomPlaceholder="Command output will appear here…"
      busy={running}
      onRun={run}
      onCopy={() => void copyText(out)}
      onClear={() => setOut("")}
      runLabel="Run codex.chat"
    />
  );
}

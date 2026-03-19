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

function b64urlEncodeUtf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

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
      const payload = {
        requestClass: "casual_build_request",
        intent: "codex_build_freeform",
        rawInput: prompt,
        target: {},
        requestedMode: "auto",
        source: "radcontrol.codex_build",
      };
      const encodedPayload = b64urlEncodeUtf8(JSON.stringify(payload));
      const res = await invoke<RunO2Result>("run_o2", {
        verb: `codex.request.${encodedPayload}`,
      });
      const text = joinOut(res);
      setOut(text || (res.ok ? "(no output)" : "codex request failed"));
    } catch (e: any) {
      setOut(String(e?.message ?? e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <SplitTextPanel
      title="Codex Build"
      topLabel="Build prompt (sent to O2 governed request path)"
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
      runLabel="Run Codex request"
    />
  );
}

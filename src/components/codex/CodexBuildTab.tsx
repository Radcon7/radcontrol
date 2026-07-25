import { useState } from "react";
import { SplitTextPanel } from "../common/SplitTextPanel";
import { copyText } from "../common/copyText";
import { encodeO2JsonPayload, runO2Text } from "../common/o2Files";

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
      const verb = `codex.request.${encodeO2JsonPayload(payload)}`;
      const text = await runO2Text(verb);
      setOut(text || "(no output)");
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

import { useState } from "react";
import { SplitTextPanel } from "../common/SplitTextPanel";
import { copyText } from "../common/copyText";
import { joinO2ResultOutput, runO2WithInput } from "../common/o2Files";

export function CodexChatTab() {
  const [prompt, setPrompt] = useState("");
  const [out, setOut] = useState("");
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    try {
      const res = await runO2WithInput("codex.chat", prompt);
      const text = joinO2ResultOutput(res);
      setOut(text || (res.ok ? "(no output)" : "codex.chat failed"));
    } catch (e) {
      setOut(String(e instanceof Error ? e.message : e));
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

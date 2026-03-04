import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SplitTextPanel } from "../common/SplitTextPanel";

type RunO2Result = {
  ok: boolean;
  code?: number;
  stdout: string;
  stderr: string;
};

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // fallback
  }

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

export function EmpireSweepTab() {
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);

  async function run() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await invoke<RunO2Result>("run_o2", { verb: "empire.sweep" });
      // stdout verbatim (no parsing, no joining stderr)
      setOut(res?.stdout ?? "");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SplitTextPanel
      title="Empire Sweep"
      topLabel="Command"
      topValue="run_o2(verb=empire.sweep)"
      onTopChange={() => {}}
      bottomLabel="stdout (verbatim)"
      bottomValue={out}
      busy={busy}
      onRun={() => void run()}
      runLabel="Run empire.sweep"
      onCopy={() => void copyText(out)}
      onClear={() => setOut("")}
    />
  );
}

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
    // fall through
  }

  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "absolute";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(ta);
  }
}

export function EmpireMapTab() {
  const [verb] = useState<string>("empire.map"); // fixed by policy
  const [out, setOut] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);

  async function run() {
    setBusy(true);
    try {
      const res = await invoke<RunO2Result>("run_o2", { verb });
      // stdout verbatim (no join, no trim, no parsing)
      setOut(res?.stdout ?? "");
    } catch (e) {
      const msg =
        e instanceof Error
          ? `${e.name}: ${e.message}\n${e.stack ?? ""}`
          : String(e);
      setOut(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SplitTextPanel
      title="Empire Map"
      topLabel="Verb"
      topValue={verb}
      onTopChange={() => {
        // verb is fixed by governance: no-op
      }}
      topPlaceholder="empire.map"
      bottomLabel="stdout"
      bottomValue={out}
      bottomPlaceholder="(run empire.map to populate output)"
      busy={busy}
      onRun={() => void run()}
      runLabel="Run empire.map"
      onCopy={() => void copyText(out)}
      onClear={() => setOut("")}
    />
  );
}

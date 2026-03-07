import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SplitTextPanel } from "../common/SplitTextPanel";
import { SystemStateShell } from "../common/SystemStateShell";

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
      setOut(res?.stdout ?? "");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SystemStateShell
      title="Empire Sweep"
      actions={
        <>
          <button
            className="btn btnPrimary"
            onClick={() => void run()}
            disabled={busy}
            title="Run empire.sweep"
          >
            {busy ? "Running…" : "Run empire.sweep"}
          </button>

          <button
            className="btn btnGhost"
            onClick={() => void copyText(out)}
            disabled={out.trim().length === 0}
          >
            Copy
          </button>

          <button
            className="btn btnGhost"
            onClick={() => setOut("")}
            disabled={busy}
          >
            Clear
          </button>
        </>
      }
      meta={
        <>
          <div>
            <strong>Command:</strong> run_o2(verb=empire.sweep)
          </div>
          <div>
            <strong>Mode:</strong> Read-only stdout surface
          </div>
        </>
      }
    >
      <SplitTextPanel
        topLabel="Command"
        topValue="run_o2(verb=empire.sweep)"
        onTopChange={() => {}}
        bottomLabel="stdout (verbatim)"
        bottomValue={out}
        bottomPlaceholder="(run empire.sweep to populate output)"
        busy={busy}
      />
    </SystemStateShell>
  );
}

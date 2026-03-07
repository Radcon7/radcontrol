import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SplitTextPanel } from "../common/SplitTextPanel";
import { SystemStateShell } from "../common/SystemStateShell";
import { copyText } from "../common/copyText";

type RunO2Result = {
  ok: boolean;
  code?: number;
  stdout: string;
  stderr: string;
};

export function EmpireMapTab() {
  const [verb] = useState<string>("empire.map");
  const [out, setOut] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);

  async function run() {
    setBusy(true);
    try {
      const res = await invoke<RunO2Result>("run_o2", { verb });
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
    <SystemStateShell
      title="Empire Map"
      actions={
        <>
          <button
            className="btn btnPrimary"
            onClick={() => void run()}
            disabled={busy}
            title="Run empire.map"
          >
            {busy ? "Running…" : "Run empire.map"}
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
            <strong>Verb:</strong> {verb}
          </div>
          <div>
            <strong>Mode:</strong> Read-only stdout surface
          </div>
        </>
      }
    >
      <SplitTextPanel
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
      />
    </SystemStateShell>
  );
}

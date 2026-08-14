import { useEffect, useState } from "react";
import { runO2ParsedJson } from "../common/o2Files";
import { RouterHealthPanel } from "./RouterHealthPanel";
import { WorkstationHealthPanel } from "./WorkstationHealthPanel";
import { WorkstationUpdatesPanel } from "./WorkstationUpdatesPanel";

type Props = {
  onAppendLog: (text: string) => void;
};

export function WorkstationOperationsPanel({ onAppendLog }: Props) {
  const [section, setSection] = useState<"health" | "routers" | "updates">("health");
  const [updateSummary, setUpdateSummary] = useState({ securityCount: 0, updateCount: 0 });

  useEffect(() => {
    void runO2ParsedJson<{
      checks?: Array<{ apt?: { securityCount?: number; updateCount?: number } }>;
    }>(
      "workstation.updates.history",
      "Could not load update summary",
      "Update summary returned invalid data",
    ).then((history) => {
      const latest = history.checks?.[0]?.apt;
      if (latest) {
        setUpdateSummary({
          securityCount: latest.securityCount || 0,
          updateCount: latest.updateCount || 0,
        });
      }
    }).catch(() => {
      // The full Updates view reports transport errors; keep the tab usable here.
    });
  }, []);

  return (
    <section className="workstationOperations">
      <nav className="workstationSectionTabs" aria-label="Workstation operations">
        <button
          type="button"
          className={section === "routers" ? "isActive" : ""}
          onClick={() => setSection("routers")}
        >
          Repository routers
        </button>
        <button
          type="button"
          className={section === "health" ? "isActive" : ""}
          onClick={() => setSection("health")}
        >
          Health & cleanup
        </button>
        <button
          type="button"
          className={section === "updates" ? "isActive" : ""}
          onClick={() => setSection("updates")}
        >
          Updates
          {updateSummary.securityCount > 0 ? (
            <span>{updateSummary.securityCount} security</span>
          ) : updateSummary.updateCount > 0 ? (
            <span>{updateSummary.updateCount} ready</span>
          ) : null}
        </button>
      </nav>
      {section === "health" ? (
        <WorkstationHealthPanel onAppendLog={onAppendLog} />
      ) : section === "routers" ? (
        <RouterHealthPanel />
      ) : (
        <WorkstationUpdatesPanel onAppendLog={onAppendLog} onSummaryChange={setUpdateSummary} />
      )}
    </section>
  );
}

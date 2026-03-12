import { useEffect, useMemo, useState } from "react";
import { SystemStateShell } from "../common/SystemStateShell";
import { copyText } from "../common/copyText";
import {
  loadGovernanceInventory,
  type GovernanceInventoryResolvedItem,
} from "../common/governanceInventoryLoader";

function buildCopyText(items: GovernanceInventoryResolvedItem[]): string {
  const lines = [
    "Governance",
    `Inventory items: ${items.length}`,
    "",
    "Legend:",
    "- Found via O2 files.list = item was returned by the current O2 docs inventory surface",
    "- Expected by Policy = item is part of the canonical governance model even if not surfaced by files.list",
    "",
    "Order\tTitle\tScope\tCategory\tAuthority\tDisplay\tFound via O2 files.list\tExpected by Policy\tResolved Path",
  ];

  for (const item of items) {
    lines.push(
      [
        item.order,
        item.title,
        item.scope,
        item.category,
        item.authority,
        item.display_mode,
        item.foundViaFilesList ? "✔" : "—",
        item.expectedByPolicy ? "✔" : "—",
        item.resolvedPath,
      ].join("\t"),
    );
  }

  return lines.join("\n");
}

export default function GovernanceInventoryInspector() {
  const [items, setItems] = useState<GovernanceInventoryResolvedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const data = await loadGovernanceInventory();
        setItems(data);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const copyPayload = useMemo(() => buildCopyText(items), [items]);

  const actions = (
    <button
      className="btn btnGhost"
      onClick={() => void copyText(copyPayload)}
      disabled={loading || items.length === 0}
    >
      Copy
    </button>
  );

  const meta = (
    <div className="panelMeta">
      <div>
        <strong>Inventory items:</strong> {items.length}
      </div>
      <div>
        <strong>Status:</strong>{" "}
        {loading ? "loading…" : err ? "error" : "loaded"}
      </div>
    </div>
  );

  return (
    <SystemStateShell
      title="Governance"
      actions={actions}
      meta={meta}
      error={err ? <>{err}</> : null}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          flex: 1,
          minHeight: 0,
        }}
      >
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 12,
            background: "rgba(255,255,255,0.03)",
            padding: 10,
            fontSize: 13,
            opacity: 0.86,
          }}
        >
          <div>
            <strong>Purpose:</strong> Inventory of governance authority
            documents across Empire, O2, and this repository.
          </div>
          <div style={{ marginTop: 6 }}>
            <strong>Legend:</strong> “Found via O2 files.list” reflects the
            current O2 docs inventory surface. “Expected by Policy” reflects
            canonical governance expectations even when an item is outside that
            surface.
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 12, opacity: 0.8 }}>
            Loading governance inventory…
          </div>
        ) : (
          <div
            style={{
              minHeight: 0,
              overflow: "auto",
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 12,
              background: "rgba(255,255,255,0.03)",
            }}
          >
            <table
              style={{
                borderCollapse: "collapse",
                width: "100%",
                fontSize: 13,
              }}
            >
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: 8 }}>Order</th>
                  <th style={{ textAlign: "left", padding: 8 }}>Title</th>
                  <th style={{ textAlign: "left", padding: 8 }}>Scope</th>
                  <th style={{ textAlign: "left", padding: 8 }}>Category</th>
                  <th style={{ textAlign: "left", padding: 8 }}>Authority</th>
                  <th style={{ textAlign: "left", padding: 8 }}>Display</th>
                  <th style={{ textAlign: "left", padding: 8 }}>
                    Found via O2 files.list
                  </th>
                  <th style={{ textAlign: "left", padding: 8 }}>
                    Expected by Policy
                  </th>
                  <th style={{ textAlign: "left", padding: 8 }}>
                    Resolved Path
                  </th>
                </tr>
              </thead>

              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td style={{ padding: 8 }}>{item.order}</td>
                    <td style={{ padding: 8 }}>{item.title}</td>
                    <td style={{ padding: 8 }}>{item.scope}</td>
                    <td style={{ padding: 8 }}>{item.category}</td>
                    <td style={{ padding: 8 }}>{item.authority}</td>
                    <td style={{ padding: 8 }}>{item.display_mode}</td>
                    <td style={{ padding: 8 }}>
                      {item.foundViaFilesList ? "✔" : "—"}
                    </td>
                    <td style={{ padding: 8 }}>
                      {item.expectedByPolicy ? "✔" : "—"}
                    </td>
                    <td
                      style={{
                        padding: 8,
                        fontFamily: "monospace",
                        fontSize: 12,
                        opacity: 0.85,
                      }}
                    >
                      {item.resolvedPath}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </SystemStateShell>
  );
}

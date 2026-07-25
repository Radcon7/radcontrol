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
      <div className="governanceInspectorStack">
        <div className="surfaceCard">
          <div className="surfaceCardTitle">Purpose</div>
          <div className="surfaceCardLead">
            Inventory of governance authority documents across Empire, O2, and
            this repository.
          </div>
          <div className="surfaceInlineNotice">
            Legend: “Found via O2 files.list” reflects the current O2 docs
            inventory surface. “Expected by Policy” reflects canonical
            governance expectations even when an item is outside that surface.
          </div>
        </div>

        {loading ? (
          <div className="surfaceCard governanceInspectorLoading">
            Loading governance inventory…
          </div>
        ) : (
          <div className="surfaceCard surfaceScrollCard governanceInspectorTableWrap">
            <table className="governanceInspectorTable">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Title</th>
                  <th>Scope</th>
                  <th>Category</th>
                  <th>Authority</th>
                  <th>Display</th>
                  <th>Found via O2 files.list</th>
                  <th>Expected by Policy</th>
                  <th>Resolved Path</th>
                </tr>
              </thead>

              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.order}</td>
                    <td>{item.title}</td>
                    <td>{item.scope}</td>
                    <td>{item.category}</td>
                    <td>{item.authority}</td>
                    <td>{item.display_mode}</td>
                    <td>{item.foundViaFilesList ? "✔" : "—"}</td>
                    <td>{item.expectedByPolicy ? "✔" : "—"}</td>
                    <td className="governanceInspectorPathCell">
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

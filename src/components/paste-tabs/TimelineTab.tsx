import { useEffect, useMemo, useState } from "react";
import { MilestoneModal } from "./MilestoneModal";
import {
  createTimelineMilestone,
  listTimelineMilestones,
  type TimelineMilestone,
  type NewMilestoneInput,
} from "./timelineLoader";

function formatMilestoneDate(value: string): string {
  if (!value) return "Undated";

  const parts = value.split("-");
  if (parts.length !== 3) return value;

  const [yyyy, mm, dd] = parts;
  const dt = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  if (Number.isNaN(dt.getTime())) return value;

  return dt.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function groupLabel(value: string): string {
  if (!value) return "Undated";

  const parts = value.split("-");
  if (parts.length < 2) return value;

  const [yyyy, mm] = parts;
  const dt = new Date(Number(yyyy), Number(mm) - 1, 1);
  if (Number.isNaN(dt.getTime())) return value;

  return dt.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
  });
}

type Group = {
  key: string;
  items: TimelineMilestone[];
};

export function TimelineTab() {
  const [items, setItems] = useState<TimelineMilestone[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [expandedPath, setExpandedPath] = useState<string | null>(null);

  async function reload(): Promise<void> {
    setBusy(true);
    setErr("");

    try {
      const next = await listTimelineMilestones();
      setItems(next);

      if (next.length > 0 && !expandedPath) {
        setExpandedPath(next[next.length - 1].path);
      }
      if (next.length === 0) {
        setExpandedPath(null);
      }
    } catch (error) {
      setErr(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  async function handleCreate(input: NewMilestoneInput): Promise<void> {
    setBusy(true);
    setErr("");

    try {
      const created = await createTimelineMilestone(input);
      const next = await listTimelineMilestones();
      setItems(next);
      setExpandedPath(created.path);
      setShowCreate(false);
    } catch (error) {
      setErr(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      setBusy(false);
    }
  }

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, TimelineMilestone[]>();

    for (const item of items) {
      const key = item.date ? item.date.slice(0, 7) : "undated";
      const bucket = map.get(key);
      if (bucket) {
        bucket.push(item);
      } else {
        map.set(key, [item]);
      }
    }

    return Array.from(map.entries()).map(([key, groupedItems]) => ({
      key,
      items: groupedItems,
    }));
  }, [items]);

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        minHeight: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "4px 2px 0 2px",
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Timeline</div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Vertical milestone history backed by O2 files.* authority
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => void reload()}
            disabled={busy}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "#23262d",
              color: "white",
              cursor: "pointer",
            }}
          >
            Reload
          </button>

          <button
            onClick={() => setShowCreate(true)}
            disabled={busy}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "none",
              background: "#3a7afe",
              color: "white",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Add Milestone
          </button>
        </div>
      </div>

      {err ? (
        <div
          style={{
            border: "1px solid rgba(255,107,107,0.45)",
            background: "rgba(255,107,107,0.08)",
            color: "#ff9b9b",
            borderRadius: 10,
            padding: "10px 12px",
            fontSize: 13,
          }}
        >
          {err}
        </div>
      ) : null}

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "8px 10px 18px 10px",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 12,
          background: "rgba(255,255,255,0.02)",
        }}
      >
        {busy && items.length === 0 ? (
          <div style={{ opacity: 0.8, padding: "8px 4px" }}>
            Loading timeline…
          </div>
        ) : null}

        {!busy && items.length === 0 ? (
          <div
            style={{
              padding: "18px 14px",
              border: "1px dashed rgba(255,255,255,0.16)",
              borderRadius: 12,
              opacity: 0.85,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
              No milestones yet
            </div>
            <div style={{ fontSize: 13 }}>
              Create the first milestone to begin the RadControl timeline.
            </div>
          </div>
        ) : null}

        {groups.map((group) => (
          <div key={group.key} style={{ marginBottom: 22 }}>
            <div
              style={{
                position: "sticky",
                top: 0,
                zIndex: 1,
                padding: "6px 0 10px 0",
                background:
                  "linear-gradient(to bottom, rgba(17,17,17,0.96), rgba(17,17,17,0.75), rgba(17,17,17,0))",
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "0.02em",
                textTransform: "uppercase",
                opacity: 0.82,
              }}
            >
              {group.key === "undated"
                ? "Undated"
                : groupLabel(`${group.key}-01`)}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {group.items.map((item, index) => {
                const expanded = expandedPath === item.path;
                const isLast = index === group.items.length - 1;

                return (
                  <div
                    key={item.path}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "34px 1fr",
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        minHeight: expanded ? 120 : 78,
                      }}
                    >
                      <div
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: "50%",
                          background: expanded ? "#3a7afe" : "#7aa2ff",
                          marginTop: 8,
                          boxShadow: expanded
                            ? "0 0 0 4px rgba(58,122,254,0.16)"
                            : "none",
                          flex: "0 0 auto",
                        }}
                      />
                      {!isLast ? (
                        <div
                          style={{
                            width: 2,
                            flex: 1,
                            marginTop: 6,
                            background: "rgba(255,255,255,0.12)",
                            borderRadius: 999,
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 2,
                            flex: 1,
                            marginTop: 6,
                            background:
                              "linear-gradient(to bottom, rgba(255,255,255,0.12), rgba(255,255,255,0.02))",
                            borderRadius: 999,
                          }}
                        />
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setExpandedPath((prev) =>
                          prev === item.path ? null : item.path,
                        )
                      }
                      style={{
                        textAlign: "left",
                        border: "1px solid rgba(255,255,255,0.09)",
                        background: expanded
                          ? "rgba(58,122,254,0.09)"
                          : "rgba(255,255,255,0.03)",
                        color: "inherit",
                        borderRadius: 14,
                        padding: "12px 14px",
                        cursor: "pointer",
                        transition:
                          "background 120ms ease, border-color 120ms ease",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "start",
                          justifyContent: "space-between",
                          gap: 10,
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 16, fontWeight: 700 }}>
                            {item.title}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 8,
                              marginTop: 5,
                              fontSize: 12,
                              opacity: 0.82,
                            }}
                          >
                            <span>{formatMilestoneDate(item.date)}</span>
                            {item.category ? (
                              <span>• {item.category}</span>
                            ) : null}
                          </div>
                        </div>

                        <div
                          style={{
                            fontSize: 12,
                            opacity: 0.7,
                            paddingTop: 2,
                          }}
                        >
                          {expanded ? "Hide" : "Show"}
                        </div>
                      </div>

                      {expanded ? (
                        <div
                          style={{
                            marginTop: 12,
                            paddingTop: 12,
                            borderTop: "1px solid rgba(255,255,255,0.08)",
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                            fontSize: 13,
                            lineHeight: 1.5,
                          }}
                        >
                          <div>
                            <span style={{ opacity: 0.68 }}>File:</span>{" "}
                            <code style={{ fontSize: 12 }}>
                              {item.fileName}
                            </code>
                          </div>

                          {item.createdAt ? (
                            <div>
                              <span style={{ opacity: 0.68 }}>Created:</span>{" "}
                              {item.createdAt}
                            </div>
                          ) : null}

                          <div>
                            <span style={{ opacity: 0.68 }}>Notes:</span>
                            <div
                              style={{ marginTop: 4, whiteSpace: "pre-wrap" }}
                            >
                              {item.notes || "—"}
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <MilestoneModal
        open={showCreate}
        busy={busy}
        onCancel={() => setShowCreate(false)}
        onCreate={handleCreate}
      />
    </div>
  );
}

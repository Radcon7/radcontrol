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

  async function reload(): Promise<void> {
    setBusy(true);
    setErr("");

    try {
      const next = await listTimelineMilestones();
      setItems(next);
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
      await createTimelineMilestone(input);
      const next = await listTimelineMilestones();
      setItems(next);
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

    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, groupedItems]) => ({
        key,
        items: [...groupedItems].reverse(),
      }));
  }, [items]);

  return (
    <section className="workspaceShell">
      <div className="workspaceActionRow">
        <button
          className="btn btnPrimary btnCompact"
          onClick={() => setShowCreate(true)}
          disabled={busy}
        >
          Add Milestone
        </button>
      </div>

      {err ? <div className="panelError">{err}</div> : null}

      <div className="timelineFeed">
        {busy && items.length === 0 ? (
          <div className="timelineStatus">Loading timeline…</div>
        ) : null}

        {!busy && items.length === 0 ? (
          <div className="timelineEmptyState">
            <div className="timelineEmptyTitle">No milestones yet</div>
            <div className="timelineEmptyBody">
              Create the first milestone to begin the RadControl timeline.
            </div>
          </div>
        ) : null}

        {groups.map((group) => (
          <div key={group.key} className="timelineGroup">
            <div className="timelineGroupLabel">
              {group.key === "undated" ? "Undated" : groupLabel(`${group.key}-01`)}
            </div>

            <div className="timelineEntries">
              {group.items.map((item, index) => {
                const isLast = index === group.items.length - 1;

                return (
                  <div key={item.path} className="timelineEntryRow">
                    <div className="timelineRail">
                      <div className="timelineDot" />
                      <div className={`timelineStem ${isLast ? "timelineStemFade" : ""}`} />
                    </div>

                    <div className="timelineCard">
                      <div className="timelineEntryDate">
                        {formatMilestoneDate(item.date)}
                      </div>
                      <div className="timelineEntryText">
                        {item.notes || item.title || "—"}
                      </div>
                    </div>
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
    </section>
  );
}

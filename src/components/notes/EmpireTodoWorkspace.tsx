import { useCallback, useEffect, useRef, useState } from "react";
import { listEmpireTodos, saveEmpireTodo } from "./empireTodoApi";
import {
  createBlankEmpireTodo,
  EMPIRE_TODO_PRIORITIES,
  EMPIRE_TODO_STATUSES,
  mergeSavedEmpireTodo,
  selectEmpireTodoItem,
  type EmpireTodoItem,
} from "./empireTodoModel";

type Props = {
  busy?: boolean;
  registerBeforeTabChangeSaver?: (fn: (() => Promise<boolean>) | null) => void;
};

type TextAreaField = Extract<
  keyof EmpireTodoItem,
  | "summary"
  | "detailedContext"
  | "whyItMatters"
  | "currentState"
  | "nextActions"
  | "dependencies"
  | "acceptanceCriteria"
  | "notes"
>;

const TEXT_AREAS: Array<{
  key: TextAreaField;
  label: string;
  placeholder: string;
}> = [
  { key: "summary", label: "Summary", placeholder: "The shortest useful description of this work…" },
  { key: "detailedContext", label: "Full description", placeholder: "Preserve the context another session will need…" },
  { key: "whyItMatters", label: "Why it matters", placeholder: "What breaks, drifts, or becomes possible because of this item?" },
  { key: "currentState", label: "Current state", placeholder: "What is verified now? What remains unknown?" },
  { key: "nextActions", label: "Next actions", placeholder: "Concrete next steps, in order…" },
  { key: "dependencies", label: "Dependencies / blockers", placeholder: "External decisions, prerequisites, or blocking evidence…" },
  { key: "acceptanceCriteria", label: "Acceptance criteria", placeholder: "What observable evidence makes this complete?" },
  { key: "notes", label: "Notes / history", placeholder: "Decisions, dates, changes, and follow-up notes…" },
];

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value || "—" : date.toLocaleString();
}

export function EmpireTodoWorkspace({ busy, registerBeforeTabChangeSaver }: Props) {
  const [items, setItems] = useState<EmpireTodoItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EmpireTodoItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const draftRef = useRef<EmpireTodoItem | null>(null);
  const dirtyRef = useRef(false);
  const saveInFlightRef = useRef(false);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void listEmpireTodos()
      .then((response) => {
        if (!active) return;
        const nextItems = Array.isArray(response.items) ? response.items : [];
        const selected = selectEmpireTodoItem(nextItems, selectedId);
        setItems(nextItems);
        setSelectedId(selected?.id || null);
        setDraft(selected ? { ...selected } : null);
        setDirty(false);
      })
      .catch((reason) => {
        if (active) {
          setItems([]);
          setSelectedId(null);
          setDraft(null);
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const persistDraft = useCallback(async (): Promise<boolean> => {
    const current = draftRef.current;
    if (!dirtyRef.current || !current) return true;
    if (!current.title.trim()) {
      setError("A title is required before this item can be saved.");
      return false;
    }
    if (saveInFlightRef.current) return false;
    saveInFlightRef.current = true;
    setSaving(true);
    setError("");
    setSavedMessage("");
    try {
      const response = await saveEmpireTodo(current);
      if (!response.ok || !response.item) {
        throw new Error(response.error || "Empire To-Do save failed.");
      }
      setItems((existing) => mergeSavedEmpireTodo(existing, response.item));
      setDraft({ ...response.item });
      setSelectedId(response.item.id);
      setDirty(false);
      dirtyRef.current = false;
      draftRef.current = response.item;
      setSavedMessage(`Saved ${formatTimestamp(response.item.updatedAt)}`);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return false;
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  }, []);

  useEffect(() => {
    registerBeforeTabChangeSaver?.(persistDraft);
    return () => registerBeforeTabChangeSaver?.(null);
  }, [persistDraft, registerBeforeTabChangeSaver]);

  function updateDraft<K extends keyof EmpireTodoItem>(
    key: K,
    value: EmpireTodoItem[K],
  ): void {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
    setDirty(true);
    setSavedMessage("");
  }

  async function selectItem(item: EmpireTodoItem): Promise<void> {
    if (item.id === selectedId) return;
    if (!(await persistDraft())) return;
    setSelectedId(item.id);
    setDraft({ ...item });
    setDirty(false);
    setError("");
    setSavedMessage("");
  }

  async function startNewItem(): Promise<void> {
    if (!(await persistDraft())) return;
    const next = createBlankEmpireTodo();
    setSelectedId(next.id);
    setDraft(next);
    setDirty(true);
    setError("");
    setSavedMessage("");
  }

  return (
    <section className="empireTodoShell" data-testid="empire-todo-workspace">
      <div className="empireTodoToolbar">
        <div>
          <strong>EMPIRE TO-DO LIST</strong>
          <span>O2-backed roadmap memory · editable and restart-safe</span>
        </div>
        <div>
          <button className="btn btnGhost btnCompact" type="button" onClick={() => void startNewItem()} disabled={Boolean(busy) || loading || saving}>
            Add Item
          </button>
          <button className="btn btnPrimary btnCompact" type="button" onClick={() => void persistDraft()} disabled={Boolean(busy) || loading || saving || !dirty}>
            {saving ? "Saving…" : dirty ? "Save Item" : "Saved"}
          </button>
        </div>
      </div>

      {error ? <div className="panelError">{error}</div> : null}

      <div className="empireTodoGrid">
        <aside className="empireTodoList" aria-label="Empire To-Do items">
          <div className="empireTodoListHeader">
            <span>{error ? "Durable data unavailable" : `${items.length} durable item${items.length === 1 ? "" : "s"}`}</span>
            {loading ? <small>Loading…</small> : null}
          </div>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`empireTodoListItem ${selectedId === item.id ? "isSelected" : ""}`}
              onClick={() => void selectItem(item)}
              data-testid={`empire-todo-item-${item.id}`}
            >
              <i className={`empireTodoDot empireTodoDot-${item.status.toLowerCase().replace(/ /g, "-")}`} />
              <span>
                <strong>{item.title}</strong>
                <small>{item.status} · {item.priority} · {item.category}</small>
              </span>
            </button>
          ))}
          {!loading && !items.length ? (
            <div className="surfaceEmptyState">
              {error ? "Empire To-Do data unavailable. See the error above." : "No Empire To-Do items exist yet."}
            </div>
          ) : null}
        </aside>

        <main className="empireTodoEditor" data-testid="empire-todo-selected-item">
          {draft ? (
            <>
              <div className="empireTodoEditorHeading">
                <span>SELECTED ITEM</span>
                <small>{dirty ? "Unsaved changes" : savedMessage || "Saved"}</small>
              </div>

              <label className="empireTodoField empireTodoTitleField">
                <span>Title</span>
                <input className="input" data-testid="empire-todo-title" value={draft.title} onChange={(event) => updateDraft("title", event.target.value)} disabled={saving} />
              </label>

              <div className="empireTodoMetaGrid">
                <label className="empireTodoField">
                  <span>Status</span>
                  <select className="input" value={draft.status} onChange={(event) => updateDraft("status", event.target.value as EmpireTodoItem["status"])} disabled={saving}>
                    {EMPIRE_TODO_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </label>
                <label className="empireTodoField">
                  <span>Priority</span>
                  <select className="input" value={draft.priority} onChange={(event) => updateDraft("priority", event.target.value as EmpireTodoItem["priority"])} disabled={saving}>
                    {EMPIRE_TODO_PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                  </select>
                </label>
                <label className="empireTodoField">
                  <span>Category / area</span>
                  <input className="input" value={draft.category} onChange={(event) => updateDraft("category", event.target.value)} disabled={saving} />
                </label>
              </div>

              <div className="empireTodoTextFields">
                {TEXT_AREAS.map((field) => (
                  <label className="empireTodoField" key={field.key}>
                    <span>{field.label}</span>
                    <textarea className="pasteArea" data-testid={`empire-todo-${field.key}`} value={draft[field.key]} placeholder={field.placeholder} onChange={(event) => updateDraft(field.key, event.target.value)} disabled={saving} />
                  </label>
                ))}
              </div>

              <div className="empireTodoTimestamps">
                <span>Created <strong>{formatTimestamp(draft.createdAt)}</strong></span>
                <span>Updated <strong>{formatTimestamp(draft.updatedAt)}</strong></span>
              </div>
            </>
          ) : (
            <div className="surfaceEmptyState surfaceEmptyStateLarge">
              {loading
                ? "Loading durable Empire To-Do data…"
                : error
                  ? "Empire To-Do data is unavailable. No empty-state claim is being made."
                  : "Select or create an Empire To-Do item."}
            </div>
          )}
        </main>
      </div>
    </section>
  );
}

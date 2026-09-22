import { useEffect, useRef, useState, type ReactNode } from "react";
import { ProgressRail } from "../common/ProgressRail";
import { empireTodoProgress, type EmpireTodoItem } from "./empireTodoModel";

type Props = { item: EmpireTodoItem; rail?: boolean; disabled?: boolean; title?: ReactNode; onAssess?: (percent: number) => Promise<boolean> };

export function TaskProgress({ item, rail = false, ...props }: Props) {
  const progress = empireTodoProgress(item);
  if (rail) return <TaskProgressControl item={item} {...props} />;
  return <span className={`todoProgress todoProgress-${progress.tone}`} data-testid="task-progress"
    data-progress-basis={item.status === "Complete" ? "completion" : item.progress ? "operator" : "unassessed"}
    aria-label={`Task progress: ${progress.label}${progress.percent !== null ? ` · ${progress.percent}%` : ""}`}>
    <span className="todoProgressLabel"><span className="todoProgressPuck" aria-hidden="true" />{progress.label}{progress.percent !== null ? ` · ${progress.percent}%` : ""}</span>
  </span>;
}

function TaskProgressControl({ item, disabled, title, onAssess }: Omit<Props, "rail">) {
  const progress = empireTodoProgress(item);
  const [draft, setDraft] = useState(progress.percent === null ? "" : String(progress.percent));
  const [editing, setEditing] = useState(false);
  const submitted = useRef<number | null>(null);
  useEffect(() => {
    setDraft(progress.percent === null ? "" : String(progress.percent)); submitted.current = null;
  }, [progress.percent, item.progress?.reviewedAt]);
  const percent = draft.trim() === "" ? null : Number(draft);
  const valid = percent !== null && Number.isInteger(percent) && percent >= 0 && percent <= 100;
  const editable = !!onAssess && (item.status === "In Progress" || item.status === "Blocked");
  const cancel = () => { setDraft(progress.percent === null ? "" : String(progress.percent)); setEditing(false); };
  const commit = (value: number | null) => {
    if (!editable || disabled || value === null || !Number.isInteger(value) || value < 0 || value > 100
      || value === progress.percent || value === submitted.current) return;
    submitted.current = value;
    void onAssess?.(value);
  };
  return <div className={`taskProgressRail todoProgress-${progress.tone}`} data-testid="task-progress"
    data-progress-basis={item.status === "Complete" ? "completion" : item.progress ? "operator" : "unassessed"}>
    <div className="taskProgressHeading">{title}<strong className="taskProgressValue">{valid ? `${percent}%` : "Unassessed"}</strong></div>
    <div className="taskProgressStatus">{progress.label}</div>
    {valid ? <ProgressRail percent={percent} label={`Progress for ${item.title}`} control={editable ? {
      disabled, onChange: value => setDraft(String(value)), onCommit: commit, onCancel: cancel,
    } : undefined} /> : null}
    {editable && (valid || editing) ? <label className="taskProgressNumber">Percent
      <input className="input" type="number" min="0" max="100" step="1" value={draft} disabled={disabled}
        aria-label={`Percent for ${item.title}`} aria-invalid={draft !== "" && !valid} autoFocus={editing && !valid}
        placeholder="0–100" onChange={event => setDraft(event.target.value)} onBlur={() => commit(percent)}
        onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); commit(percent); } else if (event.key === "Escape") { event.preventDefault(); cancel(); } }} />
      {draft !== "" && !valid ? <span role="alert">Enter a whole percentage from 0 to 100.</span> : null}
    </label> : editable ? <button className="btn btnGhost btnCompact taskSetProgress" type="button" disabled={disabled}
      onClick={() => setEditing(true)} aria-label={`Set progress for ${item.title}`}>Set progress</button> : null}
  </div>;
}

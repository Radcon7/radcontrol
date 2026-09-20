import { empireTodoProgress, type EmpireTodoItem } from "./empireTodoModel";

export function TaskProgress({ item, rail = false }: { item: EmpireTodoItem; rail?: boolean }) {
  const progress = empireTodoProgress(item);
  return <span className={`todoProgress todoProgress-${progress.tone}${rail ? " taskProgressRail" : ""}`}
    data-testid="task-progress" data-progress-basis="lifecycle" aria-label={`Task progress: ${progress.label}`}>
    <span className="todoProgressLabel"><span className="todoProgressPuck" aria-hidden="true" />{progress.label}{progress.percent !== null ? ` · ${progress.percent}%` : ""}</span>
    {rail ? <span className="taskProgressTrack" aria-hidden="true" /> : null}
  </span>;
}

import { listWork, mutateWork } from "../overview/workApi";
import type { EmpireTodoItem, EmpireTodoListResponse, EmpireTodoSaveResponse } from "./empireTodoModel";
export async function listEmpireTodos(): Promise<EmpireTodoListResponse> {
  const result = await listWork();
  return { ok:true, items:result.data.tasks, revision:result.revision, authority:result.authority, seededCount:0, persistence:result.authority === "private" ? "o2-operator-work/v1" : "legacy-readonly", path:result.authority === "private" ? "operator-work/work.json" : "docs/radcontrol/empire_todo/items.json" };
}
async function save(expectedRevision: number, operation: string, value: unknown): Promise<EmpireTodoSaveResponse> {
  const result = await mutateWork(expectedRevision, operation, value);
  const item = result.data.tasks.find(row => row.id === result.recordId);
  if (!item) throw new Error("Saved task was not returned");
  return {ok:true,item,revision:result.revision,itemCount:result.data.tasks.length,seededCount:0};
}
export function saveEmpireTodo(item: EmpireTodoItem, expectedRevision: number): Promise<EmpireTodoSaveResponse> {
  return save(expectedRevision, "task.save", item);
}
export function completeEmpireTodo(itemId: string, timeline: { title:string; notes:string } | null, expectedRevision: number): Promise<EmpireTodoSaveResponse> {
  return save(expectedRevision, "task.complete", {itemId,timeline});
}

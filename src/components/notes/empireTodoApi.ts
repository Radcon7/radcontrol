import {
  runO2ParsedJson,
  runO2StdinPayloadParsedJson,
} from "../common/o2Client";
import type {
  EmpireTodoItem,
  EmpireTodoListResponse,
  EmpireTodoSaveResponse,
} from "./empireTodoModel";

export async function listEmpireTodos(): Promise<EmpireTodoListResponse> {
  return runO2ParsedJson<EmpireTodoListResponse>(
    "empire.todo.list",
    "Could not load the Empire To-Do List",
    "Empire To-Do List returned invalid data",
  );
}

export async function saveEmpireTodo(
  item: EmpireTodoItem,
): Promise<EmpireTodoSaveResponse> {
  return runO2StdinPayloadParsedJson<EmpireTodoSaveResponse>(
    "empire.todo.save",
    { item },
    "Could not save the Empire To-Do item",
    "Empire To-Do save returned invalid data",
  );
}

export async function completeEmpireTodo(itemId: string, timeline: { title: string; notes: string } | null): Promise<EmpireTodoSaveResponse> {
  return runO2StdinPayloadParsedJson<EmpireTodoSaveResponse>("empire.todo.complete", { itemId, timeline }, "Could not complete the Empire To-Do item", "Empire To-Do completion returned invalid data");
}

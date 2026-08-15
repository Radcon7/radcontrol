import {
  runO2ParsedJson,
  runO2StdinPayloadParsedJson,
} from "../common/o2Files";
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

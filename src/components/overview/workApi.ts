import { runO2ParsedJson, runO2StdinPayloadParsedJson } from "../common/o2Client";
import type { WorkResponse } from "./workModel";
function checked(response: WorkResponse): WorkResponse {
  if (!response.ok || !Number.isInteger(response.revision) || !response.data ||
    ![response.data.tasks, response.data.events, response.data.initiatives, response.data.projectNotes].every(Array.isArray))
    throw new Error(response.error || "Operational work unavailable");
  return response;
}
export async function listWork(): Promise<WorkResponse> {
  return checked(await runO2ParsedJson<WorkResponse>("operator.work.list", "Could not load operational work", "Invalid operational work response"));
}
export async function mutateWork(expectedRevision: number, operation: string, value: unknown): Promise<WorkResponse> {
  try {
    return checked(await runO2StdinPayloadParsedJson<WorkResponse>("operator.work.mutate", { expectedRevision, operation, value }, "Could not save operational work", "Invalid work save response"));
  } catch (error) {
    if (String(error).includes("work_revision_conflict_reload")) throw new Error("Work changed in another editor. Your draft is retained. Reload current work before applying it again.");
    throw error;
  }
}

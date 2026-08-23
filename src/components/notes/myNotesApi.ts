import { runO2ParsedJson, runO2StdinPayloadParsedJson } from "../common/o2Client";

export type MyNotesResponse = { ok: boolean; content?: string; updatedAt?: string; error?: string };

export function readMyNotes(): Promise<MyNotesResponse> {
  return runO2ParsedJson("radcontrol.scratchpad.read", "Could not load My Notes", "My Notes returned invalid data");
}

export function saveMyNotes(content: string): Promise<MyNotesResponse> {
  return runO2StdinPayloadParsedJson("radcontrol.scratchpad.write", { content }, "Could not save My Notes", "My Notes returned invalid data");
}

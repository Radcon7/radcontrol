import {
  runO2ParsedJson,
  runO2PayloadParsedJson,
} from "../common/o2Client";
import {
  parsePortStatusBatch,
  parseProjectListEnvelope,
} from "./helpers";
import type { PortStatus, ProjectRow } from "./types";

export async function listGovernedProjects(): Promise<ProjectRow[]> {
  const response = await runO2ParsedJson<unknown>(
    "list_projects",
    "Could not load the governed project registry",
    "list_projects returned invalid JSON",
  );
  return parseProjectListEnvelope(response);
}

export async function loadPortStatuses(
  ports: number[],
): Promise<Record<number, PortStatus>> {
  const response = await runO2PayloadParsedJson<unknown>(
    "port_status.batch",
    { ports },
    "Could not load governed runtime status",
    "port_status.batch returned invalid JSON",
  );
  return parsePortStatusBatch(response, ports);
}

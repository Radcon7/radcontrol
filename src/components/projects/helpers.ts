import type {
  PortStatus,
  ProjectArchetype,
  ProjectKind,
  ProjectOrg,
  ProjectRow,
} from "./types";

export type ValidateAddResult = {
  ok: boolean;
  errors: string[];
};

export function fmtErr(e: unknown): string {
  try {
    if (e instanceof Error) {
      return e.stack || e.message || String(e);
    }
    if (typeof e === "string") return e;
    return JSON.stringify(e, null, 2);
  } catch {
    return String(e);
  }
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

function asNonEmptyString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function asFiniteNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function asBoolean(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}

function asProjectOrg(v: unknown): ProjectOrg | undefined {
  if (typeof v !== "string") return undefined;
  const value = v.trim();
  return value === "radcon" ||
    value === "radwolfe" ||
    value === "other"
    ? value
    : undefined;
}

function asProjectKind(v: unknown): ProjectKind | undefined {
  if (typeof v !== "string") return undefined;
  const value = v.trim();
  return value === "nextjs" ||
    value === "ops" ||
    value === "tauri" ||
    value === "python" ||
    value === "docs" ||
    value === "static" ||
    value === "other"
    ? value
    : undefined;
}

function asProjectArchetype(v: unknown): ProjectArchetype | undefined {
  if (typeof v !== "string") return undefined;
  const value = v.trim();
  return value === "standalone-product" ||
    value === "portal-shell" ||
    value === "portal-private-app" ||
    value === "local-control-plane" ||
    value === "governance" ||
    value === "shared-library" ||
    value === "prototype"
    ? value
    : undefined;
}

function hasField(record: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, field);
}

function optionalStringField(
  record: Record<string, unknown>,
  field: string,
  rowIndex: number,
): string | undefined {
  if (!hasField(record, field)) return undefined;
  const value = asNonEmptyString(record[field]);
  if (!value) {
    throw new Error(`Project registry row ${rowIndex} field ${field} must be a non-empty string.`);
  }
  return value;
}

function optionalBooleanField(
  record: Record<string, unknown>,
  field: string,
  rowIndex: number,
): boolean | undefined {
  if (!hasField(record, field)) return undefined;
  const value = asBoolean(record[field]);
  if (value === undefined) {
    throw new Error(`Project registry row ${rowIndex} field ${field} must be a boolean.`);
  }
  return value;
}

function optionalPortField(
  record: Record<string, unknown>,
  field: string,
  rowIndex: number,
): number | undefined {
  if (!hasField(record, field)) return undefined;
  const value = asFiniteNumber(record[field]);
  if (value === undefined || !Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`Project registry row ${rowIndex} field ${field} must be an integer from 1 through 65535.`);
  }
  return value;
}

export function registryToProjects(reg: unknown): ProjectRow[] {
  if (!Array.isArray(reg)) {
    throw new Error("Project registry must be an array.");
  }

  const projects = reg.map((row, index) => {
    const r = asRecord(row);
    if (!r) {
      throw new Error(`Project registry row ${index} must be an object.`);
    }

    const key = optionalStringField(r, "key", index);
    const label = optionalStringField(r, "label", index);
    const archetype = asProjectArchetype(r.archetype);

    if (!key || !label || !archetype) {
      throw new Error(
        `Project registry row ${index} requires key, label, and a known archetype.`,
      );
    }

    const repoPath = optionalStringField(r, "repoPath", index);
    if (!repoPath || !repoPath.startsWith("/")) {
      throw new Error(`Project registry row ${index} requires an absolute repoPath.`);
    }
    const repoAvailable = optionalBooleanField(r, "repoAvailable", index);
    if (repoAvailable !== true) {
      throw new Error(`Project registry row ${index} (${key}) references an unavailable repository root.`);
    }
    const retired = optionalBooleanField(r, "retired", index);
    if (retired === undefined) {
      throw new Error(`Project registry row ${index} requires a boolean retired field.`);
    }

    const org = hasField(r, "org") ? asProjectOrg(r.org) : undefined;
    if (hasField(r, "org") && !org) {
      throw new Error(`Project registry row ${index} field org is unknown.`);
    }
    const kind = hasField(r, "kind") ? asProjectKind(r.kind) : undefined;
    if (hasField(r, "kind") && !kind) {
      throw new Error(`Project registry row ${index} field kind is unknown.`);
    }

    return {
      key,
      label,
      state: optionalStringField(r, "state", index),
      startDate: optionalStringField(r, "startDate", index),
      retired,
      notesPath: optionalStringField(r, "notesPath", index),
      notesAvailable: optionalBooleanField(r, "notesAvailable", index),
      intakePath: optionalStringField(r, "intakePath", index),
      intakeAvailable: optionalBooleanField(r, "intakeAvailable", index),
      org,
      kind,
      archetype,
      repoPath,
      repoAvailable,
      repoHint: optionalStringField(r, "repoHint", index),
      port: optionalPortField(r, "port", index),
      url: optionalStringField(r, "url", index),
      operatorUrl: optionalStringField(r, "operatorUrl", index),
      websiteUrl: optionalStringField(r, "websiteUrl", index),
      launchUrl: optionalStringField(r, "launchUrl", index),
      launchHostKey: optionalStringField(r, "launchHostKey", index),
      preferredPort: optionalPortField(r, "preferredPort", index),
      preferredUrl: optionalStringField(r, "preferredUrl", index),
      runtimePort: optionalPortField(r, "runtimePort", index),
      runtimeUrl: optionalStringField(r, "runtimeUrl", index),
      runtimeContractPath: optionalStringField(r, "runtimeContractPath", index),
      runtimePortMatchesPreferred: optionalBooleanField(r, "runtimePortMatchesPreferred", index),
      o2StartKey: optionalStringField(r, "o2StartKey", index),
      o2SnapshotKey: optionalStringField(r, "o2SnapshotKey", index),
      o2MapKey: optionalStringField(r, "o2MapKey", index),
      o2ProofPackKey: optionalStringField(r, "o2ProofPackKey", index) ?? `${key}.proofpack`,
    };
  });

  const seenKeys = new Set<string>();
  for (const project of projects) {
    if (seenKeys.has(project.key)) {
      throw new Error(`Project registry contains duplicate key: ${project.key}.`);
    }
    seenKeys.add(project.key);
  }
  return projects;
}

export function parseProjectListEnvelope(value: unknown): ProjectRow[] {
  if (typeof value === "string") {
    throw new Error("list_projects returned legacy double-encoded JSON.");
  }
  if (Array.isArray(value)) {
    throw new Error("list_projects returned a bare project array instead of the required envelope.");
  }
  const envelope = asRecord(value);
  if (!envelope) {
    throw new Error("list_projects returned a non-object response.");
  }
  if (envelope.ok !== true) {
    const error = asNonEmptyString(envelope.error) || "unknown error";
    const message = asNonEmptyString(envelope.message);
    throw new Error(`list_projects reported ${error}${message ? `: ${message}` : "."}`);
  }
  if (!Array.isArray(envelope.projects)) {
    throw new Error("list_projects response omitted the projects array.");
  }
  return registryToProjects(envelope.projects);
}

export function parsePortStatusBatch(
  value: unknown,
  requestedPorts: number[],
): Record<number, PortStatus> {
  const envelope = asRecord(value);
  if (envelope?.ok !== true || !Array.isArray(envelope.ports)) {
    throw new Error("port_status.batch returned an invalid response.");
  }

  const requested = new Set(requestedPorts);
  const next: Record<number, PortStatus> = {};
  for (const [index, item] of envelope.ports.entries()) {
    const row = asRecord(item);
    const port = row ? asFiniteNumber(row.port) : undefined;
    if (
      port === undefined ||
      !Number.isInteger(port) ||
      typeof row?.listening !== "boolean" ||
      !requested.has(port) ||
      next[port]
    ) {
      throw new Error(`port_status.batch row ${index} is invalid.`);
    }
    next[port] = {
      port,
      listening: row.listening,
      pid: null,
      cmd: null,
      err: null,
    };
  }

  if (requestedPorts.some((port) => !next[port])) {
    throw new Error("port_status.batch omitted a requested port.");
  }
  return next;
}

export function validateAdd(args: {
  org?: unknown;
  key?: unknown;
  port?: unknown;
  url?: unknown;
  repo?: unknown;
}): ValidateAddResult {
  const errors: string[] = [];

  const org = typeof args.org === "string" ? args.org.trim() : "";
  const key = typeof args.key === "string" ? args.key.trim() : "";
  const repo = typeof args.repo === "string" ? args.repo.trim() : "";
  const url = typeof args.url === "string" ? args.url.trim() : "";
  const port = args.port;

  const validOrgs: ProjectOrg[] = ["radcon", "radwolfe", "other"];

  if (!org) {
    errors.push("Org is required.");
  } else if (!validOrgs.includes(org as ProjectOrg)) {
    errors.push("Org is invalid.");
  }

  if (!key) {
    errors.push("Key is required.");
  } else if (!/^[a-z0-9._-]+$/i.test(key)) {
    errors.push(
      "Key must use letters, numbers, dots, underscores, or hyphens only.",
    );
  }

  if (!repo) {
    errors.push("Repo path is required.");
  }

  if (port !== undefined) {
    if (
      typeof port !== "number" ||
      !Number.isFinite(port) ||
      port < 1 ||
      port > 65535
    ) {
      errors.push("Port must be a valid number between 1 and 65535.");
    }
  }

  if (url && !/^https?:\/\//i.test(url)) {
    errors.push("URL must start with http:// or https://");
  }

  return { ok: errors.length === 0, errors };
}

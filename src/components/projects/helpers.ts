import type { ProjectOrg, ProjectRow } from "./types";

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

export function registryToProjects(reg: unknown): ProjectRow[] {
  try {
    const regObj = asRecord(reg);
    const arr = Array.isArray(reg)
      ? reg
      : Array.isArray(regObj?.projects)
        ? regObj.projects
        : Array.isArray(regObj?.rows)
          ? regObj.rows
          : [];

    const out: ProjectRow[] = [];

    for (const row of arr) {
      const r = asRecord(row);
      if (!r) continue;

      const key = asNonEmptyString(r.key);
      const label = asNonEmptyString(r.label) ?? key;

      if (!key || !label) continue;

      out.push({
        key,
        label,
        repoHint: asNonEmptyString(r.repoHint),
        port: asFiniteNumber(r.port),
        url: asNonEmptyString(r.url),
        o2StartKey: asNonEmptyString(r.o2StartKey),
        o2SnapshotKey: asNonEmptyString(r.o2SnapshotKey),
        o2CommitKey: asNonEmptyString(r.o2CommitKey),
        o2LabKey: asNonEmptyString(r.o2LabKey),
        o2MapKey: asNonEmptyString(r.o2MapKey),
        o2ProofPackKey: asNonEmptyString(r.o2ProofPackKey),
      });
    }

    return out;
  } catch {
    return [];
  }
}

export function nextPortSuggestion(usedPorts: number[], start = 1420): number {
  try {
    const used = new Set<number>();
    for (const p of usedPorts) {
      if (typeof p === "number" && Number.isFinite(p)) used.add(Math.trunc(p));
    }

    let p = Math.max(1, Math.trunc(start));
    while (p < 65536) {
      if (!used.has(p)) return p;
      p += 1;
    }

    return Math.max(1, Math.trunc(start));
  } catch {
    return Math.max(1, Math.trunc(start));
  }
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

  const validOrgs: ProjectOrg[] = ["radcon", "radwolfe", "labs", "other"];

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

import type { AddProjectPayload, ProjectOrg, ProjectRow } from "./types";

export function fmtErr(e: unknown) {
  if (!e) return "Unknown error";

  if (typeof e === "object") {
    const any = e as any;

    const direct =
      any?.error ??
      any?.message ??
      any?.cause?.error ??
      any?.cause?.message ??
      any?.data?.error ??
      any?.data?.message;

    if (typeof direct === "string" && direct.trim()) return direct;

    if (typeof any?.toString === "function") {
      const s = String(any);
      if (s && s !== "[object Object]") return s;
    }

    try {
      return JSON.stringify(e, null, 2);
    } catch {
      return "[unstringifiable error object]";
    }
  }

  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return String(e);
}

export function slugify(s: string) {
  return (s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function isValidSlug(s: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s);
}

export function asPort(n: string) {
  const v = Number(n);
  if (!Number.isFinite(v)) return undefined;
  if (v < 1 || v > 65535) return undefined;
  return Math.trunc(v);
}

export function inferRepoPath(org: ProjectOrg, key: string) {
  const slug = slugify(key);
  if (!slug) return "";
  if (org === "radcon") return `~/dev/rad-empire/radcon/dev/${slug}`;
  if (org === "radwolfe") return `~/dev/rad-empire/radwolfe/dev/${slug}`;
  if (org === "labs") return `~/dev/rad-empire/radcon/dev/${slug}`;
  return `~/dev/rad-empire/${slug}`;
}

export function validateAdd(
  p: AddProjectPayload,
  usedPorts: Set<number>,
): string | null {
  const key = slugify(p.key);
  if (!key) return "Project Key is required.";
  if (!isValidSlug(key))
    return "Project Key must be lowercase letters/numbers with hyphens only.";
  if (!p.label.trim()) return "Display Name is required.";
  if (!p.repoPath.trim()) return "Repo Path is required.";
  if (p.port != null) {
    if (typeof p.port !== "number" || p.port < 1 || p.port > 65535)
      return "Port must be between 1 and 65535.";
    if (usedPorts.has(p.port)) return `Port ${p.port} is already in use.`;
  }
  return null;
}

/* ------------------------------------------------------------------
   REGISTRY → PROJECT ROWS
   ------------------------------------------------------------------ */

type RegistryEntry = {
  key?: unknown;
  label?: unknown;
  repoHint?: unknown;
  port?: unknown;
  url?: unknown;

  o2StartKey?: unknown;
  o2SnapshotKey?: unknown;
  o2CommitKey?: unknown;
  o2MapKey?: unknown;
  o2ProofPackKey?: unknown;
};

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

export function registryToProjects(registry: any[]): ProjectRow[] {
  const list = Array.isArray(registry) ? (registry as RegistryEntry[]) : [];

  const rows: ProjectRow[] = [];

  for (const r of list) {
    const keyRaw = asString(r.key);
    const key = keyRaw ? slugify(keyRaw) : "";
    if (!key) continue;

    const label = asString(r.label) ?? key;
    const repoHint = asString(r.repoHint);
    const url = asString(r.url);

    const port = asNumber(r.port);

    const o2StartKey = asString(r.o2StartKey);
    const o2SnapshotKey = asString(r.o2SnapshotKey);
    const o2CommitKey = asString(r.o2CommitKey);
    const o2MapKey = asString(r.o2MapKey);
    const o2ProofPackKey = asString(r.o2ProofPackKey);

    rows.push({
      key,
      label,
      repoHint,
      port,
      url,
      o2StartKey,
      o2SnapshotKey,
      o2CommitKey,
      o2MapKey,
      o2ProofPackKey,
    });
  }

  // Stable ordering: by label then key (prevents “random reorder” feel)
  rows.sort((a, b) => {
    const al = (a.label || "").toLowerCase();
    const bl = (b.label || "").toLowerCase();
    if (al < bl) return -1;
    if (al > bl) return 1;
    return (a.key || "").localeCompare(b.key || "");
  });

  return rows;
}

export function nextPortSuggestion(usedPorts: Set<number>) {
  for (let p = 3010; p <= 3099; p++) {
    if (!usedPorts.has(p)) return p;
  }
  for (let p = 3000; p <= 3999; p++) {
    if (!usedPorts.has(p)) return p;
  }
  return undefined;
}

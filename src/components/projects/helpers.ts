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

    if (typeof direct === "object" && direct) {
      const nested = direct?.message ?? direct?.error;
      if (typeof nested === "string" && nested.trim()) return nested;
    }

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
  if (e instanceof Error) return e.message + (e.stack ? `\n${e.stack}` : "");
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
    return "Project Key must be lowercase letters/numbers with hyphens only (e.g. tbis, offroad-croquet).";
  if (!p.label.trim()) return "Display Name is required.";
  if (!p.repoPath.trim()) return "Repo Path is required.";
  if (p.port != null) {
    if (typeof p.port !== "number" || p.port < 1 || p.port > 65535)
      return "Port must be a number between 1 and 65535.";
    if (usedPorts.has(p.port))
      return `Port ${p.port} is already in use by an existing project.`;
  }
  if (p.url && p.port && !p.url.includes(String(p.port))) {
    return "URL doesn’t appear to match the chosen port.";
  }
  return null;
}

/**
 * Registry is the ONLY source of truth.
 * Accepts whatever keys exist; UI must not “invent” rows.
 */
export function registryToProjects(reg: any[]): ProjectRow[] {
  const out: ProjectRow[] = [];
  for (const r of reg) {
    if (!r || typeof r !== "object") continue;
    const key = typeof r.key === "string" ? r.key : "";
    if (!key) continue;

    out.push({
      key,
      label: typeof r.label === "string" ? r.label : key,
      repoHint: typeof r.repoHint === "string" ? r.repoHint : undefined,
      port: typeof r.port === "number" ? r.port : undefined,
      url: typeof r.url === "string" ? r.url : undefined,

      o2StartKey: typeof r.o2StartKey === "string" ? r.o2StartKey : undefined,
      o2SnapshotKey:
        typeof r.o2SnapshotKey === "string" ? r.o2SnapshotKey : undefined,
      o2CommitKey:
        typeof r.o2CommitKey === "string" ? r.o2CommitKey : undefined,
      o2MapKey: typeof r.o2MapKey === "string" ? r.o2MapKey : undefined,
      o2ProofPackKey:
        typeof r.o2ProofPackKey === "string" ? r.o2ProofPackKey : undefined,
    });
  }

  // stable ordering (optional but nice)
  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
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

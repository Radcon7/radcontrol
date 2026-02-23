import type { ProjectRow, PortStatus } from "./types";

/**
 * AddProjectModal expects these named exports:
 *   slugify, inferRepoPath, asPort, validateAdd
 *
 * Keep them deterministic and UI-safe.
 */

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Safe error formatter used by App/logging.
 * Must be a named export (fmtErr).
 */
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

/**
 * Convert a registry payload into ProjectRow[] for the UI.
 * Must never throw. Keeps parsing permissive; O2 remains authoritative.
 */
export function registryToProjects(reg: unknown): ProjectRow[] {
  try {
    const arr = Array.isArray(reg)
      ? reg
      : Array.isArray((reg as any)?.projects)
        ? (reg as any).projects
        : Array.isArray((reg as any)?.rows)
          ? (reg as any).rows
          : [];

    const out: ProjectRow[] = [];
    for (const row of arr) {
      if (row && typeof row === "object") out.push(row as ProjectRow);
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Given a list of used ports, suggest the next free one.
 * Signature matches App.tsx: nextPortSuggestion(usedPorts: number[]) => number
 */
export function nextPortSuggestion(usedPorts: number[], start = 1420): number {
  try {
    const used = new Set<number>();
    for (const p of usedPorts) {
      if (typeof p === "number" && Number.isFinite(p)) used.add(Math.trunc(p));
    }

    let p = Math.max(1, Math.trunc(start));
    while (p < 65536) {
      if (!used.has(p)) return p;
      p++;
    }
    return Math.max(1, Math.trunc(start));
  } catch {
    return Math.max(1, Math.trunc(start));
  }
}

/**
 * Best-effort repo path inference from a key + org.
 * This is UI-only convenience; O2 is still the operational authority.
 */
export function inferRepoPath(args: { org?: string; key: string }): string {
  const org = (args.org || "").trim();
  const key = slugify(args.key);
  if (org.length > 0 && key.length > 0)
    return `$HOME/dev/rad-empire/${org}/dev/${key}`;
  if (key.length > 0) return `$HOME/dev/${key}`;
  return "";
}

/**
 * Normalize a port input safely. Returns null when invalid.
 */
export function asPort(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0 && v < 65536)
    return Math.trunc(v);
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0 || n >= 65536) return null;
  return Math.trunc(n);
}

export type ValidateAddResult = {
  ok: boolean;
  errors: string[];
};

/**
 * Minimal deterministic validation for Add Project inputs.
 * Does not hit the filesystem. Does not assume O2. UI-only.
 */
export function validateAdd(args: {
  org?: unknown;
  key?: unknown;
  port?: unknown;
  url?: unknown;
  repo?: unknown;
}): ValidateAddResult {
  const errors: string[] = [];

  const org = typeof args.org === "string" ? args.org.trim() : "";
  const keyRaw = typeof args.key === "string" ? args.key.trim() : "";
  const key = slugify(keyRaw);

  if (keyRaw.length === 0) errors.push("Key is required.");
  if (keyRaw.length > 0 && key.length === 0) errors.push("Key is invalid.");

  // org is optional, but if present, keep it simple
  if (org.length > 0 && !/^[a-z0-9_-]+$/i.test(org))
    errors.push("Org contains invalid characters.");

  const p = asPort(args.port);
  if (args.port !== undefined && args.port !== null && p === null)
    errors.push("Port must be a number between 1 and 65535.");

  const url = typeof args.url === "string" ? args.url.trim() : "";
  if (url.length > 0 && !/^https?:\/\//i.test(url))
    errors.push("URL must start with http:// or https://");

  const repo = typeof args.repo === "string" ? args.repo.trim() : "";
  if (repo.length > 0 && !repo.startsWith("$HOME/") && !repo.startsWith("/")) {
    errors.push("Repo path should be absolute (/...) or start with $HOME/...");
  }

  return { ok: errors.length === 0, errors };
}

export type RowStatus = {
  pill: string; // CSS class suffix (kept flexible to match existing styles)
  text: string;
};

function hasNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Canonical, UI-safe status computation.
 * - Does NOT assume ports are loaded.
 * - Does NOT throw.
 * - Keeps pill values generic so we don't break existing CSS.
 */
export function statusForRowBasic(p: ProjectRow): RowStatus {
  // If the registry row itself is missing a port, that's a config issue.
  if (!isFiniteNumber((p as any).port)) {
    return { pill: "pillMuted", text: "No port" };
  }

  // If URL is missing, treat as configured but incomplete.
  if (!hasNonEmptyString((p as any).url)) {
    return { pill: "pillWarn", text: "Configured" };
  }

  return { pill: "pillMuted", text: "Known" };
}

/**
 * Preferred status function: uses live port status.
 * This is intentionally a factory so App can memoize it.
 */
export function makeStatusForRow(
  ports: Record<number, PortStatus | undefined>,
  portsBusy: boolean,
): (p: ProjectRow) => RowStatus {
  return (p: ProjectRow) => {
    try {
      const port = (p as any).port;

      if (!isFiniteNumber(port)) {
        return { pill: "pillMuted", text: "No port" };
      }

      if (portsBusy) {
        return { pill: "pillMuted", text: "Checking…" };
      }

      const s = ports[port];
      if (!s) {
        // Ports fetched, but no row for that port (treat as not running)
        return { pill: "pillMuted", text: "Stopped" };
      }

      if (s.listening) {
        return { pill: "pillOk", text: "Running" };
      }

      return { pill: "pillMuted", text: "Stopped" };
    } catch {
      // Never break rendering due to a status calc issue
      return { pill: "pillWarn", text: "Unknown" };
    }
  };
}

/**
 * Deterministic sort to keep UI stable.
 * (If you already sort upstream, you can ignore this.)
 */
export function sortProjectsStable(rows: ProjectRow[]): ProjectRow[] {
  const copy = rows.slice();
  copy.sort((a: any, b: any) => {
    const orgA = hasNonEmptyString(a.org) ? a.org : "";
    const orgB = hasNonEmptyString(b.org) ? b.org : "";
    if (orgA !== orgB) return orgA.localeCompare(orgB);

    const labelA = hasNonEmptyString(a.label) ? a.label : "";
    const labelB = hasNonEmptyString(b.label) ? b.label : "";
    if (labelA !== labelB) return labelA.localeCompare(labelB);

    const keyA = hasNonEmptyString(a.key) ? a.key : "";
    const keyB = hasNonEmptyString(b.key) ? b.key : "";
    return keyA.localeCompare(keyB);
  });
  return copy;
}

/**
 * Optional helper: UI copy for why kill is disabled.
 * Keep this centralized so the UI stays consistent.
 */
export function killDisabledReasonText(args: {
  busy: boolean;
  portsBusy: boolean;
}): string {
  if (args.busy) return "Busy running an O2 action…";
  if (args.portsBusy) return "Refreshing ports…";
  return "";
}

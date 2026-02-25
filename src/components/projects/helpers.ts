import type { ProjectRow, PortStatus } from "./types";

export const PROJECT_CREATE_LIMITS = {
  nameMaxChars: 80,
  slugMaxChars: 80,
  essayMaxChars: 8000,
  templateHintMaxChars: 8000,
  payloadTokenMaxChars: 20000,
} as const;

/**
 * AddProjectModal expects these named exports:
 *   slugify, validateAdd
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
    const regObj = reg && typeof reg === "object" ? (reg as Record<string, unknown>) : null;
    const arr = Array.isArray(reg)
      ? reg
      : Array.isArray(regObj?.projects)
        ? regObj.projects
        : Array.isArray(regObj?.rows)
          ? regObj.rows
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

export type ValidateAddResult = {
  ok: boolean;
  errors: string[];
};

/**
 * Minimal deterministic validation for Add Project inputs.
 * Does not hit the filesystem. Does not assume O2. UI-only.
 */
export function validateAdd(args: {
  name?: unknown;
  slug?: unknown;
  essay?: unknown;
  templateHint?: unknown;
}): ValidateAddResult {
  const errors: string[] = [];
  const name = typeof args.name === "string" ? args.name.trim() : "";
  const slugRaw = typeof args.slug === "string" ? args.slug.trim() : "";
  const slug = slugify(slugRaw);
  const essay = typeof args.essay === "string" ? args.essay.trim() : "";
  const templateHint =
    typeof args.templateHint === "string" ? args.templateHint.trim() : "";

  if (name.length === 0) errors.push("Name is required.");
  if (name.length > PROJECT_CREATE_LIMITS.nameMaxChars) {
    errors.push(
      `Name must be ${PROJECT_CREATE_LIMITS.nameMaxChars} characters or fewer.`,
    );
  }
  if (slugRaw.length === 0) errors.push("Slug is required.");
  if (slugRaw.length > PROJECT_CREATE_LIMITS.slugMaxChars) {
    errors.push(
      `Slug must be ${PROJECT_CREATE_LIMITS.slugMaxChars} characters or fewer.`,
    );
  }
  if (slugRaw.length > 0 && slug.length === 0) errors.push("Slug is invalid.");
  if (slugRaw.length > 0 && slug !== slugRaw) {
    errors.push("Slug must use lowercase letters, numbers, and hyphens only.");
  }
  if (essay.length === 0) errors.push("Essay is required.");
  if (essay.length > PROJECT_CREATE_LIMITS.essayMaxChars) {
    errors.push(
      `Essay must be ${PROJECT_CREATE_LIMITS.essayMaxChars} characters or fewer.`,
    );
  }
  if (templateHint.length > PROJECT_CREATE_LIMITS.templateHintMaxChars) {
    errors.push(
      `Template hint must be ${PROJECT_CREATE_LIMITS.templateHintMaxChars} characters or fewer.`,
    );
  }
  if (templateHint.length > 0 && !/^[a-z0-9_-]+$/i.test(templateHint)) {
    errors.push("Template hint contains invalid characters.");
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
  if (!isFiniteNumber(p.port)) {
    return { pill: "pillMuted", text: "No port" };
  }

  // If URL is missing, treat as configured but incomplete.
  if (!hasNonEmptyString(p.url)) {
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
      const port = p.port;

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
  copy.sort((a, b) => {
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

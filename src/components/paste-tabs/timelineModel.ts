export type TimelineMilestone = {
  path: string;
  fileName: string;
  title: string;
  date: string;
  category: string;
  notes: string;
  createdAt: string;
  mtime?: number;
};

export type NewMilestoneInput = {
  title: string;
  date: string;
  category: string;
  notes: string;
};


function normalizeTimelinePath(path: string): string {
  const clean = path.replace(/\\/g, "/").replace(/^\/+/, "").trim();
  return clean.startsWith("docs/") ? clean : `docs/${clean}`;
}

function fileNameFromPath(path: string): string {
  const normalized = normalizeTimelinePath(path);
  const parts = normalized.split("/");
  return parts[parts.length - 1] || normalized;
}

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    if (trimmed.startsWith('"')) { try { return JSON.parse(trimmed) as string; } catch { /* preserve legacy quoted text */ } }
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseFrontmatter(content: string): Record<string, string> {
  const text = content.replace(/\r\n/g, "\n");
  if (!text.startsWith("---\n")) return {};

  const end = text.indexOf("\n---\n", 4);
  if (end === -1) return {};

  const block = text.slice(4, end);
  const out: Record<string, string> = {};

  for (const rawLine of block.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const idx = line.indexOf(":");
    if (idx === -1) continue;

    const key = line.slice(0, idx).trim().toLowerCase();
    const value = stripQuotes(line.slice(idx + 1).trim());
    out[key] = value;
  }

  return out;
}

export function buildMilestoneFromContent(
  path: string,
  content: string,
  mtime?: number,
): TimelineMilestone {
  const meta = parseFrontmatter(content);
  const fileName = fileNameFromPath(path);

  return {
    path,
    fileName,
    title: meta.title || fileName.replace(/\.md$/i, ""),
    date: meta.date || "",
    category: meta.category || "",
    notes: meta.notes || "",
    createdAt: meta.created || "",
    mtime,
  };
}

export function compareMilestones(a: TimelineMilestone, b: TimelineMilestone): number {
  const da = a.date || "";
  const db = b.date || "";
  if (da !== db) return da.localeCompare(db);

  const ca = a.createdAt || "";
  const cb = b.createdAt || "";
  if (ca !== cb) return ca.localeCompare(cb);

  return a.fileName.localeCompare(b.fileName);
}

export function makeTimestampStamp(now = new Date()): string {
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
}

export function slugifyTitle(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "milestone";
}

function escapeYamlDoubleQuoted(value: string): string {
  return JSON.stringify(value.replace(/\s+/g, " ").trim()).slice(1, -1);
}

export function buildMilestoneFileContent(
  input: NewMilestoneInput,
  now = new Date(),
): string {
  const created = now.toISOString();

  return [
    "---",
    `title: "${escapeYamlDoubleQuoted(input.title.trim())}"`,
    `date: "${escapeYamlDoubleQuoted(input.date.trim())}"`,
    `category: "${escapeYamlDoubleQuoted(input.category.trim())}"`,
    `notes: "${escapeYamlDoubleQuoted(
      input.notes.trim().replace(/\r\n/g, "\n").replace(/\n/g, " "),
    )}"`,
    `created: "${created}"`,
    "---",
    "",
  ].join("\n");
}


export function validEventDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function localEventDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
}
export function timelinePresentation(item: TimelineMilestone): { title: string; body: string; date: string } {
  return { title: item.title || item.notes || "Untitled milestone", body: item.notes === item.title ? "" : item.notes, date: validEventDate(item.date) ? item.date : "" };
}

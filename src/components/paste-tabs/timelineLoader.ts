import {
  listO2Files,
  normalizeO2Path,
  readO2File,
  writeO2File,
} from "../common/o2Files";

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

const TIMELINE_DIR = "docs/radcontrol/timeline";
function normalizeTimelinePath(path: string): string {
  return normalizeO2Path(path).replace(/\\/g, "/").trim();
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

function buildMilestoneFromContent(
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

function compareMilestones(a: TimelineMilestone, b: TimelineMilestone): number {
  const da = a.date || "";
  const db = b.date || "";
  if (da !== db) return da.localeCompare(db);

  const ca = a.createdAt || "";
  const cb = b.createdAt || "";
  if (ca !== cb) return ca.localeCompare(cb);

  return a.fileName.localeCompare(b.fileName);
}

function makeTimestampStamp(now = new Date()): string {
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
}

function slugifyTitle(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "milestone";
}

function escapeYamlDoubleQuoted(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildMilestoneFileContent(
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

export async function listTimelineMilestones(): Promise<TimelineMilestone[]> {
  const listJson = await listO2Files(TIMELINE_DIR);

  const items = (listJson.items || [])
    .filter((item) => typeof item.path === "string")
    .map((item) => ({
      path: normalizeTimelinePath(item.path || ""),
      mtime: typeof item.mtime === "number" ? item.mtime : undefined,
    }))
    .filter(
      (item) =>
        item.path.startsWith(`${TIMELINE_DIR}/`) && item.path.endsWith(".md"),
    )
    .sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0));

  const milestones = await Promise.all(
    items.map(async (item) => {
      const readJson = await readO2File(item.path);

      return buildMilestoneFromContent(
        item.path,
        readJson.content || "",
        item.mtime,
      );
    }),
  );

  return milestones.sort(compareMilestones);
}

export async function createTimelineMilestone(
  input: NewMilestoneInput,
): Promise<TimelineMilestone> {
  const title = input.title.trim();
  const date = input.date.trim();
  const category = input.category.trim();
  const notes = input.notes.trim();

  if (!title) throw new Error("Title is required.");
  if (!date) throw new Error("Date is required.");

  const now = new Date();
  const stamp = makeTimestampStamp(now);
  const slug = slugifyTitle(title);
  const path = `${TIMELINE_DIR}/${stamp}_${slug}.md`;
  const content = buildMilestoneFileContent(
    { title, date, category, notes },
    now,
  );

  const payload = {
    path,
    content,
  };

  const writeJson = await writeO2File(payload);

  const canonicalPath = normalizeTimelinePath(writeJson.path || path);

  const readJson = await readO2File(canonicalPath);

  return buildMilestoneFromContent(
    canonicalPath,
    readJson.content || content,
    writeJson.mtime,
  );
}

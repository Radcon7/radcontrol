import { invoke } from "@tauri-apps/api/core";

type RunO2Result = {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
};

type FilesListItem = {
  kind?: string;
  path?: string;
  mtime?: number;
  bytes?: number;
};

type FilesListJson = {
  ok?: boolean;
  root?: string;
  docs_dir?: string;
  items?: FilesListItem[];
  error?: string;
};

type FilesReadJson = {
  ok?: boolean;
  path?: string;
  content?: string;
  bytes?: number;
  mtime?: number;
  error?: string;
};

type FilesWriteJson = {
  ok?: boolean;
  path?: string;
  mtime?: number;
  bytes?: number;
  committed?: boolean;
  commitMessage?: string | null;
  error?: string;
};

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

function normalizeO2Path(path: string): string {
  return (path || "").replace(/\\/g, "/").trim();
}

function fileNameFromPath(path: string): string {
  const normalized = normalizeO2Path(path);
  const parts = normalized.split("/");
  return parts[parts.length - 1] || normalized;
}

function b64urlEncodeUtf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function runO2(verb: string): Promise<RunO2Result> {
  return (await invoke("run_o2", { verb })) as RunO2Result;
}

function errMsg(res: RunO2Result, fallback: string): string {
  const stderr = (res.stderr || "").trim();
  const stdout = (res.stdout || "").trim();
  return stderr || stdout || fallback;
}

function parseJson<T>(text: string): T {
  return JSON.parse(text) as T;
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
  const listRes = await runO2("files.list");
  if (!listRes.ok) {
    throw new Error(errMsg(listRes, "files.list failed"));
  }

  let listJson: FilesListJson;
  try {
    listJson = parseJson<FilesListJson>(listRes.stdout);
  } catch {
    throw new Error("files.list returned invalid JSON");
  }

  if (!listJson.ok) {
    throw new Error(listJson.error || "files.list returned error");
  }

  const items = (listJson.items || [])
    .filter((item) => typeof item.path === "string")
    .map((item) => ({
      path: normalizeO2Path(item.path || ""),
      mtime: typeof item.mtime === "number" ? item.mtime : undefined,
    }))
    .filter(
      (item) =>
        item.path.startsWith(`${TIMELINE_DIR}/`) && item.path.endsWith(".md"),
    )
    .sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0));

  const milestones = await Promise.all(
    items.map(async (item) => {
      const readRes = await runO2(`files.read.${b64urlEncodeUtf8(item.path)}`);
      if (!readRes.ok) {
        throw new Error(errMsg(readRes, `files.read failed for ${item.path}`));
      }

      let readJson: FilesReadJson;
      try {
        readJson = parseJson<FilesReadJson>(readRes.stdout);
      } catch {
        throw new Error("files.read returned invalid JSON");
      }

      if (!readJson.ok) {
        throw new Error(
          readJson.error || `files.read returned error for ${item.path}`,
        );
      }

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
    commit: true,
    commitMessage: `timeline: add milestone ${title}`,
  };

  const writeRes = await runO2(
    `files.write.${b64urlEncodeUtf8(JSON.stringify(payload))}`,
  );
  if (!writeRes.ok) {
    throw new Error(errMsg(writeRes, "files.write failed"));
  }

  let writeJson: FilesWriteJson;
  try {
    writeJson = parseJson<FilesWriteJson>(writeRes.stdout);
  } catch {
    throw new Error("files.write returned invalid JSON");
  }

  if (!writeJson.ok) {
    throw new Error(writeJson.error || "files.write returned error");
  }

  const canonicalPath = normalizeO2Path(writeJson.path || path);

  const readRes = await runO2(`files.read.${b64urlEncodeUtf8(canonicalPath)}`);
  if (!readRes.ok) {
    throw new Error(errMsg(readRes, "post-write files.read failed"));
  }

  let readJson: FilesReadJson;
  try {
    readJson = parseJson<FilesReadJson>(readRes.stdout);
  } catch {
    throw new Error("post-write files.read returned invalid JSON");
  }

  if (!readJson.ok) {
    throw new Error(readJson.error || "post-write files.read returned error");
  }

  return buildMilestoneFromContent(
    canonicalPath,
    readJson.content || content,
    writeJson.mtime,
  );
}

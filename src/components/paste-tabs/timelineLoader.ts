import { listO2Files, normalizeO2Path, readO2File, writeO2File } from "../common/o2Files";
import { buildMilestoneFromContent, compareMilestones, makeTimestampStamp, slugifyTitle, buildMilestoneFileContent, validEventDate, type TimelineMilestone, type NewMilestoneInput } from "./timelineModel";
export type { TimelineMilestone, NewMilestoneInput } from "./timelineModel";
const TIMELINE_DIR = "docs/radcontrol/timeline";
function normalizeTimelinePath(path: string): string { return normalizeO2Path(path).replace(/\\/g, "/").trim(); }

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
  if (!validEventDate(date)) throw new Error("Enter a valid event date.");

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

  return buildMilestoneFromContent(
    canonicalPath,
    content,
    writeJson.mtime,
  );
}

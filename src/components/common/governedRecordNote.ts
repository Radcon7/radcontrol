import { writeO2File } from "./o2Files";

/** The one durable write path for dashboard record notes. */
export async function persistGovernedRecordNote(
  path: string,
  content: string,
): Promise<number> {
  const result = await writeO2File({ path, content });
  return typeof result.mtime === "number" ? result.mtime : Date.now();
}

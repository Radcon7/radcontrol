import { writeO2File } from "./o2Files";
import { fileTimestamp } from "./fileTimestamp";

/** The one durable write path for dashboard record notes. */
export async function persistGovernedRecordNote(
  path: string,
  content: string,
): Promise<number | null> {
  const result = await writeO2File({ path, content });
  return fileTimestamp(result.mtime);
}

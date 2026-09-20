/** O2 file verbs return Unix seconds; accept modern millisecond responses explicitly too. */
export function fileTimestamp(value: unknown, unit: "seconds" | "milliseconds" | "auto" = "auto"): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  const milliseconds = unit === "seconds" || (unit === "auto" && value < 1_000_000_000_000) ? value * 1000 : value;
  return Number.isNaN(new Date(milliseconds).getTime()) ? null : milliseconds;
}

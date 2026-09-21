import type { WorkResponse } from "../overview/workModel";

// A successful Work read has already passed the private-v1 handshake and the
// O2 owner's activation, schema, ownership and lock checks. File presence alone
// is never an authority claim. This client must not fall back to legacy verbs.
export function workReadiness(work: WorkResponse | null, privateFileAvailable: boolean, error = "") {
  if (work?.ok && work.authority === "legacy-readonly" && work.revision === 0 &&
      work.data.initiatives.length === 0 && !privateFileAvailable) {
    return { state: "bridge", ready: true, authority: "Legacy compatibility bridge",
      activation: "Not activated", editing: "Temporarily read-only until activation", error: "" } as const;
  }
  if (work?.ok && work.authority === "private" && Number.isInteger(work.revision) &&
      work.revision > 0 && privateFileAvailable) {
    return { state: "private", ready: true, authority: "Private Work store",
      activation: "Activated", editing: "Enabled", error: "" } as const;
  }
  const recovery = work !== null || /work_[a-z_]+/.test(error);
  return { state: recovery ? "recovery-error" : "unavailable", ready: false,
    authority: recovery ? "Recovery required" : "Unavailable",
    activation: "Not verified", editing: "Unavailable",
    error: error || "Work authority could not be verified." } as const;
}

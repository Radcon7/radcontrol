export type ProjectKey = string;

export type ProjectRow = {
  key: ProjectKey;
  label: string;
  repoHint?: string;
  port?: number;
  url?: string;

  // O2 hooks (all optional; UI must not assume they exist)
  o2StartKey?: string;
  o2SnapshotKey?: string;
  o2CommitKey?: string;

  // Map/ProofPack are "read-only truth artifacts"
  o2MapKey?: string;
  o2ProofPackKey?: string;
};

export type ProjectOrg = "radcon" | "radwolfe" | "labs" | "other";
export type ProjectKind =
  | "nextjs"
  | "tauri"
  | "python"
  | "docs"
  | "static"
  | "other";

export type AddProjectPayload = {
  // Identity
  key: string; // slug, e.g. "tbis"
  label: string; // display name
  org: ProjectOrg;

  // Location
  repoPath: string; // full path
  repoHint?: string; // brief hint shown in list

  // Runtime
  kind: ProjectKind;
  port?: number;
  url?: string;

  // O2 hooks (optional)
  o2StartKey?: string;
  o2SnapshotKey?: string;
  o2CommitKey?: string;
  o2MapKey?: string;
  o2ProofPackKey?: string;

  // Notes
  notes?: string;
};

export type PortStatus = {
  port: number;
  listening: boolean;
  pid?: number | null;
  cmd?: string | null;
  err?: string | null;
};

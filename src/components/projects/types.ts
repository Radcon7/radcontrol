export type ProjectKey = string;

export type ProjectRow = {
  key: ProjectKey;
  label: string;

  // Display hints
  repoHint?: string;

  // Runtime
  port?: number;
  url?: string;

  // O2 hooks (all optional; UI must not assume they exist)
  o2StartKey?: string;
  o2SnapshotKey?: string;
  o2CommitKey?: string;

  // Map / ProofPack
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

/**
 * What the Add Project modal produces.
 * This may contain extra structure that is reduced
 * down to a ProjectRow when saved into projects.json.
 */
export type AddProjectPayload = {
  key: string; // slug (e.g. "tbis")
  label: string; // display name

  // Meta (not necessarily persisted 1:1 to registry)
  org: ProjectOrg;
  kind: ProjectKind;

  // Location
  repoPath: string; // full path (source of truth)
  repoHint?: string; // short hint shown in UI

  // Runtime
  port?: number;
  url?: string;

  // O2 hooks (optional)
  o2StartKey?: string;
  o2SnapshotKey?: string;
  o2CommitKey?: string;
  o2MapKey?: string;
  o2ProofPackKey?: string;

  notes?: string;
};

export type PortStatus = {
  port: number;
  listening: boolean;
  pid?: number | null;
  cmd?: string | null;
  err?: string | null;
};

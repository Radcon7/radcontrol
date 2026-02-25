export type ProjectKey = string;

export type ProjectRow = {
  key: ProjectKey;
  label: string;
  org?: ProjectOrg;
  kind?: ProjectKind;

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
 * This is forwarded to O2 plan as the only project-create action.
 */
export type AddProjectPayload = {
  name: string;
  slug: string;
  essay: string;
  templateHint?: string;
};

export type PortStatus = {
  port: number;
  listening: boolean;
  pid?: number | null;
  cmd?: string | null;
  err?: string | null;
};

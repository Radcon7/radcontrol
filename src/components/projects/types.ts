export type ProjectKey = string;

export type ProjectRow = {
  key: ProjectKey;
  label: string;
  state?: string;
  startDate?: string;
  retired?: boolean;
  notesPath?: string;
  notesAvailable?: boolean;
  intakePath?: string;
  intakeAvailable?: boolean;
  org?: ProjectOrg;
  kind?: ProjectKind;
  archetype?: ProjectArchetype;
  repoPath?: string;
  repoAvailable?: boolean;

  // Display hints
  repoHint?: string;

  // Runtime
  port?: number;
  url?: string;
  /** Role-scoped Radcon Enterprises destination for embedded operator work. */
  operatorUrl?: string;
  /** Public/live website destination. Never use a preview deployment here. */
  websiteUrl?: string;
  /** Preferred final browser route for a local runtime. */
  launchUrl?: string;
  launchHostKey?: string;
  preferredPort?: number;
  preferredUrl?: string;
  runtimePort?: number;
  runtimeUrl?: string;
  runtimeContractPath?: string;
  runtimePortMatchesPreferred?: boolean;

  // O2 hooks (all optional; UI must not assume they exist)
  o2StartKey?: string;
  o2SnapshotKey?: string;

  // Map / ProofPack
  o2MapKey?: string;
  o2ProofPackKey?: string;
};

export type ProjectOrg = "radcon" | "radwolfe" | "other";
export type ProjectRootOverrides = Partial<Record<ProjectOrg, string>>;

export type ProjectKind =
  | "nextjs"
  | "ops"
  | "tauri"
  | "python"
  | "docs"
  | "static"
  | "other";

export type ProjectArchetype =
  | "standalone-product"
  | "portal-shell"
  | "portal-private-app"
  | "local-control-plane"
  | "governance"
  | "shared-library"
  | "prototype";

export type ProjectClass =
  | "info_website"
  | "business_website"
  | "private_portal"
  | "physical_store"
  | "vacation_plan"
  | "asset_review"
  | "data_analysis"
  | "data_collection_display"
  | "internal_operations"
  | "docs_knowledge_surface"
  | "other";

export type ProjectDeliverySurface =
  | "public_website"
  | "private_portal"
  | "local_dashboard"
  | "desktop_app"
  | "docs_surface"
  | "data_surface"
  | "operations_workspace";

export type ProjectGoogleWorkspacePlan =
  | "no"
  | "day_one"
  | "later"
  | "unknown";

export type ProjectAccessModel =
  | "public"
  | "internal_login"
  | "family_partner_roles"
  | "role_based_private"
  | "local_only"
  | "mixed"
  | "unknown";

export type ProjectSecurityPosture =
  | "standard"
  | "elevated"
  | "high_security";

export type ProjectBuildStrategy =
  | "guided_followup"
  | "agent_planned_build"
  | "research_first";

export type ProjectFoundationBlueprint =
  | "o2_web_foundation_v1";

/**
 * What the Add Project modal produces.
 * This may contain extra structure that is reduced
 * down to a ProjectRow when saved into projects.json.
 */
export type AddProjectPayload = {
  key: string; // slug (e.g. "tbis")
  label: string; // display name
  bootstrapNow?: boolean;

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
  o2MapKey?: string;
  o2ProofPackKey?: string;

  // Formation intake metadata
  projectType?: string;
  intent?: NewProjectIntent;
  relationship?: NewProjectRelationship;
  parentProjectKey?: string;
  similarProjectKey?: string;
  referenceRepos?: string;
  projectClass?: ProjectClass;
  projectArchetype?: ProjectArchetype;
  deliverySurface?: ProjectDeliverySurface;
  productSurface?: "standalone" | "none";
  operatorSurface?: "embedded" | "none";
  problemStatement?: string;
  valueProposition?: string;
  goalSummary?: string;
  intendedUsers?: string;
  domainIntent?: string;
  googleWorkspacePlan?: ProjectGoogleWorkspacePlan;
  accessModel?: ProjectAccessModel;
  securityPosture?: ProjectSecurityPosture;
  buildStrategy?: ProjectBuildStrategy;
  needsAuthentication?: boolean;
  handlesSensitiveData?: boolean;
  launchLocalFirst?: boolean;
  foundationBlueprint?: ProjectFoundationBlueprint;
  needsAdminSurface?: boolean;
  needsCommerceSurface?: boolean;
  needsPersistentData?: boolean;
  needsFileUploads?: boolean;
  needsEmailDelivery?: boolean;
  needsOperatorSurface?: boolean;
  needsHostedDelivery?: boolean;
  similarityNotes?: string;
  mission?: string;
  initialConstraints?: string;
  approvedProjectIntentDigest?: string;
  openQuestions?: string;

  notes?: string;
};
export type NewProjectIntent = "production";

export type NewProjectRelationship =
  | "new"
  | "version_successor"
  | "reference_project";

export type NewProjectIntakePayload = {
  key: string;
  displayName: string;
  mission: string;
  projectType: string;
  intent: NewProjectIntent;
  relationship: NewProjectRelationship;
  parentProjectKey?: string;
  similarProjectKey?: string;
  referenceRepos?: string;
  projectClass?: ProjectClass;
  projectArchetype?: ProjectArchetype;
  deliverySurface?: ProjectDeliverySurface;
  productSurface?: "standalone" | "none";
  operatorSurface?: "embedded" | "none";
  problemStatement?: string;
  valueProposition?: string;
  goalSummary?: string;
  intendedUsers?: string;
  domainIntent?: string;
  googleWorkspacePlan?: ProjectGoogleWorkspacePlan;
  accessModel?: ProjectAccessModel;
  securityPosture?: ProjectSecurityPosture;
  buildStrategy?: ProjectBuildStrategy;
  needsAuthentication?: boolean;
  handlesSensitiveData?: boolean;
  launchLocalFirst?: boolean;
  foundationBlueprint?: ProjectFoundationBlueprint;
  needsAdminSurface?: boolean;
  needsCommerceSurface?: boolean;
  needsPersistentData?: boolean;
  needsFileUploads?: boolean;
  needsEmailDelivery?: boolean;
  needsOperatorSurface?: boolean;
  needsHostedDelivery?: boolean;
  similarityNotes?: string;
  initialConstraints?: string;
  approvedProjectIntentDigest?: string;
  openQuestions?: string;
};

export type PortStatus = {
  port: number;
  listening: boolean;
  pid?: number | null;
  cmd?: string | null;
  err?: string | null;
};

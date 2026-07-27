import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type {
  AddProjectPayload,
  ProjectAccessModel,
  ProjectBuildStrategy,
  ProjectClass,
  ProjectDeliverySurface,
  ProjectGoogleWorkspacePlan,
  ProjectInitialSectionSet,
  ProjectKind,
  ProjectOrg,
  ProjectSecurityPosture,
  ProjectShellPreference,
} from "./types";
import { validateAdd } from "./helpers";

type NewProjectType =
  | "new_website"
  | "website_successor"
  | "standalone_app"
  | "internal_tool"
  | "docs_surface"
  | "service_worker"
  | "other";

type RelationChoice = "net_new" | "similar_to_existing" | "website_successor";

export type AddProjectModalPrefill = {
  projectType?: NewProjectType;
  relatedProjectKey?: string;
};

export type GovernedPortSuggestion = {
  port?: number;
  url?: string;
};

export type GovernedStarterPattern = {
  key: string;
  label: string;
  summary: string;
  kinds: string[];
  projectClasses: string[];
  deliverySurfaces: string[];
  bootstrapMode?: string;
  repoContracts?: string[];
  starterArtifacts?: string[];
  securityPosture?: string;
  artifactPath?: string;
};

const PROJECT_CLASS_OPTIONS: Array<{ value: ProjectClass; label: string }> = [
  { value: "info_website", label: "Info website / content site" },
  { value: "business_website", label: "Business website / lead surface" },
  { value: "private_portal", label: "Private portal / member workspace" },
  { value: "physical_store", label: "Physical store / local business support" },
  { value: "vacation_plan", label: "Vacation plan / trip planner" },
  { value: "asset_review", label: "Asset review / portfolio review" },
  { value: "data_analysis", label: "Data analysis / reporting workspace" },
  {
    value: "data_collection_display",
    label: "Collect data and display it",
  },
  { value: "internal_operations", label: "Internal operations / command center" },
  { value: "docs_knowledge_surface", label: "Docs / knowledge base" },
  { value: "other", label: "Other" },
];

const RELATION_OPTIONS: Array<{ value: RelationChoice; label: string }> = [
  { value: "net_new", label: "Net-new project" },
  { value: "similar_to_existing", label: "Borrow ideas from an existing project" },
  {
    value: "website_successor",
    label: "Successor to an existing website",
  },
];

const DELIVERY_SURFACE_OPTIONS: Array<{
  value: ProjectDeliverySurface;
  label: string;
}> = [
  { value: "public_website", label: "Public website" },
  { value: "private_portal", label: "Private portal / login surface" },
  { value: "local_dashboard", label: "Localhost dashboard" },
  { value: "desktop_app", label: "Desktop app" },
  { value: "docs_surface", label: "Docs / reference surface" },
  { value: "data_surface", label: "Data collection / display surface" },
  { value: "operations_workspace", label: "Operations workspace" },
];

const GOOGLE_WORKSPACE_OPTIONS: Array<{
  value: ProjectGoogleWorkspacePlan;
  label: string;
}> = [
  { value: "no", label: "No Google Workspace planned" },
  { value: "day_one", label: "Yes, needed on day one" },
  { value: "later", label: "Yes, but later" },
  { value: "unknown", label: "Still deciding" },
];

const ACCESS_MODEL_OPTIONS: Array<{ value: ProjectAccessModel; label: string }> = [
  { value: "public", label: "Public access" },
  { value: "internal_login", label: "Internal staff login" },
  { value: "family_partner_roles", label: "Family / partner roles" },
  { value: "role_based_private", label: "Role-based private access" },
  { value: "local_only", label: "Local only" },
  { value: "mixed", label: "Mixed public + private" },
  { value: "unknown", label: "Still deciding" },
];

const SECURITY_OPTIONS: Array<{
  value: ProjectSecurityPosture;
  label: string;
}> = [
  { value: "standard", label: "Standard" },
  { value: "elevated", label: "Elevated" },
  { value: "high_security", label: "High security" },
];

const BUILD_STRATEGY_OPTIONS: Array<{
  value: ProjectBuildStrategy;
  label: string;
}> = [
  {
    value: "guided_followup",
    label: "Governed follow-up lane",
  },
  {
    value: "agent_planned_build",
    label: "Build-agent planning lane",
  },
  {
    value: "research_first",
    label: "Research / evidence lane",
  },
];

const SHELL_PREFERENCE_OPTIONS: Array<{
  value: ProjectShellPreference;
  label: string;
}> = [
  { value: "o2_recommend", label: "Let O2 infer from current house styles" },
  { value: "dqotd_layered_tabs", label: "DQOTD style: layered branded rail" },
  { value: "tbis_split_tabs", label: "TBIS style: split tabs + admin view" },
  { value: "offroad_brand_tabs", label: "Offroad style: compact branded tabs" },
];

const INITIAL_SECTION_SET_OPTIONS: Array<{
  value: ProjectInitialSectionSet;
  label: string;
}> = [
  { value: "o2_recommend", label: "Let O2 recommend the first sections" },
  { value: "content_reference_tabs", label: "Content + resources + reference" },
  { value: "business_ops_tabs", label: "Business + profile + ops" },
  { value: "member_workspace_tabs", label: "Member workspace + role views" },
  { value: "dashboard_ops_tabs", label: "Dashboard + reports + tools" },
];

const ORG_OPTIONS: Array<{ value: ProjectOrg; label: string }> = [
  { value: "radcon", label: "Radcon" },
  { value: "radwolfe", label: "Radwolfe" },
  { value: "other", label: "Other" },
];

const KIND_OPTIONS: Array<{ value: ProjectKind; label: string }> = [
  { value: "nextjs", label: "Next.js website" },
  { value: "python", label: "Python tool / dashboard" },
  { value: "tauri", label: "Tauri desktop app" },
  { value: "docs", label: "Docs surface" },
  { value: "static", label: "Static site" },
  { value: "other", label: "Other" },
];

function optionLabel<T extends string>(
  options: Array<{ value: T; label: string }>,
  value: T,
): string {
  return options.find((item) => item.value === value)?.label ?? value;
}

function toProjectKey(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "")
    .replace(/^([^a-z]+)/, "")
    .slice(0, 40);
}

function toTitleCaseFromKey(value: string): string {
  if (!value.trim()) return "";
  return value
    .trim()
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizePort(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return undefined;
  return Math.trunc(n);
}

function defaultSurfaceForClass(projectClass: ProjectClass): ProjectDeliverySurface {
  switch (projectClass) {
    case "private_portal":
      return "private_portal";
    case "vacation_plan":
    case "asset_review":
    case "data_analysis":
      return "local_dashboard";
    case "data_collection_display":
      return "data_surface";
    case "internal_operations":
      return "operations_workspace";
    case "docs_knowledge_surface":
      return "docs_surface";
    case "info_website":
    case "business_website":
    case "physical_store":
    case "other":
    default:
      return "public_website";
  }
}

function defaultKindForSurface(surface: ProjectDeliverySurface): ProjectKind {
  switch (surface) {
    case "desktop_app":
      return "tauri";
    case "docs_surface":
      return "docs";
    case "local_dashboard":
    case "operations_workspace":
      return "python";
    case "public_website":
    case "private_portal":
    case "data_surface":
    default:
      return "nextjs";
  }
}

function defaultOrgForRelation(_choice: RelationChoice): ProjectOrg {
  return "radcon";
}

function requiresRelatedProject(choice: RelationChoice): boolean {
  return choice !== "net_new";
}

function derivedIntent(_choice: RelationChoice): "production" {
  return "production";
}

function derivedRelationship(choice: RelationChoice) {
  switch (choice) {
    case "website_successor":
      return "version_successor" as const;
    case "similar_to_existing":
      return "reference_pattern" as const;
    case "net_new":
    default:
      return "new" as const;
  }
}

function deriveProjectType(
  choice: RelationChoice,
  kind: ProjectKind,
  surface: ProjectDeliverySurface,
  projectClass: ProjectClass,
): NewProjectType {
  if (choice === "website_successor") return "website_successor";
  if (surface === "docs_surface" || kind === "docs") return "docs_surface";
  if (surface === "desktop_app" || kind === "tauri") return "standalone_app";
  if (
    surface === "local_dashboard" ||
    surface === "operations_workspace" ||
    projectClass === "data_analysis" ||
    projectClass === "asset_review" ||
    projectClass === "vacation_plan"
  ) {
    return "internal_tool";
  }
  if (kind === "other" && projectClass === "other") return "other";
  return "new_website";
}

function buildDefaultRepoPath(org: ProjectOrg, key: string): string {
  if (!key) return "";

  switch (org) {
    case "radcon":
      return `/home/chris/dev/rad-empire/radcon/dev/${key}`;
    case "radwolfe":
      return `/home/chris/dev/rad-empire/radwolfe/dev/${key}`;
    case "other":
    default:
      return `/home/chris/dev/${key}`;
  }
}

function buildDefaultRepoHint(org: ProjectOrg, key: string): string {
  if (!key) return "";

  switch (org) {
    case "radcon":
      return `radcon/dev/${key}`;
    case "radwolfe":
      return `radwolfe/dev/${key}`;
    case "other":
    default:
      return key;
  }
}

function buildDefaultUrl(_kind: ProjectKind, port: number | undefined): string {
  if (!port) return "";
  return `http://localhost:${port}`;
}

function missionPlaceholder(
  projectClass: ProjectClass,
  choice: RelationChoice,
): string {
  if (choice === "website_successor") {
    return "Describe what this new version needs to improve while preserving the right parts of the existing site.";
  }
  switch (projectClass) {
    case "private_portal":
      return "Describe the portal mission, who needs access, what it should protect, and why it matters to the empire.";
    case "data_collection_display":
      return "Describe what data should be collected, how it should be surfaced, and why this project exists.";
    case "data_analysis":
      return "Describe the analysis problem, who needs answers, and what kind of governed outputs matter.";
    default:
      return "Describe why this project should exist, who it serves, and what the core surface must do before scaffolding.";
  }
}

function goalsPlaceholder(projectClass: ProjectClass): string {
  switch (projectClass) {
    case "private_portal":
      return "List the first secure workflows, tabs, or role-based views that must exist in phase one.";
    case "business_website":
      return "List the first business outcomes, lead flows, content blocks, or integrations that matter.";
    case "data_collection_display":
      return "List the first data sources, metrics, and dashboards that must be visible in phase one.";
    default:
      return "List the first-phase goals, what success looks like, and what should be real before this project is considered useful.";
  }
}

function relatedProjectLabel(choice: RelationChoice): string {
  switch (choice) {
    case "similar_to_existing":
      return "Primary reference project";
    case "website_successor":
      return "Existing website being succeeded";
    default:
      return "Related project";
  }
}

function relatedProjectHelp(choice: RelationChoice): string {
  switch (choice) {
    case "similar_to_existing":
      return "Choose the closest repo or surface. Use the reference field below for any secondary repos, tabs, or formatting cues.";
    case "website_successor":
      return "Choose the current website this new version should inherit from and improve.";
    default:
      return "Choose the existing project this effort should reference.";
  }
}

function normalizePatternLabel(value: string): string {
  return value.replace(/_/g, " ");
}

function patternCompatibilityScore(
  pattern: GovernedStarterPattern,
  projectClass: ProjectClass,
  deliverySurface: ProjectDeliverySurface,
  kind: ProjectKind,
): number {
  const classMatch = pattern.projectClasses.includes(projectClass);
  const surfaceMatch = pattern.deliverySurfaces.includes(deliverySurface);
  const kindMatch = pattern.kinds.includes(kind);
  const otherClassMatch = pattern.projectClasses.includes("other");

  let score = 0;
  if (classMatch) score += 5;
  if (surfaceMatch) score += 4;
  if (kindMatch) score += 3;
  if (otherClassMatch) score += 1;
  return score;
}

function defaultShellPreference(
  projectClass: ProjectClass,
  deliverySurface: ProjectDeliverySurface,
): ProjectShellPreference {
  if (
    projectClass === "private_portal" ||
    deliverySurface === "private_portal" ||
    projectClass === "internal_operations" ||
    projectClass === "data_analysis" ||
    projectClass === "asset_review" ||
    projectClass === "vacation_plan" ||
    projectClass === "data_collection_display"
  ) {
    return "tbis_split_tabs";
  }

  if (
    projectClass === "info_website" ||
    projectClass === "docs_knowledge_surface"
  ) {
    return "dqotd_layered_tabs";
  }

  if (
    projectClass === "business_website" ||
    projectClass === "physical_store"
  ) {
    return "tbis_split_tabs";
  }

  return "offroad_brand_tabs";
}

function defaultInitialSectionSet(
  projectClass: ProjectClass,
  deliverySurface: ProjectDeliverySurface,
): ProjectInitialSectionSet {
  if (
    projectClass === "private_portal" ||
    deliverySurface === "private_portal"
  ) {
    return "member_workspace_tabs";
  }

  if (
    projectClass === "internal_operations" ||
    projectClass === "data_analysis" ||
    projectClass === "asset_review" ||
    projectClass === "vacation_plan" ||
    projectClass === "data_collection_display"
  ) {
    return "dashboard_ops_tabs";
  }

  if (
    projectClass === "business_website" ||
    projectClass === "physical_store"
  ) {
    return "business_ops_tabs";
  }

  if (
    projectClass === "info_website" ||
    projectClass === "docs_knowledge_surface"
  ) {
    return "content_reference_tabs";
  }

  return "o2_recommend";
}

function describeShellPreference(value: ProjectShellPreference): string {
  switch (value) {
    case "dqotd_layered_tabs":
      return "DQOTD uses a strong branded header, curated public tabs, and keeps builder-only routes out of the visible rail.";
    case "tbis_split_tabs":
      return "TBIS uses simple obvious top tabs, big readable panels, and can split public tabs from admin tabs cleanly.";
    case "offroad_brand_tabs":
      return "Offroad uses a compact, equal-width branded tab strip that keeps the whole shell visually simple and bold.";
    case "o2_recommend":
    default:
      return "Let O2 choose the shell style from the project frame, governed starter pattern, and access posture.";
  }
}

function describeInitialSectionSet(value: ProjectInitialSectionSet): string {
  switch (value) {
    case "content_reference_tabs":
      return "Start with content, resources, timeline, and reference-style sections.";
    case "business_ops_tabs":
      return "Start with business-facing tabs like about, store, profile, orders, and stats.";
    case "member_workspace_tabs":
      return "Start with overview, member workspace, resources, account, and role-specific areas.";
    case "dashboard_ops_tabs":
      return "Start with dashboard, reports, tools, snapshots, and admin-oriented sections.";
    case "o2_recommend":
    default:
      return "Let O2 infer the first section set from your project class, access posture, and chosen shell style.";
  }
}

function buildSuggestedStarterTabs(args: {
  shellPreference: ProjectShellPreference;
  initialSectionSet: ProjectInitialSectionSet;
  deliverySurface: ProjectDeliverySurface;
  needsAdminSurface: boolean;
  needsCommerceSurface: boolean;
  needsKnowledgeSurface: boolean;
  needsTimelineSurface: boolean;
  needsAuthentication: boolean;
}): string[] {
  const tabs: string[] = [];

  if (args.shellPreference === "dqotd_layered_tabs") {
    tabs.push("Home", "Resources");
  } else if (args.shellPreference === "tbis_split_tabs") {
    tabs.push("Overview", "Profile");
  } else if (args.shellPreference === "offroad_brand_tabs") {
    tabs.push("Home", "About");
  }

  switch (args.initialSectionSet) {
    case "content_reference_tabs":
      tabs.push("Resources", "Timeline", "Reference");
      break;
    case "business_ops_tabs":
      tabs.push("Store", "Profile", "Stats");
      break;
    case "member_workspace_tabs":
      tabs.push("Workspace", "Resources", "Account");
      break;
    case "dashboard_ops_tabs":
      tabs.push("Dashboard", "Reports", "Tools");
      break;
    default:
      break;
  }

  if (args.deliverySurface === "private_portal") tabs.unshift("Workspace");
  if (args.needsKnowledgeSurface) tabs.push("Resources");
  if (args.needsTimelineSurface) tabs.push("Timeline");
  if (args.needsCommerceSurface) tabs.push("Store", "Cart");
  if (args.needsAuthentication) tabs.push("Account");
  if (args.needsAdminSurface) tabs.push("Admin");

  return Array.from(new Set(tabs)).slice(0, 8);
}

function referenceReposPlaceholder(choice: RelationChoice): string {
  switch (choice) {
    case "similar_to_existing":
      return "DQOTD tabs, TBIS admin split, Offroad compact nav, or any other repos or surfaces O2 should inspect before proposing structure.";
    case "website_successor":
      return "List any sibling repos, current deployments, or UI surfaces that the successor should review before replacing the current site.";
    case "net_new":
    default:
      return "List any current repos, tabs, or local surfaces worth borrowing ideas, formatting, or constraints from.";
  }
}

function similarityPlaceholder(choice: RelationChoice): string {
  switch (choice) {
    case "similar_to_existing":
      return "Explain what should feel similar, what should stay different, and what should be inspected before build work begins.";
    case "website_successor":
      return "Explain what content, stack, or behavior should carry forward and what needs to change.";
    default:
      return "Explain any inheritance, shared patterns, or adjacent systems that matter to formation.";
  }
}

type BuildLaneRecommendation = {
  key: string;
  label: string;
  reason: string;
  buildAgentCandidate: boolean;
  securityReviewRequired: boolean;
};

function recommendBuildLane(args: {
  choice: RelationChoice;
  projectClass: ProjectClass;
  deliverySurface: ProjectDeliverySurface;
  googleWorkspacePlan: ProjectGoogleWorkspacePlan;
  accessModel: ProjectAccessModel;
  securityPosture: ProjectSecurityPosture;
  buildStrategy: ProjectBuildStrategy;
  handlesSensitiveData: boolean;
  launchLocalFirst: boolean;
}): BuildLaneRecommendation {
  const workspaceClause =
    args.googleWorkspacePlan === "day_one"
      ? " Google Workspace is expected immediately, so identity and tenant planning should be explicit."
      : "";

  const securitySensitive =
    args.securityPosture === "high_security" ||
    args.handlesSensitiveData ||
    args.deliverySurface === "private_portal" ||
    args.accessModel === "family_partner_roles" ||
    args.accessModel === "role_based_private";

  if (securitySensitive) {
    return {
      key: "security_followup",
      label: "Security-first governed follow-up",
      reason:
        "This intake touches authenticated or sensitive access. O2 should force role, session, data-boundary, and least-privilege questions before any scaffold or build-agent execution." +
        workspaceClause,
      buildAgentCandidate: args.buildStrategy === "agent_planned_build",
      securityReviewRequired: true,
    };
  }

  if (
    args.buildStrategy === "research_first" ||
    args.projectClass === "vacation_plan" ||
    args.projectClass === "asset_review"
  ) {
    return {
      key: "research_first",
      label: "Research-first governed formation",
      reason:
        "This project should stay in evidence-gathering mode until the scope and payoff are clearer." +
        (args.launchLocalFirst ? " Localhost-first review is a good fit for this posture." : "") +
        workspaceClause,
      buildAgentCandidate: false,
      securityReviewRequired: false,
    };
  }

  if (
    args.buildStrategy === "agent_planned_build" ||
    args.projectClass === "data_analysis" ||
    args.projectClass === "data_collection_display"
  ) {
    return {
      key: "agent_plan",
      label: "Governed build-agent planning candidate",
      reason:
        "This project benefits from aggregating intake truth, related repos, and open questions into a governed build plan before scaffold." +
        (args.launchLocalFirst ? " The localhost-first posture makes plan validation easier." : "") +
        workspaceClause,
      buildAgentCandidate: true,
      securityReviewRequired: false,
    };
  }

  return {
    key: "guided_followup",
    label: "Guided follow-up before scaffold",
    reason:
      "Capture one more round of governed clarification, then let O2 decide whether the next step is a build-agent plan or a narrower manual scaffold." +
      workspaceClause,
    buildAgentCandidate: true,
    securityReviewRequired: false,
  };
}

export function AddProjectModal({
  open,
  onClose,
  onCreate,
  requestPortSuggestion,
  governedPatterns,
  existingProjects,
  prefill,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (payload: AddProjectPayload) => Promise<void> | void;
  requestPortSuggestion?: (kind: ProjectKind) => Promise<GovernedPortSuggestion | null>;
  governedPatterns?: GovernedStarterPattern[];
  existingProjects: Array<{
    key: string;
    label?: string;
  }>;
  prefill?: AddProjectModalPrefill | null;
}) {
  const [projectClass, setProjectClass] = useState<ProjectClass>("business_website");
  const [relationChoice, setRelationChoice] =
    useState<RelationChoice>("net_new");
  const [deliverySurface, setDeliverySurface] =
    useState<ProjectDeliverySurface>("public_website");
  const [deliverySurfaceTouched, setDeliverySurfaceTouched] = useState(false);

  const [projectName, setProjectName] = useState("");
  const [mission, setMission] = useState("");
  const [goalSummary, setGoalSummary] = useState("");
  const [intendedUsers, setIntendedUsers] = useState("");
  const [domainIntent, setDomainIntent] = useState("");
  const [relatedProject, setRelatedProject] = useState("");
  const [referenceRepos, setReferenceRepos] = useState("");
  const [patternHint, setPatternHint] = useState("");
  const [patternTouched, setPatternTouched] = useState(false);
  const [similarityNotes, setSimilarityNotes] = useState("");
  const [constraints, setConstraints] = useState("");

  const [googleWorkspacePlan, setGoogleWorkspacePlan] =
    useState<ProjectGoogleWorkspacePlan>("unknown");
  const [accessModel, setAccessModel] =
    useState<ProjectAccessModel>("unknown");
  const [securityPosture, setSecurityPosture] =
    useState<ProjectSecurityPosture>("standard");
  const [buildStrategy, setBuildStrategy] =
    useState<ProjectBuildStrategy>("guided_followup");
  const [shellPreference, setShellPreference] =
    useState<ProjectShellPreference>("o2_recommend");
  const [shellPreferenceTouched, setShellPreferenceTouched] = useState(false);
  const [initialSectionSet, setInitialSectionSet] =
    useState<ProjectInitialSectionSet>("o2_recommend");
  const [initialSectionSetTouched, setInitialSectionSetTouched] = useState(false);
  const [needsAdminSurface, setNeedsAdminSurface] = useState(false);
  const [needsCommerceSurface, setNeedsCommerceSurface] = useState(false);
  const [needsKnowledgeSurface, setNeedsKnowledgeSurface] = useState(false);
  const [needsTimelineSurface, setNeedsTimelineSurface] = useState(false);
  const [needsAuthentication, setNeedsAuthentication] = useState(false);
  const [handlesSensitiveData, setHandlesSensitiveData] = useState(false);
  const [launchLocalFirst, setLaunchLocalFirst] = useState(true);
  const [bootstrapNow, setBootstrapNow] = useState(true);
  const [bootstrapChoiceTouched, setBootstrapChoiceTouched] = useState(false);
  const [operatorBrief, setOperatorBrief] = useState("");

  const [label, setLabel] = useState("");
  const [labelTouched, setLabelTouched] = useState(false);
  const [org, setOrg] = useState<ProjectOrg>("radcon");
  const [orgTouched, setOrgTouched] = useState(false);
  const [kind, setKind] = useState<ProjectKind>("nextjs");
  const [kindTouched, setKindTouched] = useState(false);
  const [portInput, setPortInput] = useState("");
  const [portTouched, setPortTouched] = useState(false);
  const [url, setUrl] = useState("");
  const [urlTouched, setUrlTouched] = useState(false);
  const [repoPath, setRepoPath] = useState("");
  const [repoPathTouched, setRepoPathTouched] = useState(false);
  const [repoHint, setRepoHint] = useState("");
  const [repoHintTouched, setRepoHintTouched] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;

    const inferredRelation: RelationChoice =
      prefill?.projectType === "website_successor" ? "website_successor" : "net_new";

    const defaultClass: ProjectClass = "business_website";
    const defaultSurface = defaultSurfaceForClass(defaultClass);
    const defaultKind = defaultKindForSurface(defaultSurface);

    setProjectClass(defaultClass);
    setRelationChoice(inferredRelation);
    setDeliverySurface(defaultSurface);
    setDeliverySurfaceTouched(false);

    setProjectName("");
    setMission("");
    setGoalSummary("");
    setIntendedUsers("");
    setDomainIntent("");
    setRelatedProject(prefill?.relatedProjectKey ?? "");
    setReferenceRepos("");
    setPatternHint("");
    setPatternTouched(false);
    setSimilarityNotes("");
    setConstraints("");

    setGoogleWorkspacePlan("unknown");
    setAccessModel("unknown");
    setSecurityPosture("standard");
    setBuildStrategy("guided_followup");
    setShellPreference(defaultShellPreference(defaultClass, defaultSurface));
    setShellPreferenceTouched(false);
    setInitialSectionSet(defaultInitialSectionSet(defaultClass, defaultSurface));
    setInitialSectionSetTouched(false);
    setNeedsAdminSurface(false);
    setNeedsCommerceSurface(false);
    setNeedsKnowledgeSurface(false);
    setNeedsTimelineSurface(false);
    setNeedsAuthentication(false);
    setHandlesSensitiveData(false);
    setLaunchLocalFirst(true);
    setBootstrapNow(true);
    setBootstrapChoiceTouched(false);
    setOperatorBrief("");

    setLabel("");
    setLabelTouched(false);
    setOrg(defaultOrgForRelation(inferredRelation));
    setOrgTouched(false);
    setKind(defaultKind);
    setKindTouched(false);
    setPortInput("");
    setPortTouched(false);
    setUrl("");
    setUrlTouched(false);
    setRepoPath("");
    setRepoPathTouched(false);
    setRepoHint("");
    setRepoHintTouched(false);

    setErr(null);
    setSaving(false);
  }, [open, prefill]);

  useEffect(() => {
    if (!open) return;
    if (!deliverySurfaceTouched) {
      setDeliverySurface(defaultSurfaceForClass(projectClass));
    }
  }, [open, projectClass, deliverySurfaceTouched]);

  useEffect(() => {
    if (!open) return;
    if (!kindTouched) {
      setKind(defaultKindForSurface(deliverySurface));
    }
  }, [open, deliverySurface, kindTouched]);

  useEffect(() => {
    if (!open) return;
    if (!orgTouched) {
      setOrg(defaultOrgForRelation(relationChoice));
    }
  }, [open, relationChoice, orgTouched]);

  useEffect(() => {
    if (!open || shellPreferenceTouched) return;
    setShellPreference(defaultShellPreference(projectClass, deliverySurface));
  }, [
    deliverySurface,
    open,
    projectClass,
    shellPreferenceTouched,
  ]);

  useEffect(() => {
    if (!open || initialSectionSetTouched) return;
    setInitialSectionSet(defaultInitialSectionSet(projectClass, deliverySurface));
  }, [
    deliverySurface,
    initialSectionSetTouched,
    open,
    projectClass,
  ]);

  useEffect(() => {
    if (!open) return;

    const privatePortalProject =
      projectClass === "private_portal" || deliverySurface === "private_portal";

    if (privatePortalProject) {
      setNeedsAuthentication(true);
      setAccessModel((current) =>
        current === "public" || current === "unknown"
          ? "role_based_private"
          : current,
      );
      setSecurityPosture((current) =>
        current === "standard" ? "elevated" : current,
      );
    }
  }, [open, projectClass, deliverySurface]);

  useEffect(() => {
    if (!open || !needsAdminSurface) return;
    setNeedsAuthentication(true);
    setAccessModel((current) =>
      current === "public" || current === "unknown"
        ? "internal_login"
        : current,
    );
    setSecurityPosture((current) =>
      current === "standard" ? "elevated" : current,
    );
  }, [needsAdminSurface, open]);

  useEffect(() => {
    if (!open || portTouched || !requestPortSuggestion) return;

    const getSuggestion = requestPortSuggestion;
    let cancelled = false;

    async function syncGovernedPort() {
      try {
        const suggestion = await getSuggestion(kind);
        if (cancelled) return;
        const nextPort =
          typeof suggestion?.port === "number" ? String(suggestion.port) : "";
        setPortInput(nextPort);
      } catch {
        if (!cancelled) {
          setPortInput("");
        }
      }
    }

    void syncGovernedPort();

    return () => {
      cancelled = true;
    };
  }, [kind, open, portTouched, requestPortSuggestion]);

  useEffect(() => {
    if (!open) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  const key = useMemo(() => toProjectKey(projectName), [projectName]);
  const parsedPort = useMemo(() => normalizePort(portInput), [portInput]);
  const track = useMemo(() => derivedIntent(relationChoice), [relationChoice]);
  const relationship = useMemo(
    () => derivedRelationship(relationChoice),
    [relationChoice],
  );
  const projectType = useMemo(
    () => deriveProjectType(relationChoice, kind, deliverySurface, projectClass),
    [relationChoice, kind, deliverySurface, projectClass],
  );

  const shouldShowRelatedProject = requiresRelatedProject(relationChoice);
  const shouldShowPort = kind !== "ops";
  const shouldShowUrl = shouldShowPort;
  const bootstrapAllowed = true;
  const showDomainIntent =
    deliverySurface === "public_website" ||
    deliverySurface === "private_portal" ||
    deliverySurface === "data_surface";

  const computedLabel = useMemo(() => {
    if (labelTouched) return label;
    if (projectName.trim()) return projectName.trim();
    return toTitleCaseFromKey(key);
  }, [labelTouched, label, projectName, key]);

  const computedRepoPath = useMemo(() => {
    if (repoPathTouched) return repoPath;
    return buildDefaultRepoPath(org, key.trim());
  }, [repoPathTouched, repoPath, org, key, projectType]);

  const computedRepoHint = useMemo(() => {
    if (repoHintTouched) return repoHint;
    return buildDefaultRepoHint(org, key.trim());
  }, [repoHintTouched, repoHint, org, key, projectType]);

  const computedUrl = useMemo(() => {
    if (urlTouched) return url;
    return shouldShowUrl ? buildDefaultUrl(kind, parsedPort) : "";
  }, [urlTouched, url, shouldShowUrl, kind, parsedPort]);

  const computedO2StartKey = useMemo(() => (key.trim() ? `${key.trim()}.dev` : ""), [key]);
  const computedO2SnapshotKey = useMemo(
    () => (key.trim() ? `${key.trim()}.snapshot` : ""),
    [key],
  );
  const computedO2CommitKey = useMemo(
    () => (key.trim() ? `${key.trim()}.commit` : ""),
    [key],
  );
  const computedO2MapKey = useMemo(() => (key.trim() ? `${key.trim()}.map` : ""), [key]);
  const computedO2ProofPackKey = useMemo(
    () => (key.trim() ? `${key.trim()}.proofpack` : ""),
    [key],
  );

  const compatiblePatterns = useMemo(() => {
    return (governedPatterns ?? [])
      .map((pattern) => ({
        pattern,
        score: patternCompatibilityScore(
          pattern,
          projectClass,
          deliverySurface,
          kind,
        ),
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score);
  }, [deliverySurface, governedPatterns, kind, projectClass]);

  const recommendedPattern = compatiblePatterns[0]?.pattern ?? null;
  const selectedPattern = useMemo(
    () =>
      (governedPatterns ?? []).find((pattern) => pattern.key === patternHint.trim()) ??
      null,
    [governedPatterns, patternHint],
  );

  useEffect(() => {
    if (!open || patternTouched) return;
    setPatternHint(recommendedPattern?.key ?? "");
  }, [open, patternTouched, recommendedPattern]);

  const buildLane = useMemo(
    () =>
      recommendBuildLane({
        choice: relationChoice,
        projectClass,
        deliverySurface,
        googleWorkspacePlan,
        accessModel,
        securityPosture,
        buildStrategy,
        handlesSensitiveData,
        launchLocalFirst,
      }),
    [
      relationChoice,
      projectClass,
      deliverySurface,
      googleWorkspacePlan,
      accessModel,
      securityPosture,
      buildStrategy,
      handlesSensitiveData,
      launchLocalFirst,
    ],
  );


  const suggestedStarterTabs = useMemo(
    () =>
      buildSuggestedStarterTabs({
        shellPreference,
        initialSectionSet,
        deliverySurface,
        needsAdminSurface,
        needsCommerceSurface,
        needsKnowledgeSurface,
        needsTimelineSurface,
        needsAuthentication,
      }),
    [
      deliverySurface,
      initialSectionSet,
      needsAdminSurface,
      needsAuthentication,
      needsCommerceSurface,
      needsKnowledgeSurface,
      needsTimelineSurface,
      shellPreference,
    ],
  );

  useEffect(() => {
    if (!open || bootstrapChoiceTouched) return;
    if (!bootstrapAllowed) {
      if (bootstrapNow) setBootstrapNow(false);
      return;
    }
    const shouldBootstrapByDefault =
      !buildLane.securityReviewRequired && buildLane.key !== "research_first";
    setBootstrapNow(shouldBootstrapByDefault);
  }, [
    bootstrapAllowed,
    bootstrapChoiceTouched,
    bootstrapNow,
    buildLane.key,
    buildLane.securityReviewRequired,
    open,
  ]);

  const showPatternNotes = shouldShowRelatedProject || Boolean(selectedPattern);
  const selectedPatternSecurity = selectedPattern?.securityPosture
    ? normalizePatternLabel(selectedPattern.securityPosture)
    : null;
  const patternRecommendationText = recommendedPattern
    ? `${recommendedPattern.label} is the best O2-owned fit for the current project frame.`
    : "No governed starter pattern currently matches this project frame.";

  const generatedNotes = useMemo(() => {
    const lines: string[] = [
      "Formation Intake",
      "",
      `Project Class: ${optionLabel(PROJECT_CLASS_OPTIONS, projectClass)}`,
      `Formation Path: ${optionLabel(RELATION_OPTIONS, relationChoice)}`,
      `Delivery Surface: ${optionLabel(DELIVERY_SURFACE_OPTIONS, deliverySurface)}`,
      `Owning Org: ${optionLabel(ORG_OPTIONS, org)}`,
      `Technical Kind: ${optionLabel(KIND_OPTIONS, kind)}`,
      `Track: ${track}`,
      `Relationship: ${relationship}`,
      `Google Workspace Plan: ${optionLabel(GOOGLE_WORKSPACE_OPTIONS, googleWorkspacePlan)}`,
      `Access Model: ${optionLabel(ACCESS_MODEL_OPTIONS, accessModel)}`,
      `Security Posture: ${optionLabel(SECURITY_OPTIONS, securityPosture)}`,
      `Build Strategy: ${optionLabel(BUILD_STRATEGY_OPTIONS, buildStrategy)}`,
      `Shell Preference: ${optionLabel(SHELL_PREFERENCE_OPTIONS, shellPreference)}`,
      `Initial Section Set: ${optionLabel(INITIAL_SECTION_SET_OPTIONS, initialSectionSet)}`,
      `Needs Authentication: ${needsAuthentication ? "yes" : "no"}`,
      `Handles Sensitive Data: ${handlesSensitiveData ? "yes" : "no"}`,
      `Launch Localhost First: ${launchLocalFirst ? "yes" : "no"}`,
      `Needs Admin Surface: ${needsAdminSurface ? "yes" : "no"}`,
      `Needs Commerce Surface: ${needsCommerceSurface ? "yes" : "no"}`,
      `Needs Knowledge Surface: ${needsKnowledgeSurface ? "yes" : "no"}`,
      `Needs Timeline Surface: ${needsTimelineSurface ? "yes" : "no"}`,
      `Suggested Starter Tabs: ${suggestedStarterTabs.length ? suggestedStarterTabs.join(", ") : "none yet"}`,
      `Bootstrap Starter Surface: ${bootstrapNow ? "yes" : "no"}`,
      `Recommended Build Lane: ${buildLane.label}`,
    ];

    if (relatedProject.trim()) {
      lines.push(`Related Project: ${relatedProject.trim()}`);
    }

    if (referenceRepos.trim()) {
      lines.push(`Reference Repos / Surfaces: ${referenceRepos.trim()}`);
    }

    if (showDomainIntent && domainIntent.trim()) {
      lines.push(`Domain / Workspace Intent: ${domainIntent.trim()}`);
    }

    if (intendedUsers.trim()) {
      lines.push(`Intended Users: ${intendedUsers.trim()}`);
    }

    if (patternHint.trim()) {
      lines.push(`Governed Starter Pattern: ${patternHint.trim()}`);
    }

    if (similarityNotes.trim()) {
      lines.push(`Similarity / Inheritance Notes: ${similarityNotes.trim()}`);
    }

    lines.push("");
    lines.push("Mission");
    lines.push(mission.trim() || "(required)");
    lines.push("");
    lines.push("Phase 1 Goals");
    lines.push(goalSummary.trim() || "(required)");

    if (operatorBrief.trim()) {
      lines.push("");
      lines.push("Operator Brief");
      lines.push(operatorBrief.trim());
    }

    if (constraints.trim()) {
      lines.push("");
      lines.push("Hard Constraints / Non-negotiables");
      lines.push(constraints.trim());
    }

    return lines.join("\n").trim();
  }, [
    projectClass,
    relationChoice,
    deliverySurface,
    org,
    kind,
    track,
    relationship,
    googleWorkspacePlan,
    accessModel,
    securityPosture,
    buildStrategy,
    shellPreference,
    initialSectionSet,
    needsAuthentication,
    handlesSensitiveData,
    launchLocalFirst,
    needsAdminSurface,
    needsCommerceSurface,
    needsKnowledgeSurface,
    needsTimelineSurface,
    suggestedStarterTabs,
    buildLane.label,
    relatedProject,
    referenceRepos,
    showDomainIntent,
    domainIntent,
    intendedUsers,
    patternHint,
    similarityNotes,
    mission,
    goalSummary,
    operatorBrief,
    constraints,
  ]);

  const payload: AddProjectPayload = useMemo(
    () => ({
      key: key.trim(),
      label: computedLabel.trim(),
      bootstrapNow,
      org,
      kind,
      repoPath: computedRepoPath.trim(),
      repoHint: computedRepoHint.trim() || undefined,
      port: shouldShowPort ? parsedPort : undefined,
      url: shouldShowUrl ? computedUrl.trim() || undefined : undefined,
      o2StartKey: computedO2StartKey || undefined,
      o2SnapshotKey: computedO2SnapshotKey || undefined,
      o2CommitKey: computedO2CommitKey || undefined,
      o2MapKey: computedO2MapKey || undefined,
      o2ProofPackKey: computedO2ProofPackKey || undefined,
      projectType,
      intent: track,
      relationship,
      parentProjectKey:
        relationChoice === "website_successor"
          ? relatedProject.trim() || undefined
          : undefined,
      similarProjectKey:
        relationChoice === "similar_to_existing"
          ? relatedProject.trim() || undefined
          : undefined,
      referenceRepos: referenceRepos.trim() || undefined,
      projectClass,
      deliverySurface,
      goalSummary: goalSummary.trim() || undefined,
      intendedUsers: intendedUsers.trim() || undefined,
      domainIntent: showDomainIntent ? domainIntent.trim() || undefined : undefined,
      googleWorkspacePlan,
      accessModel,
      securityPosture,
      buildStrategy,
      needsAuthentication,
      handlesSensitiveData,
      launchLocalFirst,
      shellPreference,
      initialSectionSet,
      needsAdminSurface,
      needsCommerceSurface,
      needsKnowledgeSurface,
      needsTimelineSurface,
      patternHint: patternHint.trim() || undefined,
      similarityNotes: similarityNotes.trim() || undefined,
      mission: mission.trim(),
      operatorBrief: operatorBrief.trim() || undefined,
      initialConstraints: constraints.trim() || undefined,
      notes: generatedNotes || undefined,
    }),
    [
      key,
      computedLabel,
      bootstrapNow,
      org,
      kind,
      computedRepoPath,
      computedRepoHint,
      shouldShowPort,
      parsedPort,
      shouldShowUrl,
      computedUrl,
      computedO2StartKey,
      computedO2SnapshotKey,
      computedO2CommitKey,
      computedO2MapKey,
      computedO2ProofPackKey,
      projectType,
      track,
      relationship,
      relationChoice,
      relatedProject,
      referenceRepos,
      projectClass,
      deliverySurface,
      goalSummary,
      intendedUsers,
      showDomainIntent,
      domainIntent,
      googleWorkspacePlan,
      accessModel,
      securityPosture,
      buildStrategy,
      needsAuthentication,
      handlesSensitiveData,
      launchLocalFirst,
      shellPreference,
      initialSectionSet,
      needsAdminSurface,
      needsCommerceSurface,
      needsKnowledgeSurface,
      needsTimelineSurface,
      patternHint,
      similarityNotes,
      mission,
      operatorBrief,
      constraints,
      generatedNotes,
    ],
  );

  const validation = useMemo(
    () =>
      validateAdd({
        org: payload.org,
        key: payload.key,
        port: payload.port,
        url: payload.url,
        repo: payload.repoPath,
      }),
    [payload],
  );

  const validationError = useMemo(() => {
    const errors: string[] = [];

    if (!projectName.trim()) errors.push("Project name is required.");
    if (!mission.trim()) errors.push("Mission is required.");
    if (!goalSummary.trim()) errors.push("Phase 1 goals are required.");
    if (!intendedUsers.trim()) errors.push("Intended users are required.");
    if (!key.trim()) errors.push("Project key is required.");
    if (shouldShowRelatedProject && !relatedProject.trim()) {
      errors.push("A related project is required for this formation path.");
    }
    if (relationChoice === "website_successor" && kind !== "nextjs") {
      errors.push("Website successors should stay on the Next.js surface.");
    }
    if (deliverySurface === "private_portal" && !needsAuthentication) {
      errors.push("Private portals should require sign-in.");
    }
    if (needsAuthentication && accessModel === "public") {
      errors.push("Authenticated projects cannot use the public access model.");
    }
    if (
      (accessModel === "family_partner_roles" ||
        accessModel === "role_based_private") &&
      securityPosture === "standard"
    ) {
      errors.push("Role-based private access should use elevated or high security posture.");
    }
    if (handlesSensitiveData && securityPosture === "standard") {
      errors.push("Sensitive-data projects need elevated or high security posture.");
    }
    if (!validation.ok) {
      errors.push(...validation.errors);
    }

    return errors.length ? errors.join(" ") : null;
  }, [
    projectName,
    mission,
    goalSummary,
    intendedUsers,
    key,
    shouldShowRelatedProject,
    relatedProject,
    shouldShowPort,
    parsedPort,
    relationChoice,
    org,
    kind,
    deliverySurface,
    needsAuthentication,
    accessModel,
    securityPosture,
    handlesSensitiveData,
    validation,
  ]);

  async function submit() {
    if (validationError) {
      setErr(validationError);
      return;
    }

    setErr(null);
    setSaving(true);
    try {
      await onCreate(payload);
      onClose();
    } catch (e: unknown) {
      const msg =
        e instanceof Error
          ? e.message
          : e && typeof e === "object" && "message" in e
            ? String((e as { message: unknown }).message ?? "")
            : "";

      setErr(
        typeof msg === "string" && msg.trim()
          ? msg
          : "Failed to start formation.",
      );
    } finally {
      setSaving(false);
    }
  }

  const seedArtifactPreview = useMemo(() => {
    return [
      `projectType: ${projectType}`,
      `projectClass: ${projectClass}`,
      `formationPath: ${relationChoice}`,
      `deliverySurface: ${deliverySurface}`,
      `name: ${projectName.trim() || "(required)"}`,
      `label: ${computedLabel.trim() || "(required)"}`,
      `key: ${key.trim() || "(required)"}`,
      `org: ${org}`,
      `kind: ${kind}`,
      `track: ${track}`,
      `relationship: ${relationship}`,
      showDomainIntent
        ? `domainIntent: ${domainIntent.trim() || "(optional)"}`
        : null,
      `googleWorkspacePlan: ${googleWorkspacePlan}`,
      `accessModel: ${accessModel}`,
      `securityPosture: ${securityPosture}`,
      `buildStrategy: ${buildStrategy}`,
      `shellPreference: ${shellPreference}`,
      `initialSectionSet: ${initialSectionSet}`,
      `bootstrapNow: ${bootstrapNow}`,
      `needsAuthentication: ${needsAuthentication}`,
      `handlesSensitiveData: ${handlesSensitiveData}`,
      `launchLocalFirst: ${launchLocalFirst}`,
      `needsAdminSurface: ${needsAdminSurface}`,
      `needsCommerceSurface: ${needsCommerceSurface}`,
      `needsKnowledgeSurface: ${needsKnowledgeSurface}`,
      `needsTimelineSurface: ${needsTimelineSurface}`,
      shouldShowRelatedProject
        ? `relatedProject: ${relatedProject.trim() || "(required)"}`
        : null,
      referenceRepos.trim()
        ? `referenceRepos: ${referenceRepos.trim()}`
        : null,
      patternHint.trim() ? `patternHint: ${patternHint.trim()}` : null,
      similarityNotes.trim()
        ? `similarityNotes: ${similarityNotes.trim()}`
        : null,
      intendedUsers.trim()
        ? `intendedUsers: ${intendedUsers.trim()}`
        : "intendedUsers: (required)",
      shouldShowPort
        ? parsedPort
          ? `port: ${parsedPort}`
          : "port: (optional at formation stage)"
        : "port: (not needed for this type)",
      shouldShowUrl
        ? computedUrl.trim()
          ? `url: ${computedUrl.trim()}`
          : "url: (auto from port)"
        : "url: (not needed for this type)",
      computedRepoPath.trim()
        ? `repoPath: ${computedRepoPath.trim()}`
        : "repoPath: (required)",
      computedRepoHint.trim()
        ? `repoHint: ${computedRepoHint.trim()}`
        : "repoHint: (auto)",
      `recommendedBuildLane: ${buildLane.label}`,
      `buildAgentCandidate: ${buildLane.buildAgentCandidate}`,
      `securityReviewRequired: ${buildLane.securityReviewRequired}`,
      suggestedStarterTabs.length
        ? `suggestedStarterTabs: ${suggestedStarterTabs.join(", ")}`
        : "suggestedStarterTabs: (none yet)",
      "",
      "mission:",
      mission.trim() || "(required)",
      "",
      "goals:",
      goalSummary.trim() || "(required)",
      "",
      "operatorBrief:",
      operatorBrief.trim() || "(none yet)",
      "",
      "constraints:",
      constraints.trim() || "(none yet)",
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n");
  }, [
    projectType,
    projectClass,
    relationChoice,
    deliverySurface,
    projectName,
    computedLabel,
    key,
    org,
    kind,
    track,
    relationship,
    showDomainIntent,
    domainIntent,
    googleWorkspacePlan,
    accessModel,
    securityPosture,
    buildStrategy,
    shellPreference,
    initialSectionSet,
    bootstrapNow,
    needsAuthentication,
    handlesSensitiveData,
    launchLocalFirst,
    needsAdminSurface,
    needsCommerceSurface,
    needsKnowledgeSurface,
    needsTimelineSurface,
    shouldShowRelatedProject,
    relatedProject,
    referenceRepos,
    patternHint,
    similarityNotes,
    intendedUsers,
    shouldShowPort,
    parsedPort,
    shouldShowUrl,
    computedUrl,
    computedRepoPath,
    computedRepoHint,
    buildLane,
    suggestedStarterTabs,
    mission,
    goalSummary,
    operatorBrief,
    constraints,
  ]);

  if (!open) return null;

  const modalNode = (
    <div
      className="modalOverlay"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modalCard" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <div className="modalTitle">Start Formation</div>
          <button className="btn btnGhost" onClick={onClose} disabled={saving}>
            Close
          </button>
        </div>

        <div className="modalBody">
          <div className="modalColumn modalStack">
            <section className="modalSectionCard">
              <div className="modalArtifactTitle">Project Frame</div>
              <div className="modalSectionLead">
                Tell O2 what you are building, who it serves first, and what should happen before any scaffold appears.
              </div>

              <div className="modalInlineGrid">
                <div>
                  <label>What are you building?</label>
                  <select
                    value={projectClass}
                    onChange={(e) => setProjectClass(e.target.value as ProjectClass)}
                    disabled={saving}
                  >
                    {PROJECT_CLASS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label>What lineage fits this best?</label>
                  <select
                    value={relationChoice}
                    onChange={(e) => setRelationChoice(e.target.value as RelationChoice)}
                    disabled={saving}
                  >
                    {RELATION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {shouldShowRelatedProject ? (
                <div className="modalRelatedProjectBlock">
                  <label className="modalRelatedLabel">
                    {relatedProjectLabel(relationChoice)}
                  </label>
                  <select
                    value={relatedProject}
                    onChange={(e) => setRelatedProject(e.target.value)}
                    disabled={saving}
                    className="modalRelatedSelect"
                  >
                    <option value="">Select project</option>
                    {existingProjects.map((project) => (
                      <option key={project.key} value={project.key}>
                        {project.label?.trim() || project.key}
                      </option>
                    ))}
                  </select>
                  <div className="fieldHelp">{relatedProjectHelp(relationChoice)}</div>
                </div>
              ) : null}

              <label className="fieldLabelTop">Current repos or surfaces to inspect</label>
              <textarea
                value={referenceRepos}
                onChange={(e) => setReferenceRepos(e.target.value)}
                placeholder={referenceReposPlaceholder(relationChoice)}
                disabled={saving}
                className="modalShortTextArea"
              />
              <div className="fieldHelp">
                Optional, but useful when the closest related project is not the whole story. List any repos, tabs, deployments, or UI surfaces O2 should inspect before it proposes structure or bootstrap.
              </div>

              <label className="fieldLabelTopLg">What should this project be called?</label>
              <input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Radcon Enterprises"
                disabled={saving}
              />
              <div className="fieldHelp">
                O2 derives the key, label, repo path, and starter records from this unless you override them later.
              </div>

              <div className="modalInlineGrid fieldLabelTop">
                <div>
                  <label>Which org owns it?</label>
                  <select
                    value={org}
                    onChange={(e) => {
                      setOrgTouched(true);
                      setOrg(e.target.value as ProjectOrg);
                    }}
                    disabled={saving}
                  >
                    {ORG_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label>Where will people use it first?</label>
                  <select
                    value={deliverySurface}
                    onChange={(e) => {
                      setDeliverySurfaceTouched(true);
                      setDeliverySurface(e.target.value as ProjectDeliverySurface);
                    }}
                    disabled={saving}
                  >
                    {DELIVERY_SURFACE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="fieldLabelTop">Who will actually use this first?</label>
              <input
                value={intendedUsers}
                onChange={(e) => setIntendedUsers(e.target.value)}
                placeholder="Family, business partners, staff, customers, members, or another defined audience"
                disabled={saving}
              />

              {showDomainIntent ? (
                <>
                  <label className="fieldLabelTop">Primary domain, tenant, or workspace plan</label>
                  <input
                    value={domainIntent}
                    onChange={(e) => setDomainIntent(e.target.value)}
                    placeholder="radconenterprises.com, Google Workspace tenant, or another domain / identity plan"
                    disabled={saving}
                  />
                </>
              ) : null}

              <label className="fieldLabelTop">What is this project supposed to do?</label>
              <textarea
                value={mission}
                onChange={(e) => setMission(e.target.value)}
                placeholder={missionPlaceholder(projectClass, relationChoice)}
                disabled={saving}
                className="modalCompactTextArea"
              />

              <label className="fieldLabelTop">What should phase one prove?</label>
              <textarea
                value={goalSummary}
                onChange={(e) => setGoalSummary(e.target.value)}
                placeholder={goalsPlaceholder(projectClass)}
                disabled={saving}
                className="modalCompactTextArea"
              />
            </section>

            <section className="modalSectionCard">
              <div className="modalArtifactTitle">Visual Direction and Optional Surfaces</div>
              <div className="modalSectionLead">
                Reference repos answer what to borrow. These controls capture preferred style and likely day-one surfaces without forcing O2 to lock the structure too early.
              </div>

              <div className="modalInlineGrid">
                <div>
                  <label>Which house style is closest?</label>
                  <select
                    value={shellPreference}
                    onChange={(e) => {
                      setShellPreferenceTouched(true);
                      setShellPreference(e.target.value as ProjectShellPreference);
                    }}
                    disabled={saving}
                  >
                    {SHELL_PREFERENCE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label>What should day one sections feel like?</label>
                  <select
                    value={initialSectionSet}
                    onChange={(e) => {
                      setInitialSectionSetTouched(true);
                      setInitialSectionSet(e.target.value as ProjectInitialSectionSet);
                    }}
                    disabled={saving}
                  >
                    {INITIAL_SECTION_SET_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="modalPatternEmpty fieldLabelTop">
                <strong>Shell guidance:</strong> {describeShellPreference(shellPreference)}
                <br />
                <strong>Section guidance:</strong> {describeInitialSectionSet(initialSectionSet)}
              </div>

              <div className="fieldLabelTop">
                <div className="modalGeneratedLabel">Starter surfaces to plan for day one</div>
                <div className="modalCheckboxGrid modalCheckboxGridTwoUp">
                  <label className="modalCheckboxLabel">
                    <input
                      type="checkbox"
                      checked={needsAdminSurface}
                      onChange={(e) => setNeedsAdminSurface(e.target.checked)}
                      disabled={saving}
                    />
                    <span>
                      Admin-only surface
                      <small>Reserve a private operator or staff area from the start.</small>
                    </span>
                  </label>

                  <label className="modalCheckboxLabel">
                    <input
                      type="checkbox"
                      checked={needsCommerceSurface}
                      onChange={(e) => setNeedsCommerceSurface(e.target.checked)}
                      disabled={saving}
                    />
                    <span>
                      Commerce or checkout flows
                      <small>Plan for transactions, booking, or purchase actions on day one.</small>
                    </span>
                  </label>

                  <label className="modalCheckboxLabel">
                    <input
                      type="checkbox"
                      checked={needsKnowledgeSurface}
                      onChange={(e) => setNeedsKnowledgeSurface(e.target.checked)}
                      disabled={saving}
                    />
                    <span>
                      Knowledge or resources area
                      <small>Reserve a docs, resources, or reference surface early.</small>
                    </span>
                  </label>

                  <label className="modalCheckboxLabel">
                    <input
                      type="checkbox"
                      checked={needsTimelineSurface}
                      onChange={(e) => setNeedsTimelineSurface(e.target.checked)}
                      disabled={saving}
                    />
                    <span>
                      Timeline or milestones
                      <small>Include a visible plan, milestone, or progress area from the start.</small>
                    </span>
                  </label>
                </div>
              </div>

              <div className="fieldHelp fieldLabelTop">
                O2 may infer starter sections from this frame, but the actual first structure remains governed by formation output rather than this preview alone.
              </div>
            </section>

            <section className="modalSectionCard">
              <div className="modalArtifactTitle">Access and Security</div>
              <div className="modalSectionLead">
                Set the trust model here. These controls determine how O2 treats sign-in, sensitive data, rollout safety, and whether bootstrap should stay cautious.
              </div>

              <div className="modalInlineGrid">
                <div>
                  <label>Will this need a Google Workspace soon?</label>
                  <select
                    value={googleWorkspacePlan}
                    onChange={(e) =>
                      setGoogleWorkspacePlan(
                        e.target.value as ProjectGoogleWorkspacePlan,
                      )
                    }
                    disabled={saving}
                  >
                    {GOOGLE_WORKSPACE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label>What access model is closest?</label>
                  <select
                    value={accessModel}
                    onChange={(e) =>
                      setAccessModel(e.target.value as ProjectAccessModel)
                    }
                    disabled={saving}
                  >
                    {ACCESS_MODEL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="modalInlineGrid fieldLabelTop">
                <div>
                  <label>How serious should the security posture be?</label>
                  <select
                    value={securityPosture}
                    onChange={(e) =>
                      setSecurityPosture(e.target.value as ProjectSecurityPosture)
                    }
                    disabled={saving}
                  >
                    {SECURITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label>What long-range lane should O2 bias toward?</label>
                  <select
                    value={buildStrategy}
                    onChange={(e) =>
                      setBuildStrategy(e.target.value as ProjectBuildStrategy)
                    }
                    disabled={saving}
                  >
                    {BUILD_STRATEGY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="fieldHelp fieldLabelTop">
                This lane shapes follow-up and agent planning. The radio cards below decide what this click does immediately.
              </div>

              <div className="fieldLabelTop">
                <div className="modalGeneratedLabel">Trust and rollout switches</div>
                <div className="modalCheckboxGrid modalCheckboxGridTwoUp">
                  <label className="modalCheckboxLabel">
                    <input
                      type="checkbox"
                      checked={needsAuthentication}
                      onChange={(e) => setNeedsAuthentication(e.target.checked)}
                      disabled={saving}
                    />
                    <span>
                      Require sign-in
                      <small>Use this when the first useful version depends on login, roles, or session control.</small>
                    </span>
                  </label>

                  <label className="modalCheckboxLabel">
                    <input
                      type="checkbox"
                      checked={handlesSensitiveData}
                      onChange={(e) => setHandlesSensitiveData(e.target.checked)}
                      disabled={saving}
                    />
                    <span>
                      Handles sensitive data
                      <small>Use this for family, partner, business, financial, or otherwise private records.</small>
                    </span>
                  </label>

                  <label className="modalCheckboxLabel">
                    <input
                      type="checkbox"
                      checked={launchLocalFirst}
                      onChange={(e) => setLaunchLocalFirst(e.target.checked)}
                      disabled={saving}
                    />
                    <span>
                      Prove locally before hosting
                      <small>Keep localhost as the first serious launch gate before any hosted rollout.</small>
                    </span>
                  </label>
                </div>
              </div>
            </section>

            <section className="modalSectionCard">
              <div className="modalArtifactTitle">Governed Starter Pattern</div>
              <div className="modalSectionLead">
                Choose the O2-owned bootstrap contract. This is separate from the reference repos you want inspected and separate from the house style you want the UI to resemble.
              </div>

              <label>Governed Starter Pattern</label>
              <select
                value={patternHint}
                onChange={(e) => {
                  setPatternTouched(true);
                  setPatternHint(e.target.value);
                }}
                disabled={saving || (governedPatterns?.length ?? 0) === 0}
              >
                <option value="">No starter pattern selected</option>
                {compatiblePatterns.map(({ pattern }) => (
                  <option key={pattern.key} value={pattern.key}>
                    {pattern.label}
                  </option>
                ))}
                {(governedPatterns ?? [])
                  .filter(
                    (pattern) =>
                      !compatiblePatterns.some(
                        (entry) => entry.pattern.key === pattern.key,
                      ),
                  )
                  .map((pattern) => (
                    <option key={pattern.key} value={pattern.key}>
                      {pattern.label} (other governed pattern)
                    </option>
                  ))}
              </select>
              <div className="fieldHelp">{patternRecommendationText}</div>

              {selectedPattern ? (
                <div className="modalPatternPanel fieldLabelTop">
                  <div className="modalPatternHeaderRow">
                    <div>
                      <div className="modalPatternTitle">{selectedPattern.label}</div>
                      <div className="fieldHelp">{selectedPattern.summary}</div>
                    </div>
                    {recommendedPattern?.key === selectedPattern.key ? (
                      <span className="modalChip">Recommended by O2</span>
                    ) : null}
                  </div>

                  <div className="modalChipRow">
                    <span className="modalChip">{selectedPattern.key}</span>
                    {selectedPattern.bootstrapMode ? (
                      <span className="modalChip">
                        {normalizePatternLabel(selectedPattern.bootstrapMode)}
                      </span>
                    ) : null}
                    {selectedPatternSecurity ? (
                      <span className="modalChip">
                        Security: {selectedPatternSecurity}
                      </span>
                    ) : null}
                  </div>

                  <div className="modalPatternGrid">
                    <div>
                      <div className="modalGeneratedLabel">Repo Contracts</div>
                      <ul className="modalBulletList">
                        {(selectedPattern.repoContracts ?? []).map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="modalGeneratedLabel">Starter Artifacts</div>
                      <ul className="modalBulletList">
                        {(selectedPattern.starterArtifacts ?? []).map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="modalPatternEmpty fieldLabelTop">
                  Formation can continue without an immediate starter pattern, but O2 follow-up will have less governed starter context.
                </div>
              )}

              <div className="fieldLabelTop modalArtifactTitle">Immediate Run Behavior</div>
              <div className="modalSectionLead">
                Choose what happens right now when you click the primary button: dossier only, or dossier plus the governed localhost starter bootstrap.
              </div>

              <div className="modalDecisionStack">
                <label
                  className={`modalDecisionCard ${
                    !bootstrapNow ? "modalDecisionCardSelected" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="formation-next-step"
                    checked={!bootstrapNow}
                    onChange={() => {
                      setBootstrapChoiceTouched(true);
                      setBootstrapNow(false);
                    }}
                    disabled={saving}
                  />
                  <div>
                    <span>Formation follow-up only</span>
                    <small>
                      O2 writes the origin, intake, and state dossier, then stops at the governed follow-up stage. No repo bootstrap runs yet.
                    </small>
                  </div>
                </label>

                <label
                  className={`modalDecisionCard ${
                    bootstrapNow ? "modalDecisionCardSelected" : ""
                  } ${!bootstrapAllowed ? "modalDecisionCardDisabled" : ""}`}
                >
                  <input
                    type="radio"
                    name="formation-next-step"
                    checked={bootstrapNow}
                    onChange={() => {
                      setBootstrapChoiceTouched(true);
                      setBootstrapNow(true);
                    }}
                    disabled={saving || !bootstrapAllowed}
                  />
                  <div>
                    <span>Formation + starter bootstrap</span>
                    <small>
                      After formation succeeds, O2 immediately creates the repo folder, starter surface, workspace file, registry row, and localhost run target.
                    </small>
                  </div>
                </label>
              </div>

              {!bootstrapAllowed ? (
                <div className="fieldHelp fieldHelpStrong">
                </div>
              ) : buildLane.securityReviewRequired ? (
                <div className="fieldHelp fieldHelpStrong">
                  This frame is security-sensitive. Formation-only is the safer default until the follow-up questions are answered.
                </div>
              ) : null}
            </section>

            <section className="modalSectionCard">
              <div className="modalArtifactTitle">Operator Context</div>
              <div className="modalSectionLead">
                This is the one place to ramble. Put the truths, ideas, risks, and non-goals here so the builder starts from your real intent instead of a thin scaffold prompt.
              </div>

              {showPatternNotes ? (
                <>
                  <label className="fieldLabelTop">
                    {shouldShowRelatedProject
                      ? "Similarity / Inheritance Notes"
                      : "Pattern Adaptation Notes"}
                  </label>
                  <textarea
                    value={similarityNotes}
                    onChange={(e) => setSimilarityNotes(e.target.value)}
                    placeholder={similarityPlaceholder(relationChoice)}
                    disabled={saving}
                    className="modalCompactTextArea"
                  />
                </>
              ) : null}

              <label className="fieldLabelTop">Operator Brief / Ramble</label>
              <textarea
                value={operatorBrief}
                onChange={(e) => setOperatorBrief(e.target.value)}
                placeholder="Write freely here: overall vision, fears, desired tabs, known systems, launch order, people involved, things to preserve, and anything the builder agent should internalize before it proposes structure."
                disabled={saving}
              />

              <label className="fieldLabelTop">Hard Constraints / Non-negotiables</label>
              <textarea
                value={constraints}
                onChange={(e) => setConstraints(e.target.value)}
                placeholder="Known dependencies, security realities, data boundaries, systems that must remain untouched, non-goals, or other hard constraints O2 should preserve."
                disabled={saving}
                className="modalCompactTextArea"
              />

              <details className="modalArtifact fieldLabelTop">
                <summary className="modalDetailsSummary">Advanced Coordinates</summary>
                <div className="modalInlineGrid fieldLabelTop">
                  <div>
                    <label>Display Label Override</label>
                    <input
                      value={computedLabel}
                      onChange={(e) => {
                        setLabelTouched(true);
                        setLabel(e.target.value);
                      }}
                      placeholder="Project display label"
                      disabled={saving}
                    />
                  </div>

                  <div>
                    <label>Technical Kind</label>
                    <select
                      value={kind}
                      onChange={(e) => {
                        setKindTouched(true);
                        setKind(e.target.value as ProjectKind);
                      }}
                      disabled={saving}
                    >
                      {KIND_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="modalInlineGrid fieldLabelTop">
                  <div>
                    <label>Preferred Port</label>
                    <input
                      value={portInput}
                      onChange={(e) => {
                        setPortTouched(true);
                        setPortInput(e.target.value);
                      }}
                      placeholder={shouldShowPort ? "Assigned by O2" : "Not needed"}
                      disabled={saving || !shouldShowPort}
                    />
                  </div>

                  <div>
                    <label>URL</label>
                    <input
                      value={computedUrl}
                      onChange={(e) => {
                        setUrlTouched(true);
                        setUrl(e.target.value);
                      }}
                      placeholder={shouldShowUrl ? "http://localhost:3005" : "Not needed"}
                      disabled={saving || !shouldShowUrl}
                    />
                  </div>
                </div>

                <label className="fieldLabelTop">Repo Path</label>
                <input
                  value={computedRepoPath}
                  onChange={(e) => {
                    setRepoPathTouched(true);
                    setRepoPath(e.target.value);
                  }}
                  placeholder="/home/chris/dev/..."
                  disabled={saving}
                />

                <label className="fieldLabelTop">Repo Hint</label>
                <input
                  value={computedRepoHint}
                  onChange={(e) => {
                    setRepoHintTouched(true);
                    setRepoHint(e.target.value);
                  }}
                  placeholder="radcon/dev/project-key"
                  disabled={saving}
                />
              </details>
            </section>

            {(err || validationError) && (
              <div className="modalErrorBox">{err ?? validationError}</div>
            )}
          </div>

          <div className="modalColumn modalStack">
            <section
              className={`modalSectionCard ${
                buildLane.securityReviewRequired
                  ? "modalRecommendationWarn"
                  : buildLane.buildAgentCandidate
                    ? "modalRecommendationGood"
                    : ""
              }`}
            >
              <div className="modalArtifactTitle">Recommended Build Lane</div>
              <div className="modalRecommendationTitle">{buildLane.label}</div>
              <div className="fieldHelp">{buildLane.reason}</div>
              <div className="modalChipRow">
                <span className="modalChip">{optionLabel(PROJECT_CLASS_OPTIONS, projectClass)}</span>
                <span className="modalChip">{optionLabel(DELIVERY_SURFACE_OPTIONS, deliverySurface)}</span>
                <span className="modalChip">{optionLabel(SECURITY_OPTIONS, securityPosture)}</span>
                <span className="modalChip">{optionLabel(SHELL_PREFERENCE_OPTIONS, shellPreference)}</span>
                {selectedPattern ? (
                  <span className="modalChip">{selectedPattern.label}</span>
                ) : null}
                {buildLane.buildAgentCandidate ? (
                  <span className="modalChip">Build-agent candidate</span>
                ) : null}
                {buildLane.securityReviewRequired ? (
                  <span className="modalChip">Security review first</span>
                ) : null}
                {launchLocalFirst ? <span className="modalChip">Localhost first</span> : null}
                {googleWorkspacePlan === "day_one" ? (
                  <span className="modalChip">Workspace day one</span>
                ) : null}
              </div>
            </section>

            <section className="modalSectionCard">
              <div className="modalArtifactTitle">Execution Path</div>
              <div className="modalGeneratedGrid">
                <div>
                  <div className="modalGeneratedLabel">Formation Action</div>
                  <div className="modalGeneratedValue">
                    {bootstrapNow
                      ? "Formation + starter bootstrap"
                      : "Formation follow-up only"}
                  </div>
                </div>
                <div>
                  <div className="modalGeneratedLabel">Starter Pattern</div>
                  <div className="modalGeneratedValue">
                    {selectedPattern?.label ?? "(none selected)"}
                  </div>
                </div>
                <div>
                  <div className="modalGeneratedLabel">Posture</div>
                  <div className="modalGeneratedValue">
                    {buildLane.securityReviewRequired
                      ? "security review before trusting hosted rollout"
                      : buildLane.buildAgentCandidate
                        ? "agent-plan candidate after formation"
                        : "formation evidence first"}
                  </div>
                </div>
              </div>
            </section>

            <section className="modalSectionCard">
              <div className="modalArtifactTitle">Formation Coordinates</div>
              <div className="modalGeneratedGrid">
                <div>
                  <div className="modalGeneratedLabel">Key</div>
                  <div className="modalGeneratedValue">{key || "(required)"}</div>
                </div>
                <div>
                  <div className="modalGeneratedLabel">Org</div>
                  <div className="modalGeneratedValue">{org}</div>
                </div>
                <div>
                  <div className="modalGeneratedLabel">Technical Kind</div>
                  <div className="modalGeneratedValue">{kind}</div>
                </div>
                <div>
                  <div className="modalGeneratedLabel">Repo Path</div>
                  <div className="modalGeneratedValue">{computedRepoPath || "(required)"}</div>
                </div>
                <div>
                  <div className="modalGeneratedLabel">Repo Hint</div>
                  <div className="modalGeneratedValue">{computedRepoHint || "(auto)"}</div>
                </div>
                <div>
                  <div className="modalGeneratedLabel">Port</div>
                  <div className="modalGeneratedValue">
                    {shouldShowPort ? parsedPort || "(assigned by O2 if omitted)" : "(not needed)"}
                  </div>
                </div>
                <div>
                  <div className="modalGeneratedLabel">URL</div>
                  <div className="modalGeneratedValue">
                    {shouldShowUrl ? computedUrl || "(auto from port)" : "(not needed)"}
                  </div>
                </div>
                <div>
                  <div className="modalGeneratedLabel">Starter Pattern Key</div>
                  <div className="modalGeneratedValue">{patternHint || "(none)"}</div>
                </div>
              </div>
            </section>

            <section className="modalSectionCard">
              <div className="modalArtifactTitle">Seed Artifact Preview</div>
              <div className="modalArtifactPreview">
                <pre>{seedArtifactPreview}</pre>
              </div>
            </section>
          </div>
        </div>

        <div className="modalFooter">
          <div className={`modalFooterMessage ${err || validationError ? "modalFooterMessageWarn" : ""}`}>
            {err ||
              validationError ||
              (bootstrapNow
                ? "Formation and explicit localhost bootstrap will run in sequence. O2 writes the dossier first, then creates the governed starter surface."
                : "Formation writes the O2 dossier only. The next step remains governed follow-up before any starter bootstrap runs.")}
          </div>

          <button
            className="btn btnGhost"
            onClick={onClose}
            disabled={saving}
            type="button"
          >
            Cancel
          </button>

          <button
            className="btn btnPrimary"
            onClick={submit}
            disabled={saving}
            type="button"
          >
            {saving ? "BUILDING…" : "BUILD PROJECT"}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalNode, document.body);
}

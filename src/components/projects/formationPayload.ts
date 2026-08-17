import type {
  AddProjectPayload,
  ProjectAccessModel,
  ProjectArchetype,
  ProjectDeliverySurface,
} from "./types.ts";

export type CanonicalProjectType = "new_website" | "website_successor";
export type OperationsPlacement = "local" | "portal";

export type FormationStartPayload = {
  projectType: CanonicalProjectType;
  name: string; label: string; key: string; org: string; repoPath: string; repoHint: string;
  port?: number; url: string; mission: string; goalSummary: string; track: string;
  problemStatement: string; valueProposition: string;
  relationship: string; technicalKind: string; baseProjectKey: string; similarProjectKey: string;
  referenceRepos: string; versionTag: string; similarityNotes: string; intent: string;
  projectClass: string; projectArchetype: ProjectArchetype; deliverySurface: ProjectDeliverySurface;
  productSurface: "standalone" | "none"; operatorSurface: "embedded" | "none";
  intendedUsers: string; domainIntent: string; googleWorkspacePlan: string; accessModel: string;
  securityPosture: string; buildStrategy: string; needsAuthentication: boolean;
  handlesSensitiveData: boolean; launchLocalFirst: boolean;
  foundationBlueprint: string; needsAdminSurface: boolean;
  needsCommerceSurface: boolean;
  needsPersistentData: boolean; needsFileUploads: boolean; needsEmailDelivery: boolean;
  needsOperatorSurface: boolean; needsHostedDelivery: boolean;
  approvedProjectIntentDigest?: string;
  initialConstraints: string; notes: string;
};

const canonicalProjectTypeMap: Record<string, CanonicalProjectType> = {
  website: "new_website", new_website: "new_website",
  successor: "website_successor", website_successor: "website_successor",
  "v.x.x website from existing website": "website_successor",
};

function normalizeProjectType(payload: AddProjectPayload): CanonicalProjectType {
  const rawProjectType = payload.projectType?.trim().toLowerCase() || "";
  const rawKind = payload.kind?.trim().toLowerCase() || "";
  if (rawProjectType in canonicalProjectTypeMap) return canonicalProjectTypeMap[rawProjectType];
  if (rawKind in canonicalProjectTypeMap) return canonicalProjectTypeMap[rawKind];
  return payload.parentProjectKey?.trim() ? "website_successor" : "new_website";
}

export function architectureForOperationsPlacement(placement: OperationsPlacement): {
  projectArchetype: ProjectArchetype;
  deliverySurface: ProjectDeliverySurface;
  productSurface: "none";
  operatorSurface: "embedded" | "none";
  accessModel: ProjectAccessModel;
  needsOperatorSurface: boolean;
  needsHostedDelivery: boolean;
} {
  return placement === "local"
    ? { projectArchetype: "local-control-plane", deliverySurface: "local_dashboard", productSurface: "none", operatorSurface: "none", accessModel: "local_only", needsOperatorSurface: false, needsHostedDelivery: false }
    : { projectArchetype: "portal-private-app", deliverySurface: "operations_workspace", productSurface: "none", operatorSurface: "embedded", accessModel: "internal_login", needsOperatorSurface: true, needsHostedDelivery: true };
}

function normalizedArchitecture(payload: AddProjectPayload) {
  const deliverySurface = payload.deliverySurface?.trim() as ProjectDeliverySurface | undefined;
  const operatorSurface = payload.operatorSurface ?? (payload.needsOperatorSurface ? "embedded" : "none");
  const productSurface = payload.productSurface ?? (
    deliverySurface === "public_website" || deliverySurface === "private_portal"
      ? "standalone"
      : payload.accessModel && ["public", "mixed", "role_based_private", "family_partner_roles"].includes(payload.accessModel)
        ? "standalone"
        : "none"
  );
  const normalizedDelivery = deliverySurface ?? (productSurface === "standalone" ? "public_website" : "local_dashboard");
  const derivedArchetype: ProjectArchetype = productSurface === "standalone"
    ? "standalone-product"
    : normalizedDelivery === "operations_workspace" || payload.projectClass === "internal_operations"
      ? (operatorSurface === "embedded" ? "portal-private-app" : "local-control-plane")
      : "prototype";
  const projectArchetype = payload.projectArchetype?.trim() as ProjectArchetype | undefined ?? derivedArchetype;

  const contradiction =
    (projectArchetype === "standalone-product" && productSurface !== "standalone") ||
    (projectArchetype !== "standalone-product" && productSurface === "standalone") ||
    (projectArchetype === "portal-private-app" && operatorSurface !== "embedded") ||
    (projectArchetype === "local-control-plane" && operatorSurface !== "none") ||
    (projectArchetype === "prototype" && operatorSurface === "embedded");
  if (contradiction) {
    throw new Error(`Contradictory project architecture: ${projectArchetype}, product ${productSurface}, operator ${operatorSurface}.`);
  }
  return { projectArchetype, deliverySurface: normalizedDelivery, productSurface, operatorSurface };
}

export function normalizeFormationStartPayload(payload: AddProjectPayload): FormationStartPayload {
  const architecture = normalizedArchitecture(payload);
  const projectType = normalizeProjectType(payload);
  const mission = payload.mission?.trim() || payload.notes?.trim() || "No mission provided yet.";
  return {
    projectType, name: (payload.label || payload.key).trim(), label: (payload.label || payload.key).trim(), key: payload.key.trim(),
    org: (payload.org || "other").trim(), repoPath: payload.repoPath.trim(), repoHint: payload.repoHint?.trim() || "",
    port: payload.port, url: payload.url?.trim() || "", mission,
    problemStatement: payload.problemStatement?.trim() || "",
    valueProposition: payload.valueProposition?.trim() || "",
    goalSummary: payload.goalSummary?.trim() || "",
    track: "production", relationship: (payload.relationship || "new").trim(), technicalKind: (payload.kind || "other").trim(),
    baseProjectKey: payload.parentProjectKey?.trim() || "", similarProjectKey: payload.similarProjectKey?.trim() || "",
    referenceRepos: payload.referenceRepos?.trim() || "", versionTag: "", similarityNotes: payload.similarityNotes?.trim() || "",
    intent: (payload.intent || "production").trim(), projectClass: payload.projectClass?.trim() || "other", ...architecture,
    intendedUsers: payload.intendedUsers?.trim() || "", domainIntent: payload.domainIntent?.trim() || "",
    googleWorkspacePlan: payload.googleWorkspacePlan?.trim() || "unknown", accessModel: payload.accessModel?.trim() || "unknown",
    securityPosture: payload.securityPosture?.trim() || "standard", buildStrategy: payload.buildStrategy?.trim() || "guided_followup",
    needsAuthentication: Boolean(payload.needsAuthentication), handlesSensitiveData: Boolean(payload.handlesSensitiveData),
    launchLocalFirst: Boolean(payload.launchLocalFirst),
    foundationBlueprint: payload.foundationBlueprint?.trim() || "o2_web_foundation_v1",
    needsAdminSurface: Boolean(payload.needsAdminSurface), needsCommerceSurface: Boolean(payload.needsCommerceSurface),
    needsPersistentData: Boolean(payload.needsPersistentData), needsFileUploads: Boolean(payload.needsFileUploads),
    needsEmailDelivery: Boolean(payload.needsEmailDelivery), needsOperatorSurface: architecture.operatorSurface === "embedded",
    needsHostedDelivery: payload.needsHostedDelivery ?? (
      architecture.projectArchetype === "standalone-product" || architecture.projectArchetype === "portal-private-app"
    ), ...(payload.approvedProjectIntentDigest?.trim()
      ? { approvedProjectIntentDigest: payload.approvedProjectIntentDigest.trim() }
      : {}),
    initialConstraints: payload.initialConstraints?.trim() || "", notes: payload.notes?.trim() || "",
  };
}

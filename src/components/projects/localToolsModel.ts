import type { ProjectRow } from "./types";
import { isOperatorVisibleProject } from "./projectModel.ts";

export type LocalToolsAsset = {
  assetKey: string;
  label: string;
  assetType: string;
  provider: string;
  owningOrg: string;
  environmentScope: string;
  governedState: string;
  relatedProjectKeys: string[];
  primaryConsoleUrl: string;
  canonicalDomain: string;
  notesPath: string;
  inventoryArtifactPath: string;
  originArtifactPath: string;
  updatedAt: string;
  mtime: number;
};

export type LocalToolsProfile = {
  key: string;
  label: string;
  provider: string;
  assetType: string;
  category: string;
  owningOrg: string;
  environmentScope: string;
  primaryConsoleUrl: string;
  focusSummary: string;
  statusAuditFocus: string;
  mcpApiPosture: string;
  billingFocus: string;
  role: string;
  statusSummary: string;
  relatedProjectKeys: string[];
};

export type LocalToolsEntry = {
  key: string;
  label: string;
  provider: string;
  assetType: string;
  category: string;
  owningOrg: string;
  environmentScope: string;
  governedState: string;
  primaryConsoleUrl: string;
  canonicalDomains: string[];
  relatedProjectKeys: string[];
  notesPath: string;
  updatedAt: string;
  focusSummary: string;
  statusAuditFocus: string;
  mcpApiPosture: string;
  billingFocus: string;
  linkedAssets: LocalToolsAsset[];
  configurationPath: string;
  profile?: LocalToolsProfile;
};

export type LocalToolsDraft = {
  templateId: string;
  label: string;
  assetType: string;
  provider: string;
  owningOrg: string;
  environmentScope: string;
  relatedProjectKeys: string;
  role: string;
  canonicalDomain: string;
  primaryConsoleUrl: string;
  statusSummary: string;
};

export const RECORDS_DIR = "docs/infrastructure/records";
export const INFRASTRUCTURE_NOTES_DIR = "docs/infrastructure/assets";
export const HOST_GUARDIAN_ASSET_KEY = "system76-workstation";
export const DEFAULT_OPEN_QUESTIONS =
  "- Which provider-side health, API, or billing checks should be automated first?";

export const ASSET_TYPE_OPTIONS = ["local_toolchain", "mcp_surface"] as const;

export const ENVIRONMENT_SCOPE_OPTIONS = ["local"] as const;

export function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

export function normalizeKey(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function notePathForKey(key: string): string {
  return `${INFRASTRUCTURE_NOTES_DIR}/${normalizeKey(key)}/NOTES.md`;
}

export function configurationPathForKey(key: string): string {
  return `${INFRASTRUCTURE_NOTES_DIR}/${normalizeKey(key)}/CONFIGURATION.md`;
}

export function formatIsoDateTime(value?: string): string {
  if (!value) return "Not recorded";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

export function projectLabelsForKeys(keys: string[], projects: ProjectRow[]): string {
  if (!keys.length) return "None linked";

  const byKey = new Map(projects.map((project) => [project.key, project.label]));
  return keys
    .map((key) => byKey.get(key) || key)
    .join(", ");
}

export function sortAssets(items: LocalToolsAsset[]): LocalToolsAsset[] {
  return [...items].sort((a, b) => {
    if (a.mtime !== b.mtime) return b.mtime - a.mtime;
    return a.label.localeCompare(b.label);
  });
}

export function parseLocalToolsAsset(
  raw: string,
  inventoryPath: string,
  mtime: number,
): LocalToolsAsset | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const assetKey = asString(parsed.assetKey);
    const label = asString(parsed.label);
    if (!assetKey || !label) return null;

    const assetDir = inventoryPath.replace(/\/01_inventory\.json$/u, "");
    const canonicalNotesPath = asString(parsed.canonicalNotesPath);

    return {
      assetKey,
      label,
      assetType: asString(parsed.assetType) || "other",
      provider: asString(parsed.provider) || "unknown",
      owningOrg: asString(parsed.owningOrg) || "unknown",
      environmentScope: asString(parsed.environmentScope) || "other",
      governedState: asString(parsed.governedState) || "active",
      relatedProjectKeys: asStringArray(parsed.relatedProjectKeys),
      primaryConsoleUrl: asString(parsed.primaryConsoleUrl),
      canonicalDomain: asString(parsed.canonicalDomain),
      notesPath: canonicalNotesPath || notePathForKey(assetKey),
      inventoryArtifactPath: inventoryPath,
      originArtifactPath: `${assetDir}/00_origin.md`,
      updatedAt: asString(parsed.updatedAt),
      mtime,
    };
  } catch {
    return null;
  }
}

export function derivePreferredProjectKeys(projects: ProjectRow[]): string[] {
  return projects
    .filter((project) => !project.retired && isOperatorVisibleProject(project))
    .map((project) => project.key);
}

export function buildLocalToolsProfiles(projects: ProjectRow[]): LocalToolsProfile[] {
  const activeProjectKeys = derivePreferredProjectKeys(projects);
  const defaultProjectKeys = activeProjectKeys;

  return [
    {
      key: "docker",
      label: "Docker",
      provider: "docker",
      assetType: "local_toolchain",
      category: "Local Containers",
      owningOrg: "radcon",
      environmentScope: "local",
      primaryConsoleUrl: "https://hub.docker.com",
      focusSummary: "Track containerized local services, compose stacks, port collisions, and what local development surfaces depend on Docker.",
      statusAuditFocus: "Review local stack dependencies, image freshness, volume persistence, and whether container usage is documented clearly enough.",
      mcpApiPosture: "Local Docker status can later be surfaced via governed scripts or agent checks, including running containers and exposed ports.",
      billingFocus: "Usually low direct cost, but still record any paid registry, hosted image, or license dependency.",
      role: "Local container runtime supporting governed development and support services.",
      statusSummary: "Use this for local stack dependencies, container lifecycle, and port-management review.",
      relatedProjectKeys: defaultProjectKeys,
    },
    {
      key: "agent-mcp-surfaces",
      label: "Agent / MCP Surfaces",
      provider: "local",
      assetType: "mcp_surface",
      category: "Automation Surfaces",
      owningOrg: "radcon",
      environmentScope: "local",
      primaryConsoleUrl: "",
      focusSummary: "Track which MCP, API, and agent-management surfaces are available to RadControl and how reliably they are wired.",
      statusAuditFocus: "Review connector coverage, local agent surfaces, API reachability, and where manual operations still block automation.",
      mcpApiPosture: "This is the direct place to capture MCP/API availability, connector gaps, and next integrations for RadControl.",
      billingFocus: "Usually low direct cost, but record any API plan or connector licensing that affects agent operations.",
      role: "Governed automation layer for agents, connectors, MCP surfaces, and empire orchestration.",
      statusSummary: "Use this for agent tooling coverage, API availability, and orchestration readiness.",
      relatedProjectKeys: ["radcontrol", ...defaultProjectKeys],
    },
  ];
}

export function draftFromProfile(profile: LocalToolsProfile): LocalToolsDraft {
  return {
    templateId: profile.key,
    label: profile.label,
    assetType: profile.assetType,
    provider: profile.provider,
    owningOrg: profile.owningOrg,
    environmentScope: profile.environmentScope,
    relatedProjectKeys: profile.relatedProjectKeys.join(", "),
    role: profile.role,
    canonicalDomain: "",
    primaryConsoleUrl: profile.primaryConsoleUrl,
    statusSummary: profile.statusSummary,
  };
}

export function deriveEnvironmentScope(
  profile: LocalToolsProfile | undefined,
  assets: LocalToolsAsset[],
): string {
  const scopes = uniqueStrings(assets.map((asset) => asset.environmentScope));
  if (scopes.length === 0) return profile?.environmentScope || "other";
  if (scopes.length === 1) return scopes[0];
  return "mixed";
}

export function deriveGovernedState(assets: LocalToolsAsset[]): string {
  const states = uniqueStrings(assets.map((asset) => asset.governedState));
  if (states.length === 0) return "starter profile";
  if (states.length === 1) return states[0];
  return "mixed";
}

export function buildLocalToolsEntries(
  assets: LocalToolsAsset[],
  profiles: LocalToolsProfile[],
): LocalToolsEntry[] {
  const visibleAssets = assets.filter(
    (asset) => normalizeKey(asset.assetKey) !== HOST_GUARDIAN_ASSET_KEY && asset.assetType !== "workstation" && (asset.environmentScope === "local" || ["local_toolchain", "mcp_surface"].includes(asset.assetType)),
  );
  const usedAssetKeys = new Set<string>();
  const entries: LocalToolsEntry[] = [];
  const providerProfileCounts = profiles.reduce((counts, profile) => {
    const providerKey = normalizeKey(profile.provider);
    counts.set(providerKey, (counts.get(providerKey) || 0) + 1);
    return counts;
  }, new Map<string, number>());

  profiles.forEach((profile) => {
    const linkedAssets = visibleAssets.filter((asset) => {
      const providerKey = normalizeKey(profile.provider);
      const providerMatch =
        providerProfileCounts.get(providerKey) === 1 &&
        normalizeKey(asset.provider) === providerKey;
      const keyMatch = normalizeKey(asset.assetKey) === normalizeKey(profile.key);
      return providerMatch || keyMatch;
    });

    linkedAssets.forEach((asset) => usedAssetKeys.add(asset.assetKey));

    const relatedProjectKeys = uniqueStrings([
      ...profile.relatedProjectKeys,
      ...linkedAssets.flatMap((asset) => asset.relatedProjectKeys),
    ]);

    const canonicalDomains = uniqueStrings(
      linkedAssets.map((asset) => asset.canonicalDomain).filter(Boolean),
    );

    const updatedValues = linkedAssets
      .map((asset) => asset.updatedAt)
      .filter(Boolean)
      .sort();
    const latestUpdatedAt = updatedValues.length ? updatedValues[updatedValues.length - 1] : "";

    entries.push({
      key: profile.key,
      label: profile.label,
      provider: profile.provider,
      assetType: profile.assetType,
      category: profile.category,
      owningOrg: profile.owningOrg,
      environmentScope: deriveEnvironmentScope(profile, linkedAssets),
      governedState: deriveGovernedState(linkedAssets),
      primaryConsoleUrl:
        linkedAssets.find((asset) => asset.primaryConsoleUrl)?.primaryConsoleUrl ||
        profile.primaryConsoleUrl,
      canonicalDomains,
      relatedProjectKeys,
      notesPath: notePathForKey(profile.key),
      updatedAt: latestUpdatedAt,
      focusSummary: profile.focusSummary,
      statusAuditFocus: profile.statusAuditFocus,
      mcpApiPosture: profile.mcpApiPosture,
      billingFocus: profile.billingFocus,
      linkedAssets,
      configurationPath: configurationPathForKey(profile.key),
      profile,
    });
  });

  visibleAssets
    .filter((asset) => !usedAssetKeys.has(asset.assetKey))
    .forEach((asset) => {
      entries.push({
        key: asset.assetKey,
        label: asset.label,
        provider: asset.provider,
        assetType: asset.assetType,
        category: "Custom LocalTools Record",
        owningOrg: asset.owningOrg,
        environmentScope: asset.environmentScope,
        governedState: asset.governedState,
        primaryConsoleUrl: asset.primaryConsoleUrl,
        canonicalDomains: asset.canonicalDomain ? [asset.canonicalDomain] : [],
        relatedProjectKeys: asset.relatedProjectKeys,
        notesPath: asset.notesPath,
        configurationPath: configurationPathForKey(asset.assetKey),
        updatedAt: asset.updatedAt,
        focusSummary: "This governed record does not yet map to a standard infrastructure profile. Use notes to capture what it owns and why it matters.",
        statusAuditFocus: "Review what this record owns, whether it overlaps another platform entry, and whether a clearer infrastructure category is needed.",
        mcpApiPosture: "No platform-specific MCP/API posture is recorded yet.",
        billingFocus: "No platform-specific billing posture is recorded yet.",
        linkedAssets: [asset],
      });
    });

  return entries;
}

export function starterSelectionKey(profile: LocalToolsProfile | undefined, assetKey?: string): string | null {
  if (profile) return profile.key;
  if (assetKey) return assetKey;
  return null;
}

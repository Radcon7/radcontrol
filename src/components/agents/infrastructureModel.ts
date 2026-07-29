import type { ProjectRow } from "../projects/types";

export type InfrastructureAsset = {
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

export type InfrastructureProfile = {
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

export type InfrastructureEntry = {
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
  linkedAssets: InfrastructureAsset[];
  configurationPath: string;
  profile?: InfrastructureProfile;
};

export type InfrastructureDraft = {
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
export const DEFAULT_OPEN_QUESTIONS =
  "- Which provider-side health, API, or billing checks should be automated first?";

export const ASSET_TYPE_OPTIONS = [
  "platform_account",
  "source_control",
  "hosting_platform",
  "data_platform",
  "workspace_tenant",
  "local_toolchain",
  "workstation",
  "domain_edge",
  "mcp_surface",
  "api_surface",
  "other",
] as const;

export const ENVIRONMENT_SCOPE_OPTIONS = [
  "local",
  "preview",
  "production",
  "mixed",
  "other",
] as const;

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

export function sortAssets(items: InfrastructureAsset[]): InfrastructureAsset[] {
  return [...items].sort((a, b) => {
    if (a.mtime !== b.mtime) return b.mtime - a.mtime;
    return a.label.localeCompare(b.label);
  });
}

export function parseInfrastructureAsset(
  raw: string,
  inventoryPath: string,
  mtime: number,
): InfrastructureAsset | null {
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
    .filter((project) => !project.retired)
    .map((project) => project.key)
    .filter((key) => key !== "o2" && key !== "radcontrol")
    .slice(0, 4);
}

export function buildInfrastructureProfiles(projects: ProjectRow[]): InfrastructureProfile[] {
  const activeProjectKeys = derivePreferredProjectKeys(projects);
  const dqotdProjectKey =
    projects.find((project) => project.key === "dqotd")?.key || activeProjectKeys[0] || "dqotd";
  const defaultProjectKeys = activeProjectKeys.length ? activeProjectKeys : [dqotdProjectKey];

  return [
    {
      key: "cloudflare",
      label: "Cloudflare",
      provider: "cloudflare",
      assetType: "domain_edge",
      category: "DNS & Edge",
      owningOrg: "radcon",
      environmentScope: "production",
      primaryConsoleUrl: "https://dash.cloudflare.com",
      focusSummary: "Track DNS, domain routing, SSL/TLS posture, redirects, origin mapping, and edge security under one governed platform view.",
      statusAuditFocus: "Review ownership, DNS health, SSL mode, redirect rules, and any domain renewal or edge-service drift.",
      mcpApiPosture: "Cloudflare API automation is possible. RadControl MCP/API checks are not wired yet and should report zone, DNS, and edge status later.",
      billingFocus: "Capture domain renewal responsibility, payment method confidence, and any paid edge or security services.",
      role: "Primary DNS, domain, and edge-control surface for empire web properties.",
      statusSummary: "Use this for domains, edge routing, SSL posture, and account-level ownership checks.",
      relatedProjectKeys: defaultProjectKeys,
    },
    {
      key: "github",
      label: "GitHub",
      provider: "github",
      assetType: "source_control",
      category: "Source Control",
      owningOrg: "radcon",
      environmentScope: "mixed",
      primaryConsoleUrl: "https://github.com",
      focusSummary: "Track repo health, branch hygiene, remote ownership, and push readiness across governed codebases.",
      statusAuditFocus: "Review account access, org/repo ownership, branch protection, secret posture, and which repos are actively backing projects.",
      mcpApiPosture: "GitHub API and connector usage should eventually report repository status, push drift, and action/secret posture inside RadControl.",
      billingFocus: "Record plan tier, seat count, private repo exposure, and whether any paid automation or CI costs are in play.",
      role: "Primary governed source-control surface for projects and internal tools.",
      statusSummary: "Use this for repo inventory, push status, access control, and branch-governance review.",
      relatedProjectKeys: defaultProjectKeys,
    },
    {
      key: "vercel",
      label: "Vercel",
      provider: "vercel",
      assetType: "hosting_platform",
      category: "Hosting & Deployments",
      owningOrg: "radcon",
      environmentScope: "preview",
      primaryConsoleUrl: "https://vercel.com/dashboard",
      focusSummary: "Track hosted apps, preview and production environments, domain attachments, deploy health, and environment variables.",
      statusAuditFocus: "Review plan limits, domain binding, environment variables, production readiness, and which projects are actively deployed.",
      mcpApiPosture: "Vercel API status should later surface deploy health, project ownership, environment drift, and domain attachments.",
      billingFocus: "Record plan, usage exposure, team ownership, and any bandwidth or seat-related cost drift.",
      role: "Primary hosting and preview deployment surface for empire websites.",
      statusSummary: "Use this for deployment status, domain binding, and environment readiness.",
      relatedProjectKeys: defaultProjectKeys,
    },
    {
      key: "supabase",
      label: "Supabase",
      provider: "supabase",
      assetType: "data_platform",
      category: "Data & Auth",
      owningOrg: "radcon",
      environmentScope: "mixed",
      primaryConsoleUrl: "https://supabase.com/dashboard/projects",
      focusSummary: "Track database, auth, storage, backups, environment separation, and migration posture for governed apps.",
      statusAuditFocus: "Review project ownership, auth settings, storage use, environment separation, and migration or secret drift.",
      mcpApiPosture: "Supabase API status should later surface project health, auth posture, storage usage, and backup confidence.",
      billingFocus: "Record plan, database/storage usage, and any cost or retention risk on project backends.",
      role: "Primary governed backend platform for data, auth, and storage surfaces.",
      statusSummary: "Use this for data-platform ownership, auth readiness, and backend risk review.",
      relatedProjectKeys: defaultProjectKeys,
    },
    {
      key: "resend",
      label: "Resend",
      provider: "resend",
      assetType: "api_surface",
      category: "Email Delivery",
      owningOrg: "radcon",
      environmentScope: "mixed",
      primaryConsoleUrl: "https://resend.com",
      focusSummary: "Track DQOTD transactional sender-domain verification, API-key scope, delivery health, and the separation between provider configuration and mailbox ownership.",
      statusAuditFocus: "Review sender-domain verification, Cloudflare DNS posture, Preview versus Production environment wiring, delivery logs, and the absence of secrets from governed records.",
      mcpApiPosture: "Resend API status can later surface sender-domain and delivery health. RadControl does not yet maintain those checks.",
      billingFocus: "Record plan tier, sending volume, domain ownership, and any deliverability or usage-cost drift.",
      role: "Transactional email delivery provider for DQOTD verification, password reset, and public contact/report delivery.",
      statusSummary: "Use this for DQOTD sender-domain setup, delivery proof, and email-provider ownership.",
      relatedProjectKeys: [dqotdProjectKey],
    },
    {
      key: "google-workspace",
      label: "Radcon Workspace",
      provider: "google",
      assetType: "workspace_tenant",
      category: "Identity & Mail",
      owningOrg: "radcon",
      environmentScope: "production",
      primaryConsoleUrl: "https://admin.google.com",
      focusSummary: "Track workspace identity, inbox ownership, admin roles, billing, and domain verification for empire operations.",
      statusAuditFocus: "Review domain verification, super-admin coverage, mailbox readiness, billing, and which projects need a tenant behind them.",
      mcpApiPosture: "Workspace APIs may later report tenant health and service readiness. RadControl does not yet maintain those checks.",
      billingFocus: "Capture plan, seat count, renewal posture, and who owns critical admin and inbox accounts.",
      role: "Primary identity, collaboration, and mail layer for business and website operations.",
      statusSummary: "Use this for admin/billing posture, mailbox readiness, and domain/workspace linkage.",
      relatedProjectKeys: defaultProjectKeys,
    },
    {
      key: "dqotd-workspace",
      label: "DQOTD Workspace",
      provider: "google",
      assetType: "workspace_tenant",
      category: "Identity & Mail",
      owningOrg: "radcon",
      environmentScope: "production",
      primaryConsoleUrl: "https://admin.google.com",
      focusSummary: "Track DQOTD domain identity, administrator coverage, recovery, billing, and the hello mailbox separately from the Radcon tenant.",
      statusAuditFocus: "Review domain verification, super-admin and recovery coverage, mailbox readiness, mail authentication, billing, and application-email boundaries.",
      mcpApiPosture: "Workspace APIs may later report tenant health and service readiness. RadControl does not yet maintain those checks.",
      billingFocus: "Capture the DQOTD Workspace plan, seat count, renewal posture, and ownership of critical administrator and mailbox accounts.",
      role: "Dedicated identity and human email tenant for Dinosaur Question of the Day.",
      statusSummary: "Use this for DQOTD Workspace administration, mailbox readiness, and domain email posture.",
      relatedProjectKeys: [dqotdProjectKey],
    },
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
      key: "system76-workstation",
      label: "System76 Workstation",
      provider: "system76",
      assetType: "workstation",
      category: "Primary Machine",
      owningOrg: "radcon",
      environmentScope: "local",
      primaryConsoleUrl: "",
      focusSummary: "Track the health of the primary development machine, local services, workspace setup, and backup or access risk.",
      statusAuditFocus: "Review OS updates, disk pressure, browser/workspace setup, local credentials, SSH posture, and backup confidence.",
      mcpApiPosture: "Machine-level health should later be surfaced by local scripts or agents rather than external APIs.",
      billingFocus: "No recurring platform bill, but note hardware lifecycle, backup cost, and any local tooling subscriptions tied to the machine.",
      role: "Primary governed workstation for RadControl, repo work, and empire operations.",
      statusSummary: "Use this for workstation readiness, local access, and backup posture.",
      relatedProjectKeys: ["radcontrol", ...defaultProjectKeys],
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

export function draftFromProfile(profile: InfrastructureProfile): InfrastructureDraft {
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
  profile: InfrastructureProfile | undefined,
  assets: InfrastructureAsset[],
): string {
  const scopes = uniqueStrings(assets.map((asset) => asset.environmentScope));
  if (scopes.length === 0) return profile?.environmentScope || "other";
  if (scopes.length === 1) return scopes[0];
  return "mixed";
}

export function deriveGovernedState(assets: InfrastructureAsset[]): string {
  const states = uniqueStrings(assets.map((asset) => asset.governedState));
  if (states.length === 0) return "starter profile";
  if (states.length === 1) return states[0];
  return "mixed";
}

export function buildInfrastructureEntries(
  assets: InfrastructureAsset[],
  profiles: InfrastructureProfile[],
): InfrastructureEntry[] {
  const usedAssetKeys = new Set<string>();
  const entries: InfrastructureEntry[] = [];
  const providerProfileCounts = profiles.reduce((counts, profile) => {
    const providerKey = normalizeKey(profile.provider);
    counts.set(providerKey, (counts.get(providerKey) || 0) + 1);
    return counts;
  }, new Map<string, number>());

  profiles.forEach((profile) => {
    const linkedAssets = assets.filter((asset) => {
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

  assets
    .filter((asset) => !usedAssetKeys.has(asset.assetKey))
    .forEach((asset) => {
      entries.push({
        key: asset.assetKey,
        label: asset.label,
        provider: asset.provider,
        assetType: asset.assetType,
        category: "Custom Infrastructure Record",
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

export function starterSelectionKey(profile: InfrastructureProfile | undefined, assetKey?: string): string | null {
  if (profile) return profile.key;
  if (assetKey) return assetKey;
  return null;
}

import { useEffect, useMemo, useRef, useState } from "react";
import {
  listO2Files,
  readO2File,
  runO2PayloadParsedJson,
} from "../common/o2Files";
import { persistGovernedRecordNote } from "../common/governedRecordNote";
import { SystemStateShell } from "../common/SystemStateShell";
import type { ProjectRow } from "../projects/types";

type CreateInfrastructureJson = {
  ok?: boolean;
  assetKey?: string;
  originArtifactPath?: string;
  inventoryArtifactPath?: string;
  error?: string;
};

type Props = {
  projects: ProjectRow[];
  onAppendLog: (text: string) => void;
  registerBeforeTabChangeSaver?: (fn: (() => Promise<boolean>) | null) => void;
};

type InfrastructureAsset = {
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

type InfrastructureProfile = {
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

type InfrastructureEntry = {
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
  profile?: InfrastructureProfile;
};

type InfrastructureDraft = {
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

const RECORDS_DIR = "docs/infrastructure/records";
const INFRASTRUCTURE_NOTES_DIR = "docs/infrastructure/assets";
const DEFAULT_OPEN_QUESTIONS =
  "- Which provider-side health, API, or billing checks should be automated first?";

const ASSET_TYPE_OPTIONS = [
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

const ENVIRONMENT_SCOPE_OPTIONS = [
  "local",
  "preview",
  "production",
  "mixed",
  "other",
] as const;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function normalizeKey(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function notePathForKey(key: string): string {
  return `${INFRASTRUCTURE_NOTES_DIR}/${normalizeKey(key)}/NOTES.md`;
}

function formatIsoDateTime(value?: string): string {
  if (!value) return "Not recorded";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

function projectLabelsForKeys(keys: string[], projects: ProjectRow[]): string {
  if (!keys.length) return "None linked";

  const byKey = new Map(projects.map((project) => [project.key, project.label]));
  return keys
    .map((key) => byKey.get(key) || key)
    .join(", ");
}

function sortAssets(items: InfrastructureAsset[]): InfrastructureAsset[] {
  return [...items].sort((a, b) => {
    if (a.mtime !== b.mtime) return b.mtime - a.mtime;
    return a.label.localeCompare(b.label);
  });
}

function parseInfrastructureAsset(
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

function derivePreferredProjectKeys(projects: ProjectRow[]): string[] {
  return projects
    .filter((project) => !project.retired)
    .map((project) => project.key)
    .filter((key) => key !== "o2" && key !== "radcontrol")
    .slice(0, 4);
}

function buildInfrastructureProfiles(projects: ProjectRow[]): InfrastructureProfile[] {
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
      key: "google-workspace",
      label: "Google Workspace",
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

function draftFromProfile(profile: InfrastructureProfile): InfrastructureDraft {
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

function deriveEnvironmentScope(
  profile: InfrastructureProfile | undefined,
  assets: InfrastructureAsset[],
): string {
  const scopes = uniqueStrings(assets.map((asset) => asset.environmentScope));
  if (scopes.length === 0) return profile?.environmentScope || "other";
  if (scopes.length === 1) return scopes[0];
  return "mixed";
}

function deriveGovernedState(assets: InfrastructureAsset[]): string {
  const states = uniqueStrings(assets.map((asset) => asset.governedState));
  if (states.length === 0) return "starter profile";
  if (states.length === 1) return states[0];
  return "mixed";
}

function buildInfrastructureEntries(
  assets: InfrastructureAsset[],
  profiles: InfrastructureProfile[],
): InfrastructureEntry[] {
  const usedAssetKeys = new Set<string>();
  const entries: InfrastructureEntry[] = [];

  profiles.forEach((profile) => {
    const linkedAssets = assets.filter((asset) => {
      const providerMatch = normalizeKey(asset.provider) === normalizeKey(profile.provider);
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

function starterSelectionKey(profile: InfrastructureProfile | undefined, assetKey?: string): string | null {
  if (profile) return profile.key;
  if (assetKey) return assetKey;
  return null;
}

function openExternalUrl(url: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function InfrastructureTab({
  projects,
  onAppendLog,
  registerBeforeTabChangeSaver,
}: Props) {
  const profiles = useMemo(() => buildInfrastructureProfiles(projects), [projects]);
  const defaultProfile = profiles[0];

  const [entries, setEntries] = useState<InfrastructureEntry[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [err, setErr] = useState("");
  const [draft, setDraft] = useState<InfrastructureDraft>(() =>
    draftFromProfile(defaultProfile),
  );
  const [notesText, setNotesText] = useState("");
  const [notesPath, setNotesPath] = useState<string | null>(null);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesError, setNotesError] = useState("");
  const [notesSavedAt, setNotesSavedAt] = useState<number | null>(null);
  const [notesFileExists, setNotesFileExists] = useState(false);
  const notesRevisionRef = useRef(0);
  const notesPathRef = useRef<string | null>(null);
  const notesTextRef = useRef("");
  const notesLoadingRef = useRef(false);

  useEffect(() => {
    notesPathRef.current = notesPath;
  }, [notesPath]);

  useEffect(() => {
    notesTextRef.current = notesText;
  }, [notesText]);

  useEffect(() => {
    notesLoadingRef.current = notesLoading;
  }, [notesLoading]);

  async function flushGovernedNotes(): Promise<boolean> {
    if (notesRevisionRef.current === 0) return true;

    const path = notesPathRef.current;
    if (!path || notesLoadingRef.current) return false;

    setNotesSaving(true);
    setNotesError("");
    try {
      const savedAt = await persistGovernedRecordNote(
        path,
        notesTextRef.current,
      );
      notesRevisionRef.current = 0;
      setNotesSavedAt(savedAt);
      return true;
    } catch (error) {
      setNotesError(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setNotesSaving(false);
    }
  }

  useEffect(() => {
    if (!registerBeforeTabChangeSaver) return;
    registerBeforeTabChangeSaver(flushGovernedNotes);
    return () => registerBeforeTabChangeSaver(null);
  });

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.key === selectedKey) || null,
    [entries, selectedKey],
  );

  async function refreshAssets(preferredKey?: string | null): Promise<void> {
    setLoading(true);
    setErr("");

    try {
      const listed = await listO2Files(RECORDS_DIR);
      const inventoryItems = (listed.items || [])
        .filter((item) => typeof item.path === "string")
        .filter((item) => (item.path || "").startsWith(`${RECORDS_DIR}/`))
        .filter((item) => (item.path || "").endsWith("/01_inventory.json"));

      const parsedAssets = await Promise.all(
        inventoryItems.map(async (item) => {
          const inventoryPath = item.path || "";
          const read = await readO2File(inventoryPath);
          return parseInfrastructureAsset(
            read.content || "",
            inventoryPath,
            typeof item.mtime === "number" ? item.mtime : 0,
          );
        }),
      );

      const nextAssets = sortAssets(parsedAssets.filter(Boolean) as InfrastructureAsset[]);
      const nextEntries = buildInfrastructureEntries(nextAssets, profiles);

      setEntries(nextEntries);
      setSelectedKey((current) => {
        if (preferredKey && nextEntries.some((entry) => entry.key === preferredKey)) {
          return preferredKey;
        }
        if (current && nextEntries.some((entry) => entry.key === current)) {
          return current;
        }
        return nextEntries[0]?.key || null;
      });
    } catch (error) {
      setErr(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles]);

  useEffect(() => {
    let cancelled = false;

    async function loadNotes() {
      if (!selectedEntry) {
        setNotesPath(null);
        setNotesText("");
        setNotesError("");
        setNotesSavedAt(null);
        setNotesFileExists(false);
        setNotesLoading(false);
        return;
      }

      const nextPath = selectedEntry.notesPath;
      setNotesPath(nextPath);
      setNotesLoading(true);
      setNotesError("");

      try {
        const parsed = await readO2File(nextPath);
        if (cancelled) return;

        notesRevisionRef.current = 0;
        setNotesText(parsed.content || "");
        setNotesSavedAt(typeof parsed.mtime === "number" ? parsed.mtime : null);
        setNotesFileExists(true);
      } catch {
        if (cancelled) return;

        notesRevisionRef.current = 0;
        setNotesText("");
        setNotesSavedAt(null);
        setNotesFileExists(false);
      } finally {
        if (!cancelled) {
          setNotesLoading(false);
        }
      }
    }

    void loadNotes();

    return () => {
      cancelled = true;
    };
  }, [selectedEntry?.key, selectedEntry?.notesPath]);

  useEffect(() => {
    if (!selectedEntry?.key || !notesPath || notesLoading) return;
    if (notesRevisionRef.current === 0) return;

    const revisionAtSchedule = notesRevisionRef.current;
    const timeoutId = window.setTimeout(async () => {
      if (notesRevisionRef.current !== revisionAtSchedule) return;
      setNotesSaving(true);
      setNotesError("");

      try {
        const savedAt = await persistGovernedRecordNote(
          notesPath,
          notesText,
        );

        if (notesRevisionRef.current === revisionAtSchedule) {
          notesRevisionRef.current = 0;
        }

        setNotesSavedAt(savedAt);
        setNotesFileExists(true);
      } catch (error) {
        setNotesError(error instanceof Error ? error.message : String(error));
      } finally {
        setNotesSaving(false);
      }
    }, 700);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [notesLoading, notesPath, notesText, selectedEntry?.key]);

  function openCreateModal(): void {
    setDraft(draftFromProfile(selectedEntry?.profile || defaultProfile));
    setShowCreateModal(true);
    setErr("");
  }

  function closeCreateModal(): void {
    if (creating) return;
    setShowCreateModal(false);
  }

  function applyTemplateById(templateId: string): void {
    const profile = profiles.find((item) => item.key === templateId) || defaultProfile;
    setDraft(draftFromProfile(profile));
  }

  async function createAsset(): Promise<void> {
    if (
      !draft.label.trim() ||
      !draft.assetType.trim() ||
      !draft.provider.trim() ||
      !draft.role.trim()
    ) {
      setErr("Label, infrastructure kind, provider, and operational focus are required.");
      return;
    }

    setCreating(true);
    setErr("");

    try {
      const payload = {
        label: draft.label,
        assetType: draft.assetType,
        provider: draft.provider,
        owningOrg: draft.owningOrg,
        environmentScope: draft.environmentScope,
        relatedProjectKeys: draft.relatedProjectKeys
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        role: draft.role,
        canonicalDomain: draft.canonicalDomain,
        primaryConsoleUrl: draft.primaryConsoleUrl,
        statusSummary: draft.statusSummary,
        openQuestions: DEFAULT_OPEN_QUESTIONS,
      };

      const parsed = await runO2PayloadParsedJson<CreateInfrastructureJson>(
        "infrastructure_asset.create",
        payload,
        "infrastructure_asset.create failed",
        "infrastructure_asset.create returned invalid JSON",
      );

      if (!parsed.ok || !parsed.assetKey) {
        throw new Error(parsed.error || "infrastructure_asset.create returned error");
      }

      onAppendLog(
        `
[infrastructure] Created ${draft.label} → ${parsed.assetKey}
` +
          `${parsed.originArtifactPath ? `[infrastructure] origin: ${parsed.originArtifactPath}
` : ""}` +
          `${parsed.inventoryArtifactPath ? `[infrastructure] inventory: ${parsed.inventoryArtifactPath}
` : ""}`,
      );

      const matchingProfile = profiles.find(
        (profile) => normalizeKey(profile.provider) === normalizeKey(draft.provider),
      );
      await refreshAssets(starterSelectionKey(matchingProfile, parsed.assetKey));
      setShowCreateModal(false);
    } catch (error) {
      setErr(error instanceof Error ? error.message : String(error));
    } finally {
      setCreating(false);
    }
  }

  function logInfrastructureSnapshot(entry: InfrastructureEntry): void {
    onAppendLog(
      `
[infrastructure] Snapshot — ${entry.label}
` +
        `Category: ${entry.category}
` +
        `Provider: ${entry.provider}
` +
        `Scope: ${entry.environmentScope}
` +
        `Governed Coverage: ${entry.linkedAssets.length} linked record(s)
` +
        `Projects: ${projectLabelsForKeys(entry.relatedProjectKeys, projects)}
` +
        `Primary Domains: ${entry.canonicalDomains.join(", ") || "Not recorded"}
` +
        `Console: ${entry.primaryConsoleUrl || "Not recorded"}
` +
        `Notes: ${entry.notesPath}
` +
        `Updated: ${formatIsoDateTime(entry.updatedAt)}`,
    );
  }

  function logInfrastructureAudit(entry: InfrastructureEntry): void {
    const linkedRecordLines = entry.linkedAssets.length
      ? entry.linkedAssets
          .map(
            (asset) =>
              `- ${asset.label} (${asset.assetType}, ${asset.governedState}) → ${asset.inventoryArtifactPath}`,
          )
          .join("\n")
      : "- No governed records linked yet. Create one when this platform needs tracked evidence.";

    onAppendLog(
      `
[infrastructure] Status Audit — ${entry.label}
` +
        `${entry.statusAuditFocus}

` +
        `Platform Focus: ${entry.focusSummary}
` +
        `MCP / API Posture: ${entry.mcpApiPosture}
` +
        `Billing Focus: ${entry.billingFocus}
` +
        `Related Projects: ${projectLabelsForKeys(entry.relatedProjectKeys, projects)}
` +
        `Linked Governed Records:
${linkedRecordLines}
`,
    );
  }

  function logGovernedEvidence(entry: InfrastructureEntry): void {
    const body = entry.linkedAssets.length
      ? entry.linkedAssets
          .map(
            (asset) =>
              `[infrastructure] ${asset.label}
` +
              `  state: ${asset.governedState}
` +
              `  origin: ${asset.originArtifactPath}
` +
              `  inventory: ${asset.inventoryArtifactPath}
` +
              `  updated: ${formatIsoDateTime(asset.updatedAt)}`,
          )
          .join("\n\n")
      : "[infrastructure] No governed records linked yet.";

    onAppendLog(`
[infrastructure] Governed Evidence — ${entry.label}
${body}`);
  }

  function openConsole(entry: InfrastructureEntry): void {
    if (!entry.primaryConsoleUrl) {
      onAppendLog(
        `[infrastructure] Open Console unavailable for ${entry.label}: no console URL is recorded.`,
      );
      return;
    }

    try {
      openExternalUrl(entry.primaryConsoleUrl);
    } catch (error) {
      onAppendLog(
        `[infrastructure] Open Console failed for ${entry.label}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const notesDirty = notesRevisionRef.current > 0;
  const notesStatus = notesLoading
    ? "Loading note..."
    : notesSaving
      ? "Saving..."
      : notesError
        ? notesError
        : notesDirty
          ? "Unsaved changes"
          : notesSavedAt
            ? `Saved ${new Date(notesSavedAt).toLocaleString()}`
            : notesFileExists
              ? "Governed note"
              : "Note will be created on first save";

  const actions = (
    <button
      className="btn btnPrimary"
      onClick={openCreateModal}
      disabled={creating || loading}
      title="Create a governed infrastructure item under O2 authority"
    >
      New Infrastructure
    </button>
  );

  return (
    <SystemStateShell title="Infrastructure" actions={actions} error={err ? <>{err}</> : null}>
      <div className="surfaceLayout">
        <div className="surfaceSidebarStack">
          <div className="surfaceCard surfaceSidebarCard">
            <div className="surfaceCardTitleRow surfaceSidebarHeaderRow">
              <div className="surfaceCardTitle">INFRASTRUCTURE ASSETS</div>
            </div>

            <div className="surfaceList">
              {entries.length === 0 ? (
                <div className="surfaceEmptyState">No infrastructure items available yet.</div>
              ) : (
                entries.map((entry) => {
                  const isActive = entry.key === selectedKey;
                  return (
                    <button
                      key={entry.key}
                      type="button"
                      aria-pressed={isActive}
                      className={`surfaceNavButton ${isActive ? "surfaceNavButtonActive" : ""}`}
                      onClick={() => setSelectedKey(entry.key)}
                    >
                      <div className="surfaceNavTitle">{entry.label}</div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="surfaceCommandMain">
          {!selectedEntry ? (
            <div className="surfaceCard surfaceEmptyState surfaceEmptyStateLarge">
              Select an infrastructure item to inspect platform status, notes, and governed coverage.
            </div>
          ) : (
            <div className="surfaceGridProjectTop">
              <div className="surfaceCard surfaceDetailBriefCard">
                <div className="surfaceCardTitle">Infrastructure Brief</div>
                <div className="surfaceSummaryList">
                  <div className="surfaceSummaryRow">
                    <div className="surfaceLabel">Platform</div>
                    <div className="surfaceValue">{selectedEntry.label}</div>
                  </div>
                  <div className="surfaceSummaryRow">
                    <div className="surfaceLabel">Category</div>
                    <div className="surfaceValue">{selectedEntry.category}</div>
                  </div>
                  <div className="surfaceSummaryRow">
                    <div className="surfaceLabel">Provider</div>
                    <div className="surfaceValue">{selectedEntry.provider}</div>
                  </div>
                  <div className="surfaceSummaryRow">
                    <div className="surfaceLabel">Owning Org</div>
                    <div className="surfaceValue">{selectedEntry.owningOrg}</div>
                  </div>
                  <div className="surfaceSummaryRow">
                    <div className="surfaceLabel">Coverage Scope</div>
                    <div className="surfaceValue">{selectedEntry.environmentScope}</div>
                  </div>
                  <div className="surfaceSummaryRow">
                    <div className="surfaceLabel">Governed Coverage</div>
                    <div className="surfaceValue">
                      {selectedEntry.linkedAssets.length === 0
                        ? "Starter profile only"
                        : `${selectedEntry.linkedAssets.length} linked governed record(s)`}
                    </div>
                  </div>
                  <div className="surfaceSummaryRow">
                    <div className="surfaceLabel">Related Projects</div>
                    <div className="surfaceValue">
                      {projectLabelsForKeys(selectedEntry.relatedProjectKeys, projects)}
                    </div>
                  </div>
                  <div className="surfaceSummaryRow">
                    <div className="surfaceLabel">Primary Domains</div>
                    <div className="surfaceValue">
                      {selectedEntry.canonicalDomains.join(", ") || "Not recorded"}
                    </div>
                  </div>
                  <div className="surfaceSummaryRow">
                    <div className="surfaceLabel">Console URL</div>
                    <div className="surfaceValue">
                      {selectedEntry.primaryConsoleUrl || "Not recorded"}
                    </div>
                  </div>
                  <div className="surfaceSummaryRow">
                    <div className="surfaceLabel">MCP / API Status</div>
                    <div className="surfaceValue">{selectedEntry.mcpApiPosture}</div>
                  </div>
                  <div className="surfaceSummaryRow">
                    <div className="surfaceLabel">Billing / Cost Focus</div>
                    <div className="surfaceValue">{selectedEntry.billingFocus}</div>
                  </div>
                  <div className="surfaceSummaryRow">
                    <div className="surfaceLabel">Platform Focus</div>
                    <div className="surfaceValue">{selectedEntry.focusSummary}</div>
                  </div>
                  <div className="surfaceSummaryRow">
                    <div className="surfaceLabel">Linked Governed Records</div>
                    <div className="surfaceValue">
                      {selectedEntry.linkedAssets.length === 0
                        ? "No linked governed records yet."
                        : selectedEntry.linkedAssets
                            .map(
                              (asset) =>
                                `${asset.label} (${asset.assetType}, ${asset.governedState})`,
                            )
                            .join("; ")}
                    </div>
                  </div>
                  <div className="surfaceSummaryRow">
                    <div className="surfaceLabel">Latest Record Update</div>
                    <div className="surfaceValue">{formatIsoDateTime(selectedEntry.updatedAt)}</div>
                  </div>
                  <div className="surfaceSummaryRow surfaceSummaryRowTall">
                    <div className="surfaceSummaryHeader">
                      <div className="surfaceLabel">Infrastructure Notes</div>
                      <div className="surfaceMutedSmall">{notesStatus}</div>
                    </div>
                    <textarea
                      className="notesSingleArea surfaceProjectNoteArea"
                      value={notesText}
                      readOnly={!notesPath || notesLoading}
                      placeholder={notesPath ? "Infrastructure note" : "No governed note path available."}
                      onChange={(event) => {
                        notesRevisionRef.current += 1;
                        setNotesText(event.target.value);
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="surfaceCard">
                <div className="surfaceCardTitle">Run Controls</div>
                <div className="surfaceActionStack">
                  <button
                    className="btn btnPrimary"
                    onClick={() => logInfrastructureSnapshot(selectedEntry)}
                    disabled={loading || creating}
                    title="Send a concise infrastructure snapshot to the logs surface"
                  >
                    Run Snapshot
                  </button>
                  <button
                    className="btn btnPrimary"
                    onClick={() => logInfrastructureAudit(selectedEntry)}
                    disabled={loading || creating}
                    title="Send a provider-focused audit checklist to the logs surface"
                  >
                    Run Status Audit
                  </button>
                  <button
                    className="btn btnPrimary"
                    onClick={() => openConsole(selectedEntry)}
                    disabled={loading || creating || !selectedEntry.primaryConsoleUrl}
                    title="Open the provider console in a new browser tab"
                  >
                    Open Console
                  </button>
                  <button
                    className="btn btnPrimary"
                    onClick={() => logGovernedEvidence(selectedEntry)}
                    disabled={loading || creating}
                    title="Send linked governed record evidence to the logs surface"
                  >
                    Open Governed Evidence
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showCreateModal ? (
        <div className="modalOverlay" onClick={closeCreateModal}>
          <div
            className="modalCard infrastructureModalCard"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modalHeader">
              <div className="modalTitle">New Infrastructure</div>
              <button className="btn btnGhost" onClick={closeCreateModal} disabled={creating}>
                Close
              </button>
            </div>

            <div className="modalBody modalBodySingle">
              <div className="surfaceFormGrid">
                <label className="surfaceFormField">
                  <span className="surfaceFormLabel">Starter Preset</span>
                  <div className="surfaceSelectWrap">
                    <select
                      className="input"
                      value={draft.templateId}
                      onChange={(event) => applyTemplateById(event.target.value)}
                    >
                      {profiles.map((profile) => (
                        <option key={profile.key} value={profile.key}>
                          {profile.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </label>

                <label className="surfaceFormField">
                  <span className="surfaceFormLabel">Label</span>
                  <input
                    className="input"
                    value={draft.label}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, label: event.target.value }))
                    }
                  />
                </label>

                <div className="surfaceFormRow2">
                  <label className="surfaceFormField">
                    <span className="surfaceFormLabel">Infrastructure Kind</span>
                    <div className="surfaceSelectWrap">
                      <select
                        className="input"
                        value={draft.assetType}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, assetType: event.target.value }))
                        }
                      >
                        {ASSET_TYPE_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                  </label>

                  <label className="surfaceFormField">
                    <span className="surfaceFormLabel">Provider</span>
                    <input
                      className="input"
                      value={draft.provider}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, provider: event.target.value }))
                      }
                    />
                  </label>
                </div>

                <div className="surfaceFormRow2">
                  <label className="surfaceFormField">
                    <span className="surfaceFormLabel">Owning Org</span>
                    <input
                      className="input"
                      value={draft.owningOrg}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, owningOrg: event.target.value }))
                      }
                    />
                  </label>

                  <label className="surfaceFormField">
                    <span className="surfaceFormLabel">Coverage Scope</span>
                    <div className="surfaceSelectWrap">
                      <select
                        className="input"
                        value={draft.environmentScope}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, environmentScope: event.target.value }))
                        }
                      >
                        {ENVIRONMENT_SCOPE_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                  </label>
                </div>

                <label className="surfaceFormField">
                  <span className="surfaceFormLabel">Related Project Keys</span>
                  <input
                    className="input"
                    list="infrastructure-project-keys"
                    value={draft.relatedProjectKeys}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, relatedProjectKeys: event.target.value }))
                    }
                  />
                  <datalist id="infrastructure-project-keys">
                    {projects.map((project) => (
                      <option key={project.key} value={project.key} />
                    ))}
                  </datalist>
                </label>

                <label className="surfaceFormField">
                  <span className="surfaceFormLabel">Operational Focus</span>
                  <textarea
                    className="pasteArea surfaceTextAreaLg"
                    value={draft.role}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, role: event.target.value }))
                    }
                  />
                </label>

                <label className="surfaceFormField">
                  <span className="surfaceFormLabel">Primary Domain / Identifier</span>
                  <input
                    className="input"
                    value={draft.canonicalDomain}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, canonicalDomain: event.target.value }))
                    }
                  />
                </label>

                <label className="surfaceFormField">
                  <span className="surfaceFormLabel">Primary Console URL</span>
                  <input
                    className="input"
                    value={draft.primaryConsoleUrl}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, primaryConsoleUrl: event.target.value }))
                    }
                  />
                </label>

                <label className="surfaceFormField">
                  <span className="surfaceFormLabel">Status Summary</span>
                  <textarea
                    className="pasteArea surfaceTextAreaMd"
                    value={draft.statusSummary}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, statusSummary: event.target.value }))
                    }
                  />
                </label>

                <div className="surfaceSummaryHeader">
                  <div className="surfaceMutedSmall">
                    Creates a governed infrastructure record under O2 while keeping the infrastructure index centered on platforms and providers.
                  </div>
                  <button
                    className="btn btnPrimary"
                    onClick={() => void createAsset()}
                    disabled={creating || loading}
                  >
                    {creating ? "Creating…" : "Create Infrastructure"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </SystemStateShell>
  );
}

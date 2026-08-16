import { useEffect, useMemo, useState } from "react";
import { runO2PayloadParsedJson } from "../common/o2Client";
import { listO2Files, readO2File } from "../common/o2Files";
import { SystemStateShell } from "../common/SystemStateShell";
import { useGovernedRecordNote } from "../common/useGovernedRecordNote";
import { openGovernedUrl } from "../common/governedOpener";
import { CreateInfrastructureModal } from "./CreateInfrastructureModal";
import { InfrastructureDetail } from "./InfrastructureDetail";
import { InfrastructureRoster } from "./InfrastructureRoster";
import { InfrastructureRunControls } from "./InfrastructureRunControls";
import type { ProjectRow } from "../projects/types";
import {
  DEFAULT_OPEN_QUESTIONS,
  RECORDS_DIR,
  buildInfrastructureEntries,
  buildInfrastructureProfiles,
  draftFromProfile,
  notePathForKey,
  normalizeKey,
  parseInfrastructureAsset,
  sortAssets,
  starterSelectionKey,
  type InfrastructureAsset,
  type InfrastructureDraft,
  type InfrastructureEntry,
} from "./infrastructureModel";
import {
  buildGovernedEvidenceLog,
  buildInfrastructureAuditLog,
  buildInfrastructureSnapshotLog,
} from "./infrastructureReports";

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
  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.key === selectedKey) || null,
    [entries, selectedKey],
  );

  const governedNote = useGovernedRecordNote({
    recordKey: selectedEntry?.key || null,
    path: selectedEntry?.notesPath || null,
  });
  const configurationNote = useGovernedRecordNote({
    recordKey: selectedEntry ? `configuration:${selectedEntry.key}` : null,
    path: selectedEntry?.configurationPath || null,
    missingStatus: "Paste a concise non-secret configuration summary",
  });

  useEffect(() => {
    if (!registerBeforeTabChangeSaver) return;
    registerBeforeTabChangeSaver(async () => {
      const configurationSaved = await configurationNote.flush();
      return configurationSaved && governedNote.flush();
    });
    return () => registerBeforeTabChangeSaver(null);
  }, [configurationNote.flush, governedNote.flush, registerBeforeTabChangeSaver]);

  async function selectEntry(entryKey: string): Promise<void> {
    const configurationSaved = await configurationNote.flush();
    if (configurationSaved && await governedNote.flush()) setSelectedKey(entryKey);
  }

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
      const matchingProfile = profiles.find(
        (profile) =>
          normalizeKey(profile.provider) === normalizeKey(draft.provider),
      );
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
        canonicalNotesPath: matchingProfile
          ? notePathForKey(matchingProfile.key)
          : undefined,
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

      await refreshAssets(starterSelectionKey(matchingProfile, parsed.assetKey));
      setShowCreateModal(false);
    } catch (error) {
      setErr(error instanceof Error ? error.message : String(error));
    } finally {
      setCreating(false);
    }
  }

  function logInfrastructureSnapshot(entry: InfrastructureEntry): void {
    onAppendLog(buildInfrastructureSnapshotLog(entry, projects));
  }

  function logInfrastructureAudit(entry: InfrastructureEntry): void {
    onAppendLog(buildInfrastructureAuditLog(entry, projects));
  }

  function logGovernedEvidence(entry: InfrastructureEntry): void {
    onAppendLog(buildGovernedEvidenceLog(entry));
  }

  async function openConsole(entry: InfrastructureEntry): Promise<void> {
    if (!entry.primaryConsoleUrl) {
      onAppendLog(
        `[infrastructure] Open Console unavailable for ${entry.label}: no console URL is recorded.`,
      );
      return;
    }

    try {
      await openGovernedUrl(entry.primaryConsoleUrl);
    } catch (error) {
      onAppendLog(
        `[infrastructure] Open Console failed for ${entry.label}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const actions = (
    <button
      className="btn btnPrimary"
      data-testid="new-infrastructure"
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
          <InfrastructureRoster
            entries={entries}
            loading={loading}
            loadError={err}
            selectedEntryKey={selectedKey}
            onSelect={(entryKey) => void selectEntry(entryKey)}
          />
        </div>

        <div className="surfaceCommandMain">
          {!selectedEntry ? (
            <div className="surfaceCard surfaceEmptyState surfaceEmptyStateLarge">
              {loading
                ? "Loading governed infrastructure data…"
                : err
                  ? "Infrastructure data is unavailable. No empty-state claim is being made."
                  : entries.length === 0
                    ? "No infrastructure items are configured."
                    : "Select an infrastructure item to inspect platform status, notes, and governed coverage."}
            </div>
          ) : (
            <div className="surfaceGridProjectTop">
              <InfrastructureDetail
                entry={selectedEntry}
                projects={projects}
                notePath={governedNote.path}
                noteText={governedNote.text}
                noteStatus={governedNote.status}
                noteLoading={governedNote.loading}
                configurationText={configurationNote.text}
                configurationStatus={configurationNote.status}
                configurationLoading={configurationNote.loading}
                configurationPath={configurationNote.path}
                onNoteChange={governedNote.onTextChange}
                onConfigurationChange={configurationNote.onTextChange}
              />
              <InfrastructureRunControls
                entry={selectedEntry}
                disabled={loading || creating}
                onSnapshot={() => logInfrastructureSnapshot(selectedEntry)}
                onAudit={() => logInfrastructureAudit(selectedEntry)}
                onOpenConsole={() => openConsole(selectedEntry)}
                onOpenEvidence={() => logGovernedEvidence(selectedEntry)}
              />
            </div>
          )}
        </div>
      </div>

      {showCreateModal ? (
        <CreateInfrastructureModal
          draft={draft}
          profiles={profiles}
          projects={projects}
          creating={creating}
          loading={loading}
          onClose={closeCreateModal}
          onApplyTemplate={applyTemplateById}
          onDraftChange={(patch) =>
            setDraft((current) => ({ ...current, ...patch }))
          }
          onCreate={createAsset}
        />
      ) : null}
    </SystemStateShell>
  );
}

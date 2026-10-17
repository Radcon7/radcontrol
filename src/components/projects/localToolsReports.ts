import type { ProjectRow } from "./types";
import {
  formatIsoDateTime,
  projectLabelsForKeys,
  type LocalToolsEntry,
} from "./localToolsModel";

export function buildLocalToolsSnapshotLog(
  entry: LocalToolsEntry,
  projects: ProjectRow[],
): string {
  return (
    `\n[infrastructure] Snapshot — ${entry.label}\n` +
    `Category: ${entry.category}\n` +
    `Provider: ${entry.provider}\n` +
    `Scope: ${entry.environmentScope}\n` +
    `Governed Coverage: ${entry.linkedAssets.length} linked record(s)\n` +
    `Projects: ${projectLabelsForKeys(entry.relatedProjectKeys, projects)}\n` +
    `Primary Domains: ${entry.canonicalDomains.join(", ") || "Not recorded"}\n` +
    `Console: ${entry.primaryConsoleUrl || "Not recorded"}\n` +
    `Notes: ${entry.notesPath}\n` +
    `Updated: ${formatIsoDateTime(entry.updatedAt)}`
  );
}

export function buildLocalToolsAuditLog(
  entry: LocalToolsEntry,
  projects: ProjectRow[],
): string {
  const linkedRecordLines = entry.linkedAssets.length
    ? entry.linkedAssets
        .map(
          (asset) =>
            `- ${asset.label} (${asset.assetType}, ${asset.governedState}) → ${asset.inventoryArtifactPath}`,
        )
        .join("\n")
    : "- No governed records linked yet. Create one when this platform needs tracked evidence.";

  return (
    `\n[infrastructure] Status Audit — ${entry.label}\n` +
    `${entry.statusAuditFocus}\n\n` +
    `Platform Focus: ${entry.focusSummary}\n` +
    `MCP / API Posture: ${entry.mcpApiPosture}\n` +
    `Billing Focus: ${entry.billingFocus}\n` +
    `Related Projects: ${projectLabelsForKeys(entry.relatedProjectKeys, projects)}\n` +
    `Linked Governed Records:\n${linkedRecordLines}\n`
  );
}

export function buildGovernedEvidenceLog(entry: LocalToolsEntry): string {
  const body = entry.linkedAssets.length
    ? entry.linkedAssets
        .map(
          (asset) =>
            `[infrastructure] ${asset.label}\n` +
            `  state: ${asset.governedState}\n` +
            `  origin: ${asset.originArtifactPath}\n` +
            `  inventory: ${asset.inventoryArtifactPath}\n` +
            `  updated: ${formatIsoDateTime(asset.updatedAt)}`,
        )
        .join("\n\n")
    : "[infrastructure] No governed records linked yet.";

  return `\n[infrastructure] Governed Evidence — ${entry.label}\n${body}`;
}

import { runO2ParsedJson } from "../common/o2Client";

export type O2KnowledgeOverview = {
  name: string;
  what: string;
  source: string;
  owner: string;
  authority: string;
  updatedBy: string;
  codexUse: string;
};

export type O2KnowledgeWorkspace = {
  ok: boolean;
  projection: "read-only";
  generatedAt: string;
  provenance: { owner: string; authority: string; source: string };
  overview: O2KnowledgeOverview[];
  projects: Array<{ key: string; label: string; kind: string; archetype: string; dataTier: string; retired: boolean; intent: string; intentSource: string; intentAvailable: boolean; freshness: string | null }>;
  catalog: Array<{ id: string; title: string; category: string; repository: string; path: string; owner: string; authorityClass: string; lifecycleStatus: string; scope: string; lastVerifiedDate: string }>;
  playbooks: { source: string; authority: string; routes: Array<{ name: string; source: string }> };
  learningCandidates: { source: string; authority: string; lifecycle: string[]; items: Array<{ id: string; title: string; kind: string; status: string; sourceRepository: string; recurrenceCount: number; relatedCatalogIds: string[]; updatedAt: string; authority: string }> };
  memory: { source: string; status: string; rawMemoryContentIncluded: boolean };
  skills: Array<{ name: string; title: string; path: string; authority: string }>;
  patterns: Array<{ title: string; path: string; authority: string }>;
  contracts: Array<{ title: string; path: string; authority: string; scope: string }>;
  decisions: Array<{ title: string; path: string; authority: string }>;
  doctrine: { source: string; authority: string; principles: string[] };
  qualityGates: { source: string; authority: string; projects: Array<{ project: string; gates: Array<{ id: string; category: string; description: string; required: boolean }> }> };
};

export async function loadO2KnowledgeWorkspace(): Promise<O2KnowledgeWorkspace> {
  const payload = await runO2ParsedJson<O2KnowledgeWorkspace>(
    "knowledge.operator_workspace",
    "O2 Knowledge projection failed",
    "O2 Knowledge returned invalid JSON",
  );
  if (!payload.ok || payload.projection !== "read-only") {
    throw new Error("O2 Knowledge did not return its read-only projection.");
  }
  return payload;
}

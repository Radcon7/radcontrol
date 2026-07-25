import { type FilesListItem, listO2Files } from "./o2Files";
import {
  GOVERNANCE_INVENTORY,
  type GovernanceInventoryItem,
} from "./governanceInventory";

export type GovernanceInventoryResolvedItem = GovernanceInventoryItem & {
  resolvedPath: string;
  foundViaFilesList: boolean;
  expectedByPolicy: boolean;
};

const REPO_PRIMARY_DOCS = new Set<string>([
  "AGENTS.md",
  "docs/REPO_STATE.md",
  "docs/POLICY_POINTERS.md",
]);

function expandHomePath(path: string): string {
  if (path === "~") return "/home/chris";
  if (path.startsWith("~/")) return `/home/chris/${path.slice(2)}`;
  return path;
}

function normalizeRepoRelativePath(path: string): string {
  return path.replace(/^\.?\/*/, "");
}

function isRepoRelativePath(path: string): boolean {
  return !path.startsWith("~/") && !path.startsWith("/") && path !== "~";
}

function buildPathSet(items: FilesListItem[]): Set<string> {
  const paths = new Set<string>();

  for (const item of items) {
    if (typeof item.path !== "string" || !item.path.trim()) continue;
    paths.add(normalizeRepoRelativePath(item.path));
  }

  return paths;
}

function isExpectedByPolicy(item: GovernanceInventoryItem): boolean {
  if (!isRepoRelativePath(item.path)) {
    return false;
  }

  return REPO_PRIMARY_DOCS.has(normalizeRepoRelativePath(item.path));
}

function itemExists(
  item: GovernanceInventoryItem,
  repoPaths: Set<string>,
): boolean {
  if (!isRepoRelativePath(item.path)) {
    return false;
  }

  const normalized = normalizeRepoRelativePath(item.path);
  return repoPaths.has(normalized);
}

export async function loadGovernanceInventory(): Promise<
  GovernanceInventoryResolvedItem[]
> {
  const parsed = await listO2Files("");
  const repoItems = Array.isArray(parsed.items) ? parsed.items : [];
  const repoPaths = buildPathSet(repoItems);

  return [...GOVERNANCE_INVENTORY]
    .sort((a, b) => a.order - b.order)
    .map((item) => ({
      ...item,
      resolvedPath: isRepoRelativePath(item.path)
        ? normalizeRepoRelativePath(item.path)
        : expandHomePath(item.path),
      foundViaFilesList: itemExists(item, repoPaths),
      expectedByPolicy: isExpectedByPolicy(item),
    }));
}

import { invoke } from "@tauri-apps/api/core";
import {
  GOVERNANCE_INVENTORY,
  type GovernanceInventoryItem,
} from "./governanceInventory";

type RunO2Result = {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
};

type FilesListItem = {
  kind?: string;
  path?: string;
  mtime?: number;
  bytes?: number;
};

type FilesListJson = {
  ok?: boolean;
  root?: string;
  docs_dir?: string;
  items?: FilesListItem[];
  error?: string;
};

export type GovernanceInventoryResolvedItem = GovernanceInventoryItem & {
  resolvedPath: string;
  exists: boolean;
};

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

async function runO2(verb: string): Promise<RunO2Result> {
  return (await invoke("run_o2", { verb })) as RunO2Result;
}

async function listO2Files(): Promise<FilesListItem[]> {
  const res = await runO2("files.list");
  if (!res.ok) {
    throw new Error((res.stderr || res.stdout || "files.list failed").trim());
  }

  let parsed: FilesListJson;
  try {
    parsed = JSON.parse((res.stdout || "").trim()) as FilesListJson;
  } catch {
    throw new Error("files.list returned invalid JSON");
  }

  return Array.isArray(parsed.items) ? parsed.items : [];
}

function buildPathSet(items: FilesListItem[]): Set<string> {
  const paths = new Set<string>();

  for (const item of items) {
    if (typeof item.path !== "string" || !item.path.trim()) continue;
    paths.add(normalizeRepoRelativePath(item.path));
  }

  return paths;
}

function itemExists(
  item: GovernanceInventoryItem,
  repoPaths: Set<string>,
): boolean {
  if (isRepoRelativePath(item.path)) {
    return repoPaths.has(normalizeRepoRelativePath(item.path));
  }

  // External canonical/pointer paths are intentionally not asserted via files.list.
  // They remain present in the inventory, but existence validation for them belongs
  // in a later cross-boundary adapter, not this repo-local loader.
  return false;
}

export async function loadGovernanceInventory(): Promise<
  GovernanceInventoryResolvedItem[]
> {
  const repoItems = await listO2Files();
  const repoPaths = buildPathSet(repoItems);

  return [...GOVERNANCE_INVENTORY]
    .sort((a, b) => a.order - b.order)
    .map((item) => ({
      ...item,
      resolvedPath: isRepoRelativePath(item.path)
        ? normalizeRepoRelativePath(item.path)
        : expandHomePath(item.path),
      exists: itemExists(item, repoPaths),
    }));
}

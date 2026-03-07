export type GovernanceScope = "empire" | "o2" | "repo";

export type GovernanceCategory =
  | "canonical"
  | "pointer"
  | "behavioral"
  | "generated_excluded";

export type GovernanceAuthority = "source_of_truth" | "secondary" | "none";

export type GovernanceDisplayMode = "primary" | "link_only" | "hidden";

export type GovernanceInventoryItem = {
  id: string;
  title: string;
  path: string;
  scope: GovernanceScope;
  category: GovernanceCategory;
  authority: GovernanceAuthority;
  display_mode: GovernanceDisplayMode;
  order: number;
};

export const GOVERNANCE_INVENTORY: GovernanceInventoryItem[] = [
  {
    id: "codex-agents",
    title: "AGENTS.md",
    path: "~/.codex/AGENTS.md",
    scope: "empire",
    category: "canonical",
    authority: "source_of_truth",
    display_mode: "primary",
    order: 10,
  },
  {
    id: "codex-o2-control",
    title: "O2_CONTROL.md",
    path: "~/.codex/O2_CONTROL.md",
    scope: "empire",
    category: "canonical",
    authority: "source_of_truth",
    display_mode: "primary",
    order: 20,
  },
  {
    id: "codex-snapshot-contract",
    title: "SNAPSHOT_CONTRACT.md",
    path: "~/.codex/SNAPSHOT_CONTRACT.md",
    scope: "empire",
    category: "canonical",
    authority: "source_of_truth",
    display_mode: "primary",
    order: 30,
  },
  {
    id: "repo-state",
    title: "REPO_STATE.md",
    path: "docs/REPO_STATE.md",
    scope: "repo",
    category: "behavioral",
    authority: "secondary",
    display_mode: "primary",
    order: 40,
  },
  {
    id: "policy-pointers",
    title: "POLICY_POINTERS.md",
    path: "docs/POLICY_POINTERS.md",
    scope: "repo",
    category: "pointer",
    authority: "secondary",
    display_mode: "primary",
    order: 50,
  },
  {
    id: "repo-agents-pointer",
    title: "Repo AGENTS.md",
    path: "AGENTS.md",
    scope: "repo",
    category: "pointer",
    authority: "secondary",
    display_mode: "primary",
    order: 60,
  },
  {
    id: "o2-docs",
    title: "O2 docs/",
    path: "~/dev/o2/docs/",
    scope: "o2",
    category: "pointer",
    authority: "secondary",
    display_mode: "link_only",
    order: 70,
  },
  {
    id: "o2-scripts",
    title: "O2 scripts/",
    path: "~/dev/o2/scripts/",
    scope: "o2",
    category: "pointer",
    authority: "secondary",
    display_mode: "link_only",
    order: 80,
  },
  {
    id: "o2-project-registry",
    title: "projects.json",
    path: "~/dev/o2/registry/projects.json",
    scope: "o2",
    category: "pointer",
    authority: "secondary",
    display_mode: "link_only",
    order: 90,
  },
  {
    id: "o2-workspaces",
    title: "workspaces/",
    path: "~/dev/o2/workspaces/",
    scope: "o2",
    category: "pointer",
    authority: "secondary",
    display_mode: "link_only",
    order: 100,
  },
  {
    id: "repo-snapshot-generated",
    title: "_repo_snapshot.txt",
    path: "docs/_repo_snapshot.txt",
    scope: "repo",
    category: "generated_excluded",
    authority: "none",
    display_mode: "hidden",
    order: 110,
  },
  {
    id: "o2-repo-index-generated",
    title: "_o2_repo_index.txt",
    path: "docs/_o2_repo_index.txt",
    scope: "repo",
    category: "generated_excluded",
    authority: "none",
    display_mode: "hidden",
    order: 120,
  },
];

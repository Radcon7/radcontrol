import { useEffect, useMemo, useState, type ReactNode } from "react";
import { loadO2KnowledgeWorkspace, type O2KnowledgeWorkspace } from "./o2KnowledgeApi";

type KnowledgeMode =
  | "overview"
  | "project_intent"
  | "registry"
  | "catalog"
  | "playbooks"
  | "learning"
  | "memory"
  | "skills"
  | "patterns"
  | "contracts"
  | "doctrine"
  | "quality";

const MODES: Array<{ key: KnowledgeMode; label: string; eyebrow: string }> = [
  { key: "overview", label: "Overview", eyebrow: "WHAT O2 KNOWS" },
  { key: "project_intent", label: "Project Intent", eyebrow: "PROJECT-OWNED CURRENT INTENT" },
  { key: "registry", label: "Project Registry", eyebrow: "CANONICAL TOPOLOGY" },
  { key: "catalog", label: "Knowledge Catalog", eyebrow: "GOVERNED DISCOVERY" },
  { key: "playbooks", label: "Playbooks", eyebrow: "RECOVERY ROUTES" },
  { key: "learning", label: "Learning Candidates", eyebrow: "NOT YET DOCTRINE" },
  { key: "memory", label: "Memory", eyebrow: "HOST-LOCAL CONTEXT" },
  { key: "skills", label: "Skills", eyebrow: "REPEATABLE WORKFLOWS" },
  { key: "patterns", label: "Patterns", eyebrow: "REUSABLE KNOWLEDGE" },
  { key: "contracts", label: "Contracts + Decisions", eyebrow: "GOVERNING BOUNDARIES" },
  { key: "doctrine", label: "Empire Rules", eyebrow: "CURRENT DOCTRINE" },
  { key: "quality", label: "Quality Gates", eyebrow: "DECLARED VERIFICATION" },
];

function sourceLine(path: string) {
  return <div className="knowledgeSource">Canonical source · <code>{path}</code></div>;
}

function authorityClass(value: string): string {
  return `knowledgeAuthority knowledgeAuthority${value.replace(/[^a-z0-9]/gi, "")}`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="knowledgeEmpty">{children}</div>;
}

export function O2KnowledgeWorkspace() {
  const [workspace, setWorkspace] = useState<O2KnowledgeWorkspace | null>(null);
  const [mode, setMode] = useState<KnowledgeMode>("overview");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      setWorkspace(await loadO2KnowledgeWorkspace());
    } catch (reason) {
      setWorkspace(null);
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  const query = search.trim().toLowerCase();
  const filteredCatalog = useMemo(
    () => (workspace?.catalog ?? []).filter((item) => !query || [item.title, item.id, item.category, item.repository, item.path, item.authorityClass].join(" ").toLowerCase().includes(query)),
    [workspace, query],
  );
  const active = MODES.find((item) => item.key === mode)!;

  if (loading && !workspace) return <div className="knowledgeLoading">Loading the current O2 Knowledge projection…</div>;
  if (error || !workspace) return <section className="knowledgeFailure"><strong>O2 Knowledge unavailable</strong><p>{error || "O2 did not return a knowledge projection."}</p><button type="button" className="btn btnGhost" onClick={() => void refresh()}>Retry</button></section>;
  const currentWorkspace = workspace;

  function detail() {
    const workspace = currentWorkspace;
    if (mode === "overview") return <>
      <p className="knowledgeIntro">O2 is the Empire’s governance and institutional-knowledge layer. This workspace is a live, read-only projection: it helps you understand the source without becoming another source of truth.</p>
      <div className="knowledgeGrid">{workspace.overview.map((item) => <article className="knowledgeCard" key={item.name}><div className="knowledgeCardTop"><h3>{item.name}</h3><span className={authorityClass(item.authority)}>{item.authority}</span></div><p>{item.what}</p><dl className="knowledgeFacts"><div><dt>Owner</dt><dd>{item.owner}</dd></div><div><dt>Updated through</dt><dd>{item.updatedBy}</dd></div><div><dt>Codex uses it to</dt><dd>{item.codexUse}</dd></div></dl>{sourceLine(item.source)}</article>)}</div>
    </>;
    if (mode === "project_intent") return <><p className="knowledgeIntro">Each row is read from the project’s own <code>docs/REPO_STATE.md</code>. O2 does not copy its intent into this workspace.</p><div className="knowledgeList">{workspace.projects.map((project) => <article className="knowledgeRow" key={project.key}><div><h3>{project.label}</h3><p>{project.intent}</p><div className="knowledgeTags"><span>{project.archetype}</span><span>{project.dataTier}</span>{project.retired ? <span>retired</span> : null}</div></div><aside><span className={authorityClass("repo-authority")}>repo authority</span>{sourceLine(project.intentSource)}<div className="knowledgeFreshness">Source checked {formatDate(project.freshness)}</div></aside></article>)}</div></>;
    if (mode === "registry") return <><p className="knowledgeIntro">The registry has {workspace.projects.length} active topology rows. Membership describes governed repositories and runtime coordinates; it is not the same as user-facing product visibility.</p>{sourceLine("registry/projects.json")}<div className="knowledgeTableWrap"><table className="knowledgeTable"><thead><tr><th>Project</th><th>Kind</th><th>Archetype</th><th>Data tier</th><th>Intent source</th></tr></thead><tbody>{workspace.projects.map((project) => <tr key={project.key}><td><strong>{project.label}</strong><small>{project.key}</small></td><td>{project.kind}</td><td>{project.archetype}</td><td>{project.dataTier}</td><td><code>{project.intentSource}</code></td></tr>)}</tbody></table></div></>;
    if (mode === "catalog") return <><div className="knowledgeToolbar"><input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, source, category, authority…" /><span>{filteredCatalog.length} of {workspace.catalog.length} records</span></div><p className="knowledgeIntro">The catalog helps Codex find the right sources. Its labels describe authority and lifecycle; the linked source remains the thing to read and change.</p><div className="knowledgeList">{filteredCatalog.map((item) => <article className="knowledgeRow" key={item.id}><div><h3>{item.title}</h3><p>{item.scope}</p><div className="knowledgeTags"><span>{item.category}</span><span>{item.repository}</span><span>{item.lifecycleStatus}</span></div></div><aside><span className={authorityClass(item.authorityClass)}>{item.authorityClass}</span>{sourceLine(item.path)}<div className="knowledgeFreshness">Verified {item.lastVerifiedDate}</div></aside></article>)}</div>{filteredCatalog.length === 0 ? <Empty>No catalog entries match that search.</Empty> : null}</>;
    if (mode === "playbooks") return <><p className="knowledgeIntro">Playbooks are concise, reusable routes for recurring operational friction. They guide safe recovery; they are not a reason to automate an unsettled problem.</p><span className={authorityClass(workspace.playbooks.authority)}>{workspace.playbooks.authority}</span>{sourceLine(workspace.playbooks.source)}<div className="knowledgeList">{workspace.playbooks.routes.map((route) => <article className="knowledgeCompactRow" key={route.name}><h3>{route.name}</h3>{sourceLine(route.source)}</article>)}</div></>;
    if (mode === "learning") return <><p className="knowledgeIntro">Candidates are potential lessons, never automatic doctrine. Promotion requires evidence, review/deduplication, human approval, a separate governed source update, and verification.</p><div className="knowledgeLifecycle">{workspace.learningCandidates.lifecycle.map((stage, index) => <span key={stage}>{stage}{index < workspace.learningCandidates.lifecycle.length - 1 ? " →" : ""}</span>)}</div>{sourceLine(workspace.learningCandidates.source)}<div className="knowledgeList">{workspace.learningCandidates.items.map((item) => <article className="knowledgeRow" key={item.id}><div><h3>{item.title}</h3><p>{item.kind} · {item.recurrenceCount} recorded recurrence{item.recurrenceCount === 1 ? "" : "s"}</p><div className="knowledgeTags">{item.relatedCatalogIds.map((id) => <span key={id}>{id}</span>)}</div></div><aside><span className={authorityClass("candidate")}>{item.authority}</span><div className="knowledgeFreshness">{item.status} · {item.sourceRepository} · updated {formatDate(item.updatedAt)}</div></aside></article>)}</div></>;
    if (mode === "memory") return <><p className="knowledgeIntro">Codex memory can help recall recent context and preferences, but it does not decide product behavior, release state, contracts, or provider facts. Checked-in authority always wins.</p><article className="knowledgeCard"><h3>Memory boundary</h3><p>{workspace.memory.status}</p><span className={authorityClass("host-local")}>host-local/non-authoritative</span>{sourceLine(workspace.memory.source)}<div className="knowledgeFreshness">Raw memory content is intentionally never included in this workspace: {workspace.memory.rawMemoryContentIncluded ? "unexpectedly included" : "confirmed excluded"}.</div></article></>;
    if (mode === "skills") return <><p className="knowledgeIntro">Skills package stable, repeatable workflows. They help Codex follow a process; they are not product or business authority.</p><div className="knowledgeList">{workspace.skills.map((item) => <article className="knowledgeCompactRow" key={item.name}><h3>{item.title}</h3><p>{item.authority}</p>{sourceLine(item.path)}</article>)}</div></>;
    if (mode === "patterns") return <><p className="knowledgeIntro">Patterns capture reusable shapes with their own promotion status. A candidate pattern is visible here precisely so it is not mistaken for an Empire rule.</p><div className="knowledgeList">{workspace.patterns.map((item) => <article className="knowledgeCompactRow" key={item.path}><h3>{item.title}</h3><span className={authorityClass(item.authority)}>{item.authority}</span>{sourceLine(item.path)}</article>)}</div></>;
    if (mode === "contracts") return <><p className="knowledgeIntro">Contracts state scoped Empire requirements. Decisions preserve durable choices and their consequences. The source documents define their exact scope.</p><div className="knowledgeSection"><h3>Major contracts</h3><div className="knowledgeList">{workspace.contracts.map((item) => <article className="knowledgeCompactRow" key={item.path}><h3>{item.title}</h3><span className={authorityClass("empire-contract")}>{item.authority}</span>{sourceLine(item.path)}</article>)}</div></div><div className="knowledgeSection"><h3>Decision records</h3><div className="knowledgeList">{workspace.decisions.map((item) => <article className="knowledgeCompactRow" key={item.path}><h3>{item.title}</h3><span className={authorityClass("reference")}>{item.authority}</span>{sourceLine(item.path)}</article>)}</div></div></>;
    if (mode === "doctrine") return <><p className="knowledgeIntro">Current doctrine is indexed so an operator can understand the major rules without reading a giant document in a tiny pane.</p><span className={authorityClass(workspace.doctrine.authority)}>{workspace.doctrine.authority}</span>{sourceLine(workspace.doctrine.source)}<ol className="knowledgePrinciples">{workspace.doctrine.principles.map((item) => <li key={item}>{item}</li>)}</ol></>;
    return <><p className="knowledgeIntro">Quality gates are declared O2 metadata: they show the bounded checks a project owns. A passing check is evidence, not a substitute for the relevant product acceptance.</p>{sourceLine(workspace.qualityGates.source)}<div className="knowledgeList">{workspace.qualityGates.projects.map((project) => <article className="knowledgeCompactRow" key={project.project}><h3>{project.project}</h3><ul className="knowledgeGateList">{project.gates.map((gate) => <li key={gate.id}><strong>{gate.id}</strong> <span>{gate.category}{gate.required ? " · required" : " · optional"}</span><small>{gate.description}</small></li>)}</ul></article>)}</div></>;
  }

  return <section className="knowledgeWorkspace" data-testid="o2-knowledge-workspace"><header className="knowledgeHeader"><div><div className="knowledgeEyebrow">O2 KNOWLEDGE · READ-ONLY PROJECTION</div><h2>{active.label}</h2><p>{workspace.provenance.authority}</p></div><button type="button" className="btn btnGhost btnCompact" onClick={() => void refresh()} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button></header><div className="knowledgeBody"><nav className="knowledgeNav" aria-label="O2 Knowledge categories">{MODES.map((item) => <button key={item.key} type="button" className={`knowledgeNavButton ${mode === item.key ? "knowledgeNavButtonActive" : ""}`} onClick={() => setMode(item.key)}><span>{item.label}</span><small>{item.eyebrow}</small></button>)}</nav><main className="knowledgeDetail"><div className="knowledgeDetailEyebrow">{active.eyebrow}</div>{detail()}</main></div></section>;
}

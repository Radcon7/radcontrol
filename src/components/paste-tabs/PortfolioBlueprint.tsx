import { useCallback, useEffect, useMemo, useState } from "react";
import { readO2File } from "../common/o2Files";
import {
  parsePortfolioBlueprint,
  portfolioStatusLabel,
  PORTFOLIO_BLUEPRINT_PATH,
  type AddressRole,
  type DocumentGroup,
  type PortfolioBlueprint as PortfolioBlueprintRecord,
  type PortfolioRecord,
  type PortfolioRecordStatus,
} from "./portfolioBlueprintModel";

export type LegalOperatorView =
  | "structure"
  | "addresses"
  | "documents";

const statusClass: Record<PortfolioRecordStatus, string> = {
  active: "legalStatus legalStatusActive",
  planned: "legalStatus legalStatusPlanned",
  not_formed: "legalStatus legalStatusNotFormed",
  selected: "legalStatus legalStatusSelected",
  needs_verification: "legalStatus legalStatusNeedsVerification",
  not_filed: "legalStatus legalStatusNotFiled",
  filed: "legalStatus legalStatusFiled",
};

function StatusBadge({ status }: { status: PortfolioRecordStatus }) {
  return <span className={statusClass[status]}>{portfolioStatusLabel(status)}</span>;
}

function DiagramNode({ record, testId, className = "", compact = false }: { record: PortfolioRecord; testId?: string; className?: string; compact?: boolean }) {
  return (
    <article className={`legalGraphNode ${className}`} data-testid={testId}>
      <div className="legalCardTopline">
        <span>{record.kind.replace(/-/g, " ")}</span>
        <StatusBadge status={record.status} />
      </div>
      <h4>{record.label}</h4>
      {compact ? null : <p>{record.role}</p>}
      <strong>{record.relationship}</strong>
      {compact ? null : <small>{record.notes}</small>}
    </article>
  );
}

function StructureView({ blueprint }: { blueprint: PortfolioBlueprintRecord }) {
  const records = new Map(blueprint.records.map((record) => [record.key, record]));
  const structure = blueprint.legalFoundation.structure;
  const radcon = records.get(structure.radconKey)!;
  const radwolfe = records.get(structure.radwolfeKey)!;
  const property = records.get(structure.radwolfePropertyKey)!;
  const primary = structure.primaryBusinessKeys.map((key) => records.get(key)!);
  const other = structure.otherProjectKeys.map((key) => records.get(key)!);
  const portal = blueprint.legalFoundation.portalAccess;

  return (
    <div className="legalViewStack">
      <section className="legalStructureDiagram" data-testid="legal-ownership-diagram" aria-label="Legal and business structure">
        <article className="legalGraphLane legalGraphLaneRadcon" data-testid="legal-radcon-lane">
          <div className="legalGraphLaneLabel">OWNERSHIP / BUSINESS LANE</div>
          <DiagramNode record={radcon} testId="legal-radcon-entity" className="legalGraphEntityNode legalGraphEntityNodeRadcon" compact />
          <div className="legalGraphConnector legalGraphConnectorOwnership" data-testid="legal-ownership-connector-radcon" data-connector="radcon-to-businesses" aria-hidden="true">
            <span className="legalGraphConnectorTrunk" />
            <span className="legalGraphConnectorBranch" />
          </div>
          <div className="legalGraphChildren legalGraphBusinessChildren">
            {primary.map((record) => (
              <DiagramNode
                key={record.key}
                record={record}
                testId={`legal-${record.key}-node`}
                className="legalGraphChildNode"
                compact
              />
            ))}
          </div>
          <div className="legalGraphSupportGroup" aria-label="Radcon support relationships">
            <div className="legalGraphConnector legalGraphConnectorSupport" data-testid="legal-support-connector-radcon" data-connector="radcon-to-support-services" aria-hidden="true">
              <span className="legalGraphConnectorTrunk" />
              <span className="legalGraphConnectorBranch" />
            </div>
            <div className="legalSupportRail">
              {structure.supportRelationships.map((support) => (
                <article key={support.key}>
                  <div><strong>{support.label}</strong><StatusBadge status={support.status} /></div>
                  <span>{support.role}</span>
                  <small>{support.detail}</small>
                </article>
              ))}
            </div>
          </div>
        </article>

        <article className="legalGraphLane legalGraphLaneVenture" data-testid="legal-radwolfe-lane">
          <div className="legalGraphLaneLabel">PARALLEL REAL-ESTATE LANE</div>
          <DiagramNode record={radwolfe} testId="legal-radwolfe-venture" className="legalGraphEntityNode legalGraphEntityNodeVenture" compact />
          <div className="legalVentureBoundary">SEPARATE FROM RADCON ENTERPRISES</div>
          <div className="legalGraphConnector legalGraphConnectorOwnership legalGraphConnectorSingle" data-testid="legal-ownership-connector-radwolfe" data-connector="radwolfe-to-townhouse" aria-hidden="true"><span className="legalGraphConnectorTrunk" /></div>
          <div className="legalGraphChildren legalGraphPropertyChildren"><DiagramNode record={property} testId="legal-townhouse-node" className="legalGraphChildNode" compact /></div>
          <div className="legalTruthNote">
            <strong>No RadWolfe LLC today</strong>
            <p>No partner names, percentages, title structure, tax treatment, or entity terms are asserted.</p>
          </div>
        </article>
      </section>

      <section className="portalAccessPanel" data-testid="legal-portal-access-diagram">
        <header>
          <div><span>RCE OPERATING ACCESS — NOT OWNERSHIP</span><h3>{portal.label}</h3></div>
          <StatusBadge status={portal.status} />
        </header>
        <div className="portalBoundaryLabel">{portal.relationshipLabel}</div>
        <div className="portalAccessDiagram">
          <div className="portalAccessHub">RCE PORTAL<span>{portal.summary}</span></div>
          <div className="portalAccessConnector" data-testid="legal-portal-access-connector" data-connector="rce-portal-to-access-roles" aria-hidden="true"><span /></div>
          <div className="portalAccessGrid">
            <div className="portalRoleColumn">
              {portal.roles.map((role) => (
                <article key={role.label}>
                  <div><strong>{role.label}</strong><StatusBadge status={role.status} /></div>
                  <p>{role.access}</p>
                </article>
              ))}
            </div>
            <div className="portalWorkspaceColumn">
              <span>POSSIBLE AUTHORIZED WORKSPACES</span>
              <ul>{portal.workspaceLabels.map((label) => <li key={label}>{label}</li>)}</ul>
            </div>
          </div>
        </div>
        <footer><strong>{portal.accountBoundary}</strong><span>{portal.futurePublicSite}</span></footer>
      </section>
      <section className="legalProjectCluster legalProjectClusterSecondary">
        <span>OTHER AUTHORITATIVE RADCON PROJECTS</span>
        <div>{other.map((record) => <strong key={record.key}>{record.label}</strong>)}</div>
        <small>Projects and portal workspaces are not automatically legal entities or DBAs.</small>
      </section>
    </div>
  );
}

function AddressCard({ address }: { address: AddressRole }) {
  return (
    <article className={`legalAddressCard legalAddressCard-${address.key}`}>
      <div className="legalCardTopline"><span>{address.role}</span><StatusBadge status={address.status} /></div>
      <h3>{address.label}</h3>
      <strong>{address.visibility}</strong>
      {address.addressLines.length ? <address>{address.addressLines.map((line) => <span key={line}>{line}</span>)}</address> : <div className="legalHiddenAddress">Actual street address intentionally absent</div>}
      <p>{address.purpose}</p>
      <div className="legalOutstanding"><span>OUTSTANDING / BOUNDARY</span><ul>{address.outstanding.map((item) => <li key={item}>{item}</li>)}</ul></div>
    </article>
  );
}

function AddressesView({ blueprint }: { blueprint: PortfolioBlueprintRecord }) {
  return (
    <div className="legalViewStack">
      <section className="legalBoundaryBanner"><div><span>RADCON THREE-ADDRESS MODEL</span><strong>Private identity, ordinary business, and registered office have different jobs.</strong></div><p>These choices do not automatically apply to RadWolfe.</p></section>
      <div className="legalAddressGrid" data-testid="legal-three-address-model">{blueprint.legalFoundation.addresses.map((address) => <AddressCard key={address.key} address={address} />)}</div>
      <section className="legalTruthNote"><strong>Future only</strong><p>If Rad Coffee / Rad Café becomes a physical headquarters, Radcon may later move its business/principal address there. That is not current state.</p></section>
    </div>
  );
}

function DocumentColumn({ group }: { group: DocumentGroup }) {
  return (
    <section className="legalDocumentGroup">
      <header><span>{group.key === "radcon" ? "RADCON RECORD POINTERS" : "SEPARATE VENTURE POINTERS"}</span><h2>{group.label}</h2></header>
      <div>{group.items.map((item) => <article key={item.label}><strong>{item.label}</strong><span className="legalStatus legalStatusNotFiled">{portfolioStatusLabel(item.state)}</span>{item.pointer ? <small>{item.pointer}</small> : null}</article>)}</div>
    </section>
  );
}

function DocumentsView({ blueprint }: { blueprint: PortfolioBlueprintRecord }) {
  return (
    <div className="legalViewStack" data-testid="legal-documents-compliance">
      <section className="legalBoundaryBanner"><div><span>DOCUMENTS & COMPLIANCE</span><strong>Future record pointers, not invented documents or deadlines.</strong></div><p>Governed archives remain below. A planning state is not proof that a document exists.</p></section>
      <div className="legalTwoColumnView">{blueprint.legalFoundation.documentGroups.map((group) => <DocumentColumn key={group.key} group={group} />)}</div>
    </div>
  );
}

function renderView(view: LegalOperatorView, blueprint: PortfolioBlueprintRecord) {
  if (view === "structure") return <StructureView blueprint={blueprint} />;
  if (view === "addresses") return <AddressesView blueprint={blueprint} />;
  return <DocumentsView blueprint={blueprint} />;
}

export function PortfolioBlueprint({ view }: { view: LegalOperatorView }) {
  const [blueprint, setBlueprint] = useState<PortfolioBlueprintRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await readO2File(PORTFOLIO_BLUEPRINT_PATH);
      setBlueprint(parsePortfolioBlueprint(JSON.parse(response.content || "")));
    } catch (reason) {
      setBlueprint(null);
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  const content = useMemo(() => blueprint ? renderView(view, blueprint) : null, [blueprint, view]);

  if (loading && !blueprint) return <div className="portfolioLoading">Loading the O2 legal foundation…</div>;
  if (error || !blueprint) {
    return <section className="portfolioError" aria-live="polite"><div><strong>Legal operating foundation unavailable</strong><p>{error || "O2 did not return the governed portfolio blueprint."}</p></div><button type="button" className="btn btnGhost" onClick={() => void refresh()}>Retry</button></section>;
  }

  return (
    <section className="legalOperatorWorkspace" aria-label="Legal operating foundation">
      {view === "structure" ? content : null}
      <header className="legalWorkspaceHeader">
        <div><span>O2 GOVERNED PLANNING REFERENCE</span><strong>{blueprint.title}</strong><small>Reviewed {blueprint.reviewedAt} · internal planning, not legal advice or filing proof</small></div>
        <button type="button" className="btn btnGhost btnCompact" onClick={() => void refresh()} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
      </header>
      {view === "structure" ? null : content}
    </section>
  );
}

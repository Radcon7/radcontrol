import { useCallback, useEffect, useMemo, useState } from "react";
import { readO2File } from "../common/o2Files";
import {
  parsePortfolioBlueprint,
  portfolioStatusLabel,
  PORTFOLIO_BLUEPRINT_PATH,
  type AccountGroup,
  type AddressRole,
  type DocumentGroup,
  type FormationStepState,
  type FormationWorkstream,
  type PortfolioBlueprint as PortfolioBlueprintRecord,
  type PortfolioRecord,
  type PortfolioRecordStatus,
} from "./portfolioBlueprintModel";

export type LegalOperatorView =
  | "structure"
  | "formation"
  | "addresses"
  | "brands"
  | "accounts"
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

const stepClass: Record<FormationStepState, string> = {
  complete: "legalStatus legalStatusActive",
  in_progress: "legalStatus legalStatusSelected",
  ready: "legalStatus legalStatusReady",
  blocked_waiting: "legalStatus legalStatusNeedsVerification",
  not_started: "legalStatus legalStatusNotFiled",
};

function StatusBadge({ status }: { status: PortfolioRecordStatus }) {
  return <span className={statusClass[status]}>{portfolioStatusLabel(status)}</span>;
}

function StepBadge({ state }: { state: FormationStepState }) {
  return <span className={stepClass[state]}>{portfolioStatusLabel(state)}</span>;
}

function RecordCard({ record, testId }: { record: PortfolioRecord; testId?: string }) {
  return (
    <article className="legalRecordCard" data-testid={testId}>
      <div className="legalCardTopline">
        <span>{record.kind.replace(/-/g, " ")}</span>
        <StatusBadge status={record.status} />
      </div>
      <h4>{record.label}</h4>
      <p>{record.role}</p>
      <strong>{record.relationship}</strong>
      <small>{record.notes}</small>
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
      <section className="legalBoundaryBanner">
        <div>
          <span>LEGAL / BUSINESS STRUCTURE</span>
          <strong>Two parallel boundaries. No ownership line connects them.</strong>
        </div>
        <p>Formation and relationship badges are planning states, not filing evidence.</p>
      </section>

      <section className="legalStructureDiagram" data-testid="legal-ownership-diagram" aria-label="Legal and business structure">
        <article className="legalStructureLane legalStructureLaneRadcon" data-testid="legal-radcon-entity">
          <header>
            <span>RADCON-OWNED PORTFOLIO</span>
            <StatusBadge status={radcon.status} />
          </header>
          <h2>{radcon.label}</h2>
          <p>{radcon.role}</p>
          <div className="legalOwnershipStem" aria-hidden="true" />
          <div className="legalOwnedBusinessGrid">
            {primary.map((record) => (
              <RecordCard
                key={record.key}
                record={record}
                testId={record.key === "offroad" ? "legal-offroad-node" : undefined}
              />
            ))}
          </div>
          <div className="legalProjectCluster">
            <span>OTHER AUTHORITATIVE RADCON PROJECTS</span>
            <div>{other.map((record) => <strong key={record.key}>{record.label}</strong>)}</div>
            <small>Projects and portal workspaces are not automatically legal entities or DBAs.</small>
          </div>
          <div className="legalSupportRail" aria-label="Radcon support relationships">
            {structure.supportRelationships.map((support) => (
              <article key={support.key}>
                <div><strong>{support.label}</strong><StatusBadge status={support.status} /></div>
                <span>{support.role}</span>
                <small>{support.detail}</small>
              </article>
            ))}
          </div>
        </article>

        <article className="legalStructureLane legalStructureLaneVenture" data-testid="legal-radwolfe-venture">
          <header>
            <span>PARALLEL VENTURE</span>
            <StatusBadge status={radwolfe.status} />
          </header>
          <h2>{radwolfe.label}</h2>
          <p>{radwolfe.role}</p>
          <div className="legalVentureBoundary">SEPARATE FROM RADCON ENTERPRISES</div>
          <div className="legalOwnershipStem" aria-hidden="true" />
          <RecordCard record={property} />
          <div className="legalTruthNote">
            <strong>No RadWolfe LLC today</strong>
            <p>No partner names, percentages, title structure, tax treatment, or entity terms are asserted.</p>
          </div>
        </article>
      </section>

      <section className="portalAccessPanel" data-testid="legal-portal-access-diagram">
        <header>
          <div><span>SHARED OPERATING PORTAL</span><h3>{portal.label}</h3></div>
          <StatusBadge status={portal.status} />
        </header>
        <div className="portalBoundaryLabel">{portal.relationshipLabel}</div>
        <p>{portal.summary}</p>
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
        <footer><strong>{portal.accountBoundary}</strong><span>{portal.futurePublicSite}</span></footer>
      </section>
    </div>
  );
}

function FormationColumn({ workstream }: { workstream: FormationWorkstream }) {
  return (
    <section className={`legalWorkstream legalWorkstream${workstream.key === "radcon" ? "Radcon" : "Radwolfe"}`}>
      <header><span>{workstream.key === "radcon" ? "RADCON" : "PARALLEL VENTURE"}</span><h3>{workstream.label}</h3><p>{workstream.summary}</p></header>
      <ol>
        {workstream.steps.map((step, index) => (
          <li key={step.key}>
            <i>{index + 1}</i>
            <div><strong>{step.label}</strong><p>{step.detail}</p></div>
            <StepBadge state={step.state} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function FormationView({ blueprint }: { blueprint: PortfolioBlueprintRecord }) {
  return <div className="legalTwoColumnView" data-testid="legal-formation-workstreams">{blueprint.legalFoundation.formationWorkstreams.map((workstream) => <FormationColumn key={workstream.key} workstream={workstream} />)}</div>;
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

function BrandCard({ record }: { record: PortfolioRecord }) {
  return (
    <article className="legalBrandCard">
      <div className="legalCardTopline"><span>{record.kind.replace(/-/g, " ")}</span><StatusBadge status={record.status} /></div>
      <h3>{record.label}</h3>
      <dl>
        <div><dt>Relationship</dt><dd>{record.relationship}</dd></div>
        <div><dt>Assumed name / DBA</dt><dd>{portfolioStatusLabel(record.dbaStatus)}</dd></div>
        <div><dt>Domain / site</dt><dd>{record.site || "Not established in this planning record"}</dd></div>
      </dl>
      <p>{record.notes}</p>
    </article>
  );
}

function BrandsView({ blueprint }: { blueprint: PortfolioBlueprintRecord }) {
  const radcon = blueprint.records.filter((record) => record.portfolioGroup === "radcon" && record.key !== "radcon-enterprises");
  const radwolfe = blueprint.records.find((record) => record.key === blueprint.legalFoundation.structure.radwolfeKey)!;
  const property = blueprint.records.find((record) => record.key === blueprint.legalFoundation.structure.radwolfePropertyKey)!;
  return (
    <div className="legalViewStack" data-testid="legal-brands-ventures">
      <section className="legalSectionHeading"><span>RADCON-OWNED BRANDS / BUSINESSES / PROJECTS</span><h2>Classify before filing</h2><p>A legal entity, brand, product, project, website, and assumed name are not interchangeable.</p></section>
      <div className="legalBrandGrid">{radcon.map((record) => <BrandCard key={record.key} record={record} />)}</div>
      <section className="legalParallelVenturePanel">
        <div><span>PARALLEL VENTURE</span><h2>{radwolfe.label}</h2><p>{radwolfe.relationship}</p></div>
        <StatusBadge status={radwolfe.status} />
        <dl><div><dt>Focus</dt><dd>Real estate partnership / venture</dd></div><div><dt>Current property</dt><dd>{property.label}</dd></div><div><dt>Portal administration</dt><dd>RCE RadWolfe workspace through explicit role grants</dd></div></dl>
        <small>{radwolfe.notes}</small>
      </section>
    </div>
  );
}

function AccountColumn({ group }: { group: AccountGroup }) {
  return (
    <section className="legalAccountGroup">
      <header><span>{group.key === "radcon" ? "BUSINESS FOUNDATION" : "SEPARATE FUTURE WORK"}</span><h2>{group.label}</h2></header>
      <div>{group.items.map((item) => <article key={item.label}><div><strong>{item.label}</strong><StepBadge state={item.state} /></div><p>{item.detail}</p></article>)}</div>
    </section>
  );
}

function AccountsView({ blueprint }: { blueprint: PortfolioBlueprintRecord }) {
  return (
    <div className="legalViewStack" data-testid="legal-business-accounts">
      <section className="legalBoundaryBanner"><div><span>BUSINESS ACCOUNTS</span><strong>Account readiness stays with the correct legal or venture boundary.</strong></div><p>No account numbers, routing details, credentials, or private KYC information appear here.</p></section>
      <div className="legalTwoColumnView">{blueprint.legalFoundation.businessAccounts.map((group) => <AccountColumn key={group.key} group={group} />)}</div>
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
  if (view === "formation") return <FormationView blueprint={blueprint} />;
  if (view === "addresses") return <AddressesView blueprint={blueprint} />;
  if (view === "brands") return <BrandsView blueprint={blueprint} />;
  if (view === "accounts") return <AccountsView blueprint={blueprint} />;
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
      <header className="legalWorkspaceHeader">
        <div><span>O2 GOVERNED PLANNING REFERENCE</span><strong>{blueprint.title}</strong><small>Reviewed {blueprint.reviewedAt} · internal planning, not legal advice or filing proof</small></div>
        <button type="button" className="btn btnGhost btnCompact" onClick={() => void refresh()} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
      </header>
      {content}
    </section>
  );
}

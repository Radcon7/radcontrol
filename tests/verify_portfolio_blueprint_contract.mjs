import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  parsePortfolioBlueprint,
  PORTFOLIO_BLUEPRINT_PATH,
} from "../src/components/paste-tabs/portfolioBlueprintModel.ts";

const record = (overrides = {}) => ({
  key: "radcon",
  label: "Radcon Enterprises LLC",
  kind: "legal-entity",
  portfolioGroup: "radcon",
  status: "not_formed",
  role: "Planned parent",
  parentKey: null,
  relationshipStatus: "planned",
  relationship: "Planned parent",
  dbaStatus: "not_applicable",
  site: null,
  notes: "No formation asserted.",
  ...overrides,
});

const valid = {
  schemaVersion: 2,
  title: "Legal Foundation",
  status: "working_blueprint",
  reviewedAt: "2026-08-24",
  purpose: "Planning only.",
  guardrails: ["Do not infer legal status."],
  records: [
    record(),
    record({ key: "dqotd", label: "DQOTD", kind: "product", parentKey: "radcon", status: "active", relationshipStatus: "active", dbaStatus: "needs_decision" }),
    record({ key: "offroad", label: "Offroad Croquet", kind: "product", parentKey: "radcon", status: "active", relationshipStatus: "active", dbaStatus: "needs_decision" }),
    record({ key: "radstock", label: "RadStock", kind: "project", parentKey: "radcon", status: "active", relationshipStatus: "active", dbaStatus: "not_planned" }),
    record({ key: "radwolfe", label: "RadWolfe", kind: "venture", portfolioGroup: "parallel-venture", parentKey: null, relationship: "Parallel venture" }),
    record({ key: "townhouse", label: "Jointly owned townhouse", kind: "property", portfolioGroup: "parallel-venture", parentKey: "radwolfe", status: "active", relationshipStatus: "active" }),
  ],
  legalFoundation: {
    structure: {
      radconKey: "radcon",
      primaryBusinessKeys: ["dqotd", "offroad"],
      otherProjectKeys: ["radstock"],
      radwolfeKey: "radwolfe",
      radwolfePropertyKey: "townhouse",
      supportRelationships: [{ key: "thrive", label: "THRIVE", role: "Business address", status: "selected", detail: "Verification pending." }],
    },
    portalAccess: {
      label: "RCE portal",
      status: "active",
      relationshipLabel: "OPERATING ACCESS — NOT OWNERSHIP",
      summary: "Role-based access.",
      roles: [{ label: "RadWolfe Partner Role", status: "active", access: "RadWolfe plus explicitly granted tabs." }],
      workspaceLabels: ["RadWolfe workspace"],
      accountBoundary: "No production account created.",
      futurePublicSite: "Future only.",
    },
    addresses: [
      { key: "private", label: "Private owner address", role: "KYC", status: "active", visibility: "Private", addressLines: [], purpose: "KYC only.", outstanding: ["Hidden"] },
      { key: "thrive", label: "THRIVE", role: "Business", status: "needs_verification", visibility: "Selected", addressLines: ["Business address"], purpose: "Business use.", outstanding: ["Verify"] },
      { key: "northwest", label: "Northwest", role: "Registered office", status: "selected", visibility: "Selected", addressLines: [], purpose: "State notices.", outstanding: ["Signup"] },
    ],
    formationWorkstreams: [
      { key: "radcon", label: "Radcon", summary: "Dependent chain.", steps: [{ key: "file", label: "File", state: "not_started", detail: "Not started." }] },
      { key: "radwolfe", label: "RadWolfe", summary: "Separate parallel workstream.", steps: [{ key: "evaluate", label: "Evaluate", state: "ready", detail: "No conclusion." }] },
    ],
    businessAccounts: [
      { key: "radcon", label: "Radcon", items: [{ label: "EIN", state: "not_started", detail: "Future." }] },
      { key: "radwolfe", label: "RadWolfe", items: [{ label: "Banking", state: "not_started", detail: "Separate future work." }] },
    ],
    documentGroups: [
      { key: "radcon", label: "Radcon", items: [{ label: "Articles", state: "not_created", pointer: null }] },
      { key: "radwolfe", label: "RadWolfe", items: [{ label: "Agreement", state: "not_uploaded", pointer: null }] },
    ],
    archives: [{ key: "legal_notes", label: "Notes", status: "available", description: "Governed notes." }],
  },
  nextDecisions: ["Verify facts."],
};

const parsed = parsePortfolioBlueprint(valid);
assert.equal(parsed.records[0].key, "radcon");
assert.equal(parsed.legalFoundation.addresses.length, 3);
assert.throws(() => parsePortfolioBlueprint({ ...valid, schemaVersion: 1 }), /schemaVersion must be 2/);
assert.throws(() => parsePortfolioBlueprint({ ...valid, legalFoundation: { ...valid.legalFoundation, addresses: valid.legalFoundation.addresses.slice(0, 2) } }), /exactly three/);
assert.throws(() => parsePortfolioBlueprint({ ...valid, records: valid.records.map((item) => item.key === "offroad" ? { ...item, parentKey: "missing" } : item) }), /parentKey must reference a known record/);

const [view, hub, css] = await Promise.all([
  readFile(new URL("../src/components/paste-tabs/PortfolioBlueprint.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/paste-tabs/LegalHubTab.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/App.css", import.meta.url), "utf8"),
]);

assert.match(view, /readO2File/);
assert.match(view, /PORTFOLIO_BLUEPRINT_PATH/);
assert.match(view, /legal-ownership-diagram/);
assert.match(view, /legal-radcon-entity/);
assert.match(view, /legal-radwolfe-venture/);
assert.match(view, /legal-offroad-node/);
assert.match(view, /legal-portal-access-diagram/);
assert.match(view, /portalBoundaryLabel/);
assert.match(view, /portal\.relationshipLabel/);
assert.match(view, /legal-three-address-model/);
assert.match(view, /Actual street address intentionally absent/);
assert.match(view, /No account numbers, routing details, credentials, or private KYC information/);

const modeOrder = ["Structure", "Formation", "Addresses & Agent", "Brands & Ventures", "Business Accounts", "Documents & Compliance"];
let cursor = -1;
for (const label of modeOrder) {
  const next = hub.indexOf(`label: "${label}"`);
  assert.ok(next > cursor, `${label} must follow the requested Legal tab order`);
  cursor = next;
}
assert.match(hub, /useState<LegalOperatorView>\("structure"\)/);
assert.match(hub, /legal_notes/);
assert.match(hub, /legal_documents/);
assert.match(hub, /legal_entity_structure/);
assert.doesNotMatch(hub, /label: "Portfolio Blueprint"/);
assert.match(css, /\.legalStructureDiagram/);
assert.match(css, /@media \(max-width: 620px\)/);
assert.match(css, /font-size: 14px/);
assert.equal(PORTFOLIO_BLUEPRINT_PATH, "docs/portfolio/PORTFOLIO_BLUEPRINT.json");

console.log("legal foundation contract: six operator tabs, parallel ownership diagram, portal boundary, privacy, and governed archives verified");

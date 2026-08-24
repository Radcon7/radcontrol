export const PORTFOLIO_BLUEPRINT_PATH =
  "docs/portfolio/PORTFOLIO_BLUEPRINT.json";

export const PORTFOLIO_RECORD_STATUSES = [
  "active",
  "planned",
  "not_formed",
  "selected",
  "needs_verification",
  "not_filed",
  "filed",
] as const;

export const FORMATION_STEP_STATES = [
  "complete",
  "in_progress",
  "ready",
  "blocked_waiting",
  "not_started",
] as const;

export const DOCUMENT_STATES = [
  "not_created",
  "not_uploaded",
  "pending",
  "available",
] as const;

export type PortfolioRecordStatus = (typeof PORTFOLIO_RECORD_STATUSES)[number];
export type FormationStepState = (typeof FORMATION_STEP_STATES)[number];
export type DocumentState = (typeof DOCUMENT_STATES)[number];

export type PortfolioRecord = {
  key: string;
  label: string;
  kind: string;
  portfolioGroup: "radcon" | "parallel-venture" | "operating-system";
  status: PortfolioRecordStatus;
  role: string;
  parentKey: string | null;
  relationshipStatus: PortfolioRecordStatus;
  relationship: string;
  dbaStatus: "not_applicable" | "not_planned" | "not_filed" | "needs_decision" | "filed";
  site: string | null;
  notes: string;
};

export type SupportRelationship = {
  key: string;
  label: string;
  role: string;
  status: PortfolioRecordStatus;
  detail: string;
};

export type PortalRole = {
  label: string;
  status: PortfolioRecordStatus;
  access: string;
};

export type AddressRole = {
  key: string;
  label: string;
  role: string;
  status: PortfolioRecordStatus;
  visibility: string;
  addressLines: string[];
  purpose: string;
  outstanding: string[];
};

export type FormationStep = {
  key: string;
  label: string;
  state: FormationStepState;
  detail: string;
};

export type FormationWorkstream = {
  key: "radcon" | "radwolfe";
  label: string;
  summary: string;
  steps: FormationStep[];
};

export type AccountItem = {
  label: string;
  state: FormationStepState;
  detail: string;
};

export type AccountGroup = {
  key: "radcon" | "radwolfe";
  label: string;
  items: AccountItem[];
};

export type DocumentItem = {
  label: string;
  state: DocumentState;
  pointer: string | null;
};

export type DocumentGroup = {
  key: "radcon" | "radwolfe";
  label: string;
  items: DocumentItem[];
};

export type LegalArchive = {
  key: "legal_notes" | "legal_documents" | "legal_entity_structure";
  label: string;
  status: "available";
  description: string;
};

export type LegalFoundation = {
  structure: {
    radconKey: string;
    primaryBusinessKeys: string[];
    otherProjectKeys: string[];
    radwolfeKey: string;
    radwolfePropertyKey: string;
    supportRelationships: SupportRelationship[];
  };
  portalAccess: {
    label: string;
    status: PortfolioRecordStatus;
    relationshipLabel: string;
    summary: string;
    roles: PortalRole[];
    workspaceLabels: string[];
    accountBoundary: string;
    futurePublicSite: string;
  };
  addresses: AddressRole[];
  formationWorkstreams: FormationWorkstream[];
  businessAccounts: AccountGroup[];
  documentGroups: DocumentGroup[];
  archives: LegalArchive[];
};

export type PortfolioBlueprint = {
  schemaVersion: 2;
  title: string;
  status: string;
  reviewedAt: string;
  purpose: string;
  guardrails: string[];
  records: PortfolioRecord[];
  legalFoundation: LegalFoundation;
  nextDecisions: string[];
};

type UnknownRecord = Record<string, unknown>;

const RECORD_STATUS_SET = new Set<string>(PORTFOLIO_RECORD_STATUSES);
const STEP_STATE_SET = new Set<string>(FORMATION_STEP_STATES);
const DOCUMENT_STATE_SET = new Set<string>(DOCUMENT_STATES);
const PORTFOLIO_GROUPS = new Set(["radcon", "parallel-venture", "operating-system"]);
const DBA_STATUSES = new Set(["not_applicable", "not_planned", "not_filed", "needs_decision", "filed"]);

function asRecord(value: unknown, message: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
  return value as UnknownRecord;
}

function asArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Portfolio blueprint ${field} must be an array.`);
  }
  return value;
}

function asText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Portfolio blueprint ${field} must be a non-empty string.`);
  }
  return value.trim();
}

function asNullableText(value: unknown, field: string): string | null {
  if (value === null) return null;
  return asText(value, field);
}

function asTextList(value: unknown, field: string, allowEmpty = false): string[] {
  const values = asArray(value, field);
  if (!allowEmpty && values.length === 0) {
    throw new Error(`Portfolio blueprint ${field} must not be empty.`);
  }
  return values.map((item, index) => asText(item, `${field}[${index}]`));
}

function asEnum<T extends string>(value: unknown, allowed: Set<string>, field: string): T {
  if (typeof value !== "string" || !allowed.has(value)) {
    throw new Error(`Portfolio blueprint ${field} has an unsupported value.`);
  }
  return value as T;
}

function parseRecord(value: unknown): PortfolioRecord {
  const record = asRecord(value, "Portfolio blueprint record must be an object.");
  const parentKey = record.parentKey;
  if (parentKey !== null && (typeof parentKey !== "string" || !parentKey.trim())) {
    throw new Error("Portfolio blueprint parentKey must be a key or null.");
  }

  return {
    key: asText(record.key, "record key"),
    label: asText(record.label, "record label"),
    kind: asText(record.kind, "record kind"),
    portfolioGroup: asEnum(record.portfolioGroup, PORTFOLIO_GROUPS, "portfolio group"),
    status: asEnum(record.status, RECORD_STATUS_SET, "record status"),
    role: asText(record.role, "record role"),
    parentKey,
    relationshipStatus: asEnum(record.relationshipStatus, RECORD_STATUS_SET, "relationship status"),
    relationship: asText(record.relationship, "record relationship"),
    dbaStatus: asEnum(record.dbaStatus, DBA_STATUSES, "DBA status"),
    site: asNullableText(record.site, "record site"),
    notes: asText(record.notes, "record notes"),
  };
}

function parseSupportRelationship(value: unknown): SupportRelationship {
  const record = asRecord(value, "Support relationship must be an object.");
  return {
    key: asText(record.key, "support key"),
    label: asText(record.label, "support label"),
    role: asText(record.role, "support role"),
    status: asEnum(record.status, RECORD_STATUS_SET, "support status"),
    detail: asText(record.detail, "support detail"),
  };
}

function parsePortalRole(value: unknown): PortalRole {
  const record = asRecord(value, "Portal role must be an object.");
  return {
    label: asText(record.label, "portal role label"),
    status: asEnum(record.status, RECORD_STATUS_SET, "portal role status"),
    access: asText(record.access, "portal role access"),
  };
}

function parseAddress(value: unknown): AddressRole {
  const record = asRecord(value, "Address role must be an object.");
  return {
    key: asText(record.key, "address key"),
    label: asText(record.label, "address label"),
    role: asText(record.role, "address role"),
    status: asEnum(record.status, RECORD_STATUS_SET, "address status"),
    visibility: asText(record.visibility, "address visibility"),
    addressLines: asTextList(record.addressLines, "address lines", true),
    purpose: asText(record.purpose, "address purpose"),
    outstanding: asTextList(record.outstanding, "address outstanding items"),
  };
}

function parseStep(value: unknown): FormationStep {
  const record = asRecord(value, "Formation step must be an object.");
  return {
    key: asText(record.key, "formation step key"),
    label: asText(record.label, "formation step label"),
    state: asEnum(record.state, STEP_STATE_SET, "formation step state"),
    detail: asText(record.detail, "formation step detail"),
  };
}

function parseWorkstream(value: unknown): FormationWorkstream {
  const record = asRecord(value, "Formation workstream must be an object.");
  const key = asEnum<"radcon" | "radwolfe">(
    record.key,
    new Set(["radcon", "radwolfe"]),
    "formation workstream key",
  );
  return {
    key,
    label: asText(record.label, "formation workstream label"),
    summary: asText(record.summary, "formation workstream summary"),
    steps: asArray(record.steps, "formation steps").map(parseStep),
  };
}

function parseAccountGroup(value: unknown): AccountGroup {
  const record = asRecord(value, "Account group must be an object.");
  const key = asEnum<"radcon" | "radwolfe">(
    record.key,
    new Set(["radcon", "radwolfe"]),
    "account group key",
  );
  return {
    key,
    label: asText(record.label, "account group label"),
    items: asArray(record.items, "account items").map((item) => {
      const row = asRecord(item, "Account item must be an object.");
      return {
        label: asText(row.label, "account label"),
        state: asEnum(row.state, STEP_STATE_SET, "account state"),
        detail: asText(row.detail, "account detail"),
      };
    }),
  };
}

function parseDocumentGroup(value: unknown): DocumentGroup {
  const record = asRecord(value, "Document group must be an object.");
  const key = asEnum<"radcon" | "radwolfe">(
    record.key,
    new Set(["radcon", "radwolfe"]),
    "document group key",
  );
  return {
    key,
    label: asText(record.label, "document group label"),
    items: asArray(record.items, "document items").map((item) => {
      const row = asRecord(item, "Document item must be an object.");
      return {
        label: asText(row.label, "document label"),
        state: asEnum(row.state, DOCUMENT_STATE_SET, "document state"),
        pointer: asNullableText(row.pointer, "document pointer"),
      };
    }),
  };
}

function parseArchive(value: unknown): LegalArchive {
  const record = asRecord(value, "Legal archive must be an object.");
  return {
    key: asEnum(
      record.key,
      new Set(["legal_notes", "legal_documents", "legal_entity_structure"]),
      "archive key",
    ),
    label: asText(record.label, "archive label"),
    status: asEnum(record.status, new Set(["available"]), "archive status"),
    description: asText(record.description, "archive description"),
  };
}

function parseLegalFoundation(value: unknown): LegalFoundation {
  const foundation = asRecord(value, "Legal foundation must be an object.");
  const structure = asRecord(foundation.structure, "Legal structure must be an object.");
  const portal = asRecord(foundation.portalAccess, "Portal access must be an object.");

  return {
    structure: {
      radconKey: asText(structure.radconKey, "Radcon structure key"),
      primaryBusinessKeys: asTextList(structure.primaryBusinessKeys, "primary business keys"),
      otherProjectKeys: asTextList(structure.otherProjectKeys, "other project keys"),
      radwolfeKey: asText(structure.radwolfeKey, "RadWolfe structure key"),
      radwolfePropertyKey: asText(structure.radwolfePropertyKey, "RadWolfe property key"),
      supportRelationships: asArray(structure.supportRelationships, "support relationships").map(parseSupportRelationship),
    },
    portalAccess: {
      label: asText(portal.label, "portal label"),
      status: asEnum(portal.status, RECORD_STATUS_SET, "portal status"),
      relationshipLabel: asText(portal.relationshipLabel, "portal relationship label"),
      summary: asText(portal.summary, "portal summary"),
      roles: asArray(portal.roles, "portal roles").map(parsePortalRole),
      workspaceLabels: asTextList(portal.workspaceLabels, "portal workspace labels"),
      accountBoundary: asText(portal.accountBoundary, "portal account boundary"),
      futurePublicSite: asText(portal.futurePublicSite, "portal future public site"),
    },
    addresses: asArray(foundation.addresses, "addresses").map(parseAddress),
    formationWorkstreams: asArray(foundation.formationWorkstreams, "formation workstreams").map(parseWorkstream),
    businessAccounts: asArray(foundation.businessAccounts, "business accounts").map(parseAccountGroup),
    documentGroups: asArray(foundation.documentGroups, "document groups").map(parseDocumentGroup),
    archives: asArray(foundation.archives, "archives").map(parseArchive),
  };
}

export function parsePortfolioBlueprint(value: unknown): PortfolioBlueprint {
  const source = asRecord(value, "Portfolio blueprint must be an object.");
  if (source.schemaVersion !== 2) {
    throw new Error("Portfolio blueprint schemaVersion must be 2.");
  }
  const records = asArray(source.records, "records").map(parseRecord);
  if (records.length === 0) {
    throw new Error("Portfolio blueprint records must not be empty.");
  }

  const keys = new Set(records.map((record) => record.key));
  if (keys.size !== records.length) {
    throw new Error("Portfolio blueprint record keys must be unique.");
  }
  if (records.some((record) => record.parentKey && !keys.has(record.parentKey))) {
    throw new Error("Portfolio blueprint parentKey must reference a known record.");
  }

  const legalFoundation = parseLegalFoundation(source.legalFoundation);
  const referencedKeys = [
    legalFoundation.structure.radconKey,
    ...legalFoundation.structure.primaryBusinessKeys,
    ...legalFoundation.structure.otherProjectKeys,
    legalFoundation.structure.radwolfeKey,
    legalFoundation.structure.radwolfePropertyKey,
  ];
  if (referencedKeys.some((key) => !keys.has(key))) {
    throw new Error("Legal structure must reference known portfolio records.");
  }
  if (legalFoundation.addresses.length !== 3) {
    throw new Error("Legal foundation must define exactly three Radcon address roles.");
  }

  return {
    schemaVersion: 2,
    title: asText(source.title, "title"),
    status: asText(source.status, "status"),
    reviewedAt: asText(source.reviewedAt, "reviewedAt"),
    purpose: asText(source.purpose, "purpose"),
    guardrails: asTextList(source.guardrails, "guardrails"),
    records,
    legalFoundation,
    nextDecisions: asTextList(source.nextDecisions, "nextDecisions"),
  };
}

export function portfolioStatusLabel(status: PortfolioRecordStatus | FormationStepState | DocumentState | string): string {
  return status.replace(/_/g, " ");
}

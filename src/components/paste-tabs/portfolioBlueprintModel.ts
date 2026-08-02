export const PORTFOLIO_BLUEPRINT_PATH =
  "docs/portfolio/PORTFOLIO_BLUEPRINT.json";

export type PortfolioRecordStatus =
  | "confirmed"
  | "planned"
  | "needs_verification";

export type PortfolioRecord = {
  key: string;
  label: string;
  kind: string;
  status: PortfolioRecordStatus;
  role: string;
  parentKey: string | null;
  relationshipStatus: PortfolioRecordStatus;
  notes: string;
};

export type PortfolioBlueprint = {
  schemaVersion: 1;
  title: string;
  status: string;
  reviewedAt: string;
  purpose: string;
  guardrails: string[];
  records: PortfolioRecord[];
  nextDecisions: string[];
};

type UnknownRecord = Record<string, unknown>;

const VALID_STATUSES = new Set<PortfolioRecordStatus>([
  "confirmed",
  "planned",
  "needs_verification",
]);

function asRecord(value: unknown, message: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
  return value as UnknownRecord;
}

function asText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Portfolio blueprint ${field} must be a non-empty string.`);
  }
  return value.trim();
}

function asTextList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`Portfolio blueprint ${field} must be a non-empty string array.`);
  }
  return value.map((item) => item.trim());
}

function asStatus(value: unknown, field: string): PortfolioRecordStatus {
  if (typeof value !== "string" || !VALID_STATUSES.has(value as PortfolioRecordStatus)) {
    throw new Error(`Portfolio blueprint ${field} has an unsupported status.`);
  }
  return value as PortfolioRecordStatus;
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
    status: asStatus(record.status, "record status"),
    role: asText(record.role, "record role"),
    parentKey,
    relationshipStatus: asStatus(record.relationshipStatus, "relationship status"),
    notes: asText(record.notes, "record notes"),
  };
}

export function parsePortfolioBlueprint(value: unknown): PortfolioBlueprint {
  const source = asRecord(value, "Portfolio blueprint must be an object.");
  if (source.schemaVersion !== 1) {
    throw new Error("Portfolio blueprint schemaVersion must be 1.");
  }
  if (!Array.isArray(source.records) || source.records.length === 0) {
    throw new Error("Portfolio blueprint records must be a non-empty array.");
  }

  const records = source.records.map(parseRecord);
  const keys = new Set(records.map((record) => record.key));
  if (keys.size !== records.length) {
    throw new Error("Portfolio blueprint record keys must be unique.");
  }
  if (records.some((record) => record.parentKey && !keys.has(record.parentKey))) {
    throw new Error("Portfolio blueprint parentKey must reference a known record.");
  }

  return {
    schemaVersion: 1,
    title: asText(source.title, "title"),
    status: asText(source.status, "status"),
    reviewedAt: asText(source.reviewedAt, "reviewedAt"),
    purpose: asText(source.purpose, "purpose"),
    guardrails: asTextList(source.guardrails, "guardrails"),
    records,
    nextDecisions: asTextList(source.nextDecisions, "nextDecisions"),
  };
}

export function portfolioStatusLabel(status: PortfolioRecordStatus): string {
  return status.replace(/_/g, " ");
}

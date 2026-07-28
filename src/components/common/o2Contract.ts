import clientContract from "../../../contracts/o2-radcontrol/v1/client.json" with { type: "json" };

export type O2ContractInfo = {
  ok: true;
  protocol: string;
  protocolVersion: number;
  minimumClientProtocolVersion: number;
  maximumClientProtocolVersion: number;
  capabilities: string[];
  schema: string;
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("O2 contract_info returned a non-object response.");
  }
  return value as JsonRecord;
}

function asInteger(record: JsonRecord, key: string): number {
  const value = record[key];
  if (!Number.isInteger(value)) {
    throw new Error(`O2 contract_info field ${key} must be an integer.`);
  }
  return value as number;
}

function asString(record: JsonRecord, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value) {
    throw new Error(`O2 contract_info field ${key} must be a non-empty string.`);
  }
  return value;
}

export function assertCompatibleO2Contract(value: unknown): O2ContractInfo {
  const record = asRecord(value);
  if (record.ok !== true) {
    throw new Error("O2 contract_info did not report a healthy contract.");
  }

  const protocol = asString(record, "protocol");
  if (protocol !== clientContract.protocol) {
    throw new Error(`Unsupported O2 protocol: ${protocol}.`);
  }

  const protocolVersion = asInteger(record, "protocolVersion");
  if (
    protocolVersion < clientContract.minimumO2ProtocolVersion ||
    protocolVersion > clientContract.maximumO2ProtocolVersion
  ) {
    throw new Error(
      `Incompatible O2 protocol version ${protocolVersion}; RadControl supports ${clientContract.minimumO2ProtocolVersion}-${clientContract.maximumO2ProtocolVersion}.`,
    );
  }

  const minimumClientProtocolVersion = asInteger(
    record,
    "minimumClientProtocolVersion",
  );
  const maximumClientProtocolVersion = asInteger(
    record,
    "maximumClientProtocolVersion",
  );
  if (
    clientContract.clientProtocolVersion < minimumClientProtocolVersion ||
    clientContract.clientProtocolVersion > maximumClientProtocolVersion
  ) {
    throw new Error(
      `O2 supports RadControl protocol ${minimumClientProtocolVersion}-${maximumClientProtocolVersion}; this client is ${clientContract.clientProtocolVersion}.`,
    );
  }

  const rawCapabilities = record.capabilities;
  if (
    !Array.isArray(rawCapabilities) ||
    rawCapabilities.some((capability) => typeof capability !== "string")
  ) {
    throw new Error("O2 contract_info capabilities must be a string array.");
  }
  const capabilities = rawCapabilities as string[];
  const available = new Set(capabilities);
  const missing = clientContract.requiredCapabilities.filter(
    (capability) => !available.has(capability),
  );
  if (missing.length > 0) {
    throw new Error(`O2 is missing required capabilities: ${missing.join(", ")}.`);
  }

  return {
    ok: true,
    protocol,
    protocolVersion,
    minimumClientProtocolVersion,
    maximumClientProtocolVersion,
    capabilities,
    schema: asString(record, "schema"),
  };
}

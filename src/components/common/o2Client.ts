import { invoke } from "@tauri-apps/api/core";
import { assertCompatibleO2Contract, type O2ContractInfo } from "./o2Contract.ts";

export const O2_STDIN_PAYLOAD_MAX_BYTES = 1024 * 1024;
export const O2_JSON_RESPONSE_MAX_BYTES = 4 * 1024 * 1024;
export const O2_STDERR_MAX_BYTES = 512 * 1024;
export const O2_JSON_RESPONSE_MAX_DEPTH = 128;

export type BridgeFailureKind =
  | "INVALID_REQUEST"
  | "UNSUPPORTED_VERB"
  | "EXECUTABLE_UNAVAILABLE"
  | "SPAWN_FAILURE"
  | "STDIN_FAILURE"
  | "TIMEOUT"
  | "OUTPUT_LIMIT_EXCEEDED"
  | "O2_PROCESS_FAILURE"
  | "CONCURRENCY_LIMIT"
  | "AUDIT_FAILURE"
  | "INTERNAL_BRIDGE_FAILURE";

export type RunO2Result = {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
  failureKind: BridgeFailureKind | null;
  requestId: string;
  durationMs: number;
};

export type E2EProjectRoots = {
  radcon: string;
  radwolfe: string;
  other: string;
};

export class O2CommandError extends Error {
  readonly verb: string;
  readonly result: RunO2Result;

  constructor(verb: string, result: RunO2Result, fallback: string) {
    super(errMsg(result, fallback));
    this.name = "O2CommandError";
    this.verb = redactO2Verb(verb);
    this.result = result;
  }
}

export class O2ResponseError extends Error {
  readonly failureKind = "MALFORMED_RESPONSE" as const;

  constructor(message: string) {
    super(message);
    this.name = "O2ResponseError";
  }
}

const BRIDGE_FAILURE_KINDS = new Set<BridgeFailureKind>([
  "INVALID_REQUEST",
  "UNSUPPORTED_VERB",
  "EXECUTABLE_UNAVAILABLE",
  "SPAWN_FAILURE",
  "STDIN_FAILURE",
  "TIMEOUT",
  "OUTPUT_LIMIT_EXCEEDED",
  "O2_PROCESS_FAILURE",
  "CONCURRENCY_LIMIT",
  "AUDIT_FAILURE",
  "INTERNAL_BRIDGE_FAILURE",
]);

const ENCODED_VERB_PREFIXES = [
  "files.list.",
  "files.read.",
  "files.rename.",
  "files.delete.",
  "project_note.ensure.",
  "project_retired.set.",
  "project_launch_date.set.",
  "project_create.preview.",
  "project_create.start.",
  "project_create.bootstrap.",
  "agent_profile.create.",
  "infrastructure_asset.create.",
  "sentinel.ask.",
  "port_status.batch.",
];

export function redactO2Verb(verb: string): string {
  const prefix = ENCODED_VERB_PREFIXES.find((candidate) =>
    verb.startsWith(candidate),
  );
  if (!prefix) return verb;
  return `${prefix}<redacted:${verb.length - prefix.length}chars>`;
}

export function redactSensitiveText(value: string): string {
  return value
    .replace(
      /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|npm_[A-Za-z0-9]{20,}|re_[A-Za-z0-9_-]{20,}|ya29\.[A-Za-z0-9_-]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{20,}|sb_secret_[A-Za-z0-9_-]{16,}|(?:AKIA|ASIA)[A-Z0-9]{16}|eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{8,})\b/g,
      "<redacted-secret>",
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]{16,}/gi, "Bearer <redacted-secret>")
    .replace(
      /\b([A-Z][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|SERVICE_ROLE_KEY))\s*=\s*[^\s]+/gi,
      "$1=<redacted-secret>",
    )
    .replace(
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
      "<redacted-private-key>",
    )
    .replace(
      /([?&](?:access_token|api_key|token|secret|password)=)[^&#\s]+/gi,
      "$1<redacted-secret>",
    )
    .replace(/(:\/\/[^:/\s]+:)[^@/\s]+@/gi, "$1<redacted-secret>@");
}

export function assertRunO2Result(value: unknown): RunO2Result {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new O2ResponseError("O2 bridge returned a non-object response.");
  }
  const record = value as Record<string, unknown>;
  const failureKind = record.failureKind;
  const stdoutBytes =
    typeof record.stdout === "string"
      ? new TextEncoder().encode(record.stdout).byteLength
      : -1;
  const stderrBytes =
    typeof record.stderr === "string"
      ? new TextEncoder().encode(record.stderr).byteLength
      : -1;
  const structurallyValid =
    typeof record.ok === "boolean" &&
    Number.isSafeInteger(record.code) &&
    (record.code as number) >= -2_147_483_648 &&
    (record.code as number) <= 2_147_483_647 &&
    typeof record.stdout === "string" &&
    stdoutBytes <= O2_JSON_RESPONSE_MAX_BYTES &&
    typeof record.stderr === "string" &&
    stderrBytes <= O2_STDERR_MAX_BYTES &&
    (failureKind === null ||
      (typeof failureKind === "string" &&
        BRIDGE_FAILURE_KINDS.has(failureKind as BridgeFailureKind))) &&
    typeof record.requestId === "string" &&
    /^rc-[0-9]+-[0-9]+-[0-9]+$/.test(record.requestId) &&
    Number.isSafeInteger(record.durationMs) &&
    (record.durationMs as number) >= 0;
  if (
    !structurallyValid ||
    (record.ok === true && record.code !== 0) ||
    (record.ok === false && record.code === 0) ||
    (record.ok === true && failureKind !== null) ||
    (record.ok === false && failureKind === null)
  ) {
    throw new O2ResponseError("O2 bridge returned an invalid response envelope.");
  }
  return {
    ...(record as RunO2Result),
    stdout: redactSensitiveText(record.stdout as string),
    stderr: redactSensitiveText(record.stderr as string),
  };
}

export async function getE2EProjectRoots(): Promise<E2EProjectRoots | null> {
  return (await invoke("e2e_project_roots")) as E2EProjectRoots | null;
}

export function b64urlEncodeUtf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function encodeO2JsonPayload(value: unknown): string {
  return b64urlEncodeUtf8(JSON.stringify(value));
}

async function invokeO2Unchecked(verb: string): Promise<RunO2Result> {
  return assertRunO2Result(await invoke("run_o2", { verb }));
}

let compatibilityPromise: Promise<O2ContractInfo> | null = null;

export function ensureO2Compatibility(): Promise<O2ContractInfo> {
  if (!compatibilityPromise) {
    compatibilityPromise = (async () => {
      const result = await invokeO2Unchecked("contract_info");
      if (!result.ok) {
        throw new O2CommandError(
          "contract_info",
          result,
          "O2 compatibility check failed",
        );
      }
      const payload = parseO2Json<unknown>(
        result.stdout || "",
        "O2 contract_info returned invalid JSON",
      );
      return assertCompatibleO2Contract(payload);
    })();
    void compatibilityPromise.catch(() => {
      compatibilityPromise = null;
    });
  }
  return compatibilityPromise;
}

export async function runO2(verb: string): Promise<RunO2Result> {
  if (verb !== "contract_info") {
    await ensureO2Compatibility();
  }
  return invokeO2Unchecked(verb);
}

export function joinO2ResultOutput(result: RunO2Result): string {
  const stdout = (result.stdout || "").trimEnd();
  const stderr = (result.stderr || "").trimEnd();
  if (stdout && stderr) return `${stdout}\n${stderr}`;
  return stdout || stderr || "";
}

export async function runO2Text(verb: string): Promise<string> {
  const result = await runO2(verb);
  if (!result.ok) {
    throw new O2CommandError(verb, result, `${redactO2Verb(verb)} failed`);
  }
  return joinO2ResultOutput(result);
}

export function errMsg(result: RunO2Result, fallback: string): string {
  const stderr = (result.stderr || "").trim();
  const stdout = (result.stdout || "").trim();
  const message = stderr || stdout || fallback;
  const category = result.failureKind || "UNKNOWN_FAILURE";
  return `${message} [${category}; request ${result.requestId}]`;
}

export function parseO2Json<T>(text: string, fallback: string): T {
  const normalized = (text || "").trim();
  if (new TextEncoder().encode(normalized).byteLength > O2_JSON_RESPONSE_MAX_BYTES) {
    throw new O2ResponseError(
      `${fallback}: response exceeds ${O2_JSON_RESPONSE_MAX_BYTES} bytes.`,
    );
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (const character of normalized) {
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{" || character === "[") {
      depth += 1;
      if (depth > O2_JSON_RESPONSE_MAX_DEPTH) {
        throw new O2ResponseError(
          `${fallback}: response exceeds nesting depth ${O2_JSON_RESPONSE_MAX_DEPTH}.`,
        );
      }
    } else if (character === "}" || character === "]") {
      depth -= 1;
    }
  }
  try {
    return JSON.parse(normalized) as T;
  } catch {
    throw new O2ResponseError(fallback);
  }
}

export async function runO2ParsedJson<T>(
  verb: string,
  errorFallback: string,
  invalidJsonFallback: string,
): Promise<T> {
  const result = await runO2(verb);
  if (!result.ok) {
    throw new O2CommandError(verb, result, errorFallback);
  }
  return parseO2Json<T>(result.stdout || "", invalidJsonFallback);
}

export async function runO2PayloadParsedJson<T>(
  verbPrefix: string,
  payload: unknown,
  errorFallback: string,
  invalidJsonFallback: string,
): Promise<T> {
  return runO2ParsedJson<T>(
    `${verbPrefix}.${encodeO2JsonPayload(payload)}`,
    errorFallback,
    invalidJsonFallback,
  );
}

export async function runO2StdinPayloadParsedJson<T>(
  verb: string,
  payload: unknown,
  errorFallback: string,
  invalidJsonFallback: string,
): Promise<T> {
  const payloadJson = JSON.stringify(payload);
  if (
    new TextEncoder().encode(payloadJson).byteLength >
    O2_STDIN_PAYLOAD_MAX_BYTES
  ) {
    throw new Error(
      `Payload exceeds the governed stdin limit of ${O2_STDIN_PAYLOAD_MAX_BYTES} bytes.`,
    );
  }

  await ensureO2Compatibility();
  const result = assertRunO2Result(
    await invoke("run_o2_payload", { verb, payloadJson }),
  );
  if (!result.ok) {
    throw new O2CommandError(verb, result, errorFallback);
  }
  return parseO2Json<T>(result.stdout || "", invalidJsonFallback);
}

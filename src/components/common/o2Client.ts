import { invoke } from "@tauri-apps/api/core";
import { assertCompatibleO2Contract, type O2ContractInfo } from "./o2Contract";

export const O2_STDIN_PAYLOAD_MAX_BYTES = 1024 * 1024;

export type RunO2Result = {
  ok?: boolean;
  code?: number;
  stdout?: string;
  stderr?: string;
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
    this.verb = verb;
    this.result = result;
  }
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
  return (await invoke("run_o2", { verb })) as RunO2Result;
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
    throw new O2CommandError(verb, result, `${verb} failed`);
  }
  return joinO2ResultOutput(result);
}

export function errMsg(result: RunO2Result, fallback: string): string {
  const stderr = (result.stderr || "").trim();
  const stdout = (result.stdout || "").trim();
  return stderr || stdout || fallback;
}

export function parseO2Json<T>(text: string, fallback: string): T {
  try {
    return JSON.parse((text || "").trim()) as T;
  } catch {
    throw new Error(fallback);
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
  const result = await invoke<RunO2Result>("run_o2_payload", {
    verb,
    payloadJson,
  });
  if (!result.ok) {
    throw new O2CommandError(verb, result, errorFallback);
  }
  return parseO2Json<T>(result.stdout || "", invalidJsonFallback);
}

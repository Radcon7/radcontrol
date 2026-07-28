import { invoke } from "@tauri-apps/api/core";
import { assertCompatibleO2Contract, type O2ContractInfo } from "./o2Contract";

// O2 transports authored document content through a command argument.
export const O2_INLINE_DOCUMENT_MAX_BYTES = 1024 * 1024;

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

export async function getE2EProjectRoots(): Promise<E2EProjectRoots | null> {
  return (await invoke("e2e_project_roots")) as E2EProjectRoots | null;
}

export type FilesListItem = {
  kind?: string;
  path?: string;
  mtime?: number;
  bytes?: number;
};

export type FilesListJson = {
  ok?: boolean;
  root?: string;
  docs_dir?: string;
  items?: FilesListItem[];
  error?: string;
};

export type FilesReadJson = {
  ok?: boolean;
  path?: string;
  content?: string;
  bytes?: number;
  mtime?: number;
  error?: string;
};

export type FilesWriteJson = {
  ok?: boolean;
  path?: string;
  mtime?: number;
  bytes?: number;
  error?: string;
};

export type FilesRenameJson = {
  ok?: boolean;
  fromPath?: string;
  toPath?: string;
  mtime?: number;
  bytes?: number;
  error?: string;
};

export type O2WritePayload = {
  path: string;
  content: string;
};

export type O2RenamePayload = {
  fromPath: string;
  toPath: string;
};

function assertInlineDocumentSize(content: string): void {
  if (new TextEncoder().encode(content).byteLength > O2_INLINE_DOCUMENT_MAX_BYTES) {
    throw new Error(
      `Document exceeds the governed inline save limit of ${O2_INLINE_DOCUMENT_MAX_BYTES} bytes.`,
    );
  }
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

export function normalizeO2Path(path: string): string {
  const trimmed = (path || "").trim().replace(/^\/+/, "");
  if (!trimmed) return "";
  return trimmed.startsWith("docs/") ? trimmed : `docs/${trimmed}`;
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
        throw new Error(errMsg(result, "O2 compatibility check failed"));
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
    throw new Error(errMsg(result, `${verb} failed`));
  }
  return joinO2ResultOutput(result);
}

export function errMsg(res: RunO2Result, fallback: string): string {
  const stderr = (res.stderr || "").trim();
  const stdout = (res.stdout || "").trim();
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
  const res = await runO2(verb);
  if (!res.ok) {
    throw new Error(errMsg(res, errorFallback));
  }

  return parseO2Json<T>(res.stdout || "", invalidJsonFallback);
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

export async function listO2Files(dir: string): Promise<FilesListJson> {
  const parsed = await runO2ParsedJson<FilesListJson>(
    `files.list.${b64urlEncodeUtf8(normalizeO2Path(dir))}`,
    "files.list failed",
    "files.list returned invalid JSON",
  );
  if (!parsed.ok) {
    throw new Error(parsed.error || "files.list returned error");
  }
  return parsed;
}

export async function readO2File(path: string): Promise<FilesReadJson> {
  const normalized = normalizeO2Path(path);
  const parsed = await runO2ParsedJson<FilesReadJson>(
    `files.read.${b64urlEncodeUtf8(normalized)}`,
    "files.read failed",
    "files.read returned invalid JSON",
  );
  if (!parsed.ok) {
    throw new Error(parsed.error || "files.read returned error");
  }
  return parsed;
}

export async function writeO2File(
  payload: O2WritePayload,
): Promise<FilesWriteJson> {
  assertInlineDocumentSize(payload.content);
  await ensureO2Compatibility();
  const result = await invoke<RunO2Result>("run_o2_payload", {
    verb: "files.write",
    payloadJson: JSON.stringify(payload),
  });
  if (!result.ok) throw new Error(errMsg(result, "files.write failed"));
  const parsed = parseO2Json<FilesWriteJson>(result.stdout || "", "files.write returned invalid JSON");
  if (!parsed.ok) {
    throw new Error(parsed.error || "files.write returned error");
  }
  return parsed;
}

export async function renameO2File(
  payload: O2RenamePayload,
): Promise<FilesRenameJson> {
  const parsed = await runO2PayloadParsedJson<FilesRenameJson>(
    "files.rename",
    payload,
    "files.rename failed",
    "files.rename returned invalid JSON",
  );
  if (!parsed.ok) {
    throw new Error(parsed.error || "files.rename returned error");
  }
  return parsed;
}

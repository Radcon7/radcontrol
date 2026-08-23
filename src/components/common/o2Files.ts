import {
  O2CommandError,
  O2_STDIN_PAYLOAD_MAX_BYTES,
  b64urlEncodeUtf8,
  runO2ParsedJson,
  runO2PayloadParsedJson,
  runO2StdinPayloadParsedJson,
} from "./o2Client";

export const O2_INLINE_DOCUMENT_MAX_BYTES = O2_STDIN_PAYLOAD_MAX_BYTES;

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

export type O2DeleteJson = {
  ok?: boolean;
  path?: string;
  error?: string;
};

export type O2DeletePayload = {
  path: string;
};

function assertInlineDocumentSize(content: string): void {
  if (new TextEncoder().encode(content).byteLength > O2_INLINE_DOCUMENT_MAX_BYTES) {
    throw new Error(
      `Document exceeds the governed inline save limit of ${O2_INLINE_DOCUMENT_MAX_BYTES} bytes.`,
    );
  }
}

export function normalizeO2Path(path: string): string {
  const trimmed = (path || "").trim().replace(/^\/+/, "");
  if (!trimmed) return "";
  return trimmed.startsWith("docs/") ? trimmed : `docs/${trimmed}`;
}

export class O2FileNotFoundError extends Error {
  readonly path: string;

  constructor(path: string) {
    super(`Governed O2 file not found: ${path}`);
    this.name = "O2FileNotFoundError";
    this.path = path;
  }
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
  try {
    const parsed = await runO2ParsedJson<FilesReadJson>(
      `files.read.${b64urlEncodeUtf8(normalized)}`,
      "files.read failed",
      "files.read returned invalid JSON",
    );
    if (!parsed.ok) {
      if (parsed.error === "file_not_found") {
        throw new O2FileNotFoundError(normalized);
      }
      throw new Error(parsed.error || "files.read returned error");
    }
    return parsed;
  } catch (error) {
    if (
      error instanceof O2CommandError &&
      error.message.includes("[o2][ERR] file not found:")
    ) {
      throw new O2FileNotFoundError(normalized);
    }
    throw error;
  }
}

export async function writeO2File(
  payload: O2WritePayload,
): Promise<FilesWriteJson> {
  assertInlineDocumentSize(payload.content);
  const parsed = await runO2StdinPayloadParsedJson<FilesWriteJson>(
    "files.write",
    payload,
    "files.write failed",
    "files.write returned invalid JSON",
  );
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

export async function deleteO2File(
  payload: O2DeletePayload,
): Promise<O2DeleteJson> {
  const parsed = await runO2PayloadParsedJson<O2DeleteJson>(
    "files.delete",
    payload,
    "files.delete failed",
    "files.delete returned invalid JSON",
  );
  if (!parsed.ok) {
    throw new Error(parsed.error || "files.delete returned error");
  }
  return parsed;
}

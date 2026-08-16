import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = await readFile(
  new URL("../src/components/common/o2Files.ts", import.meta.url),
  "utf8",
);
const client = await readFile(
  new URL("../src/components/common/o2Client.ts", import.meta.url),
  "utf8",
);

assert.match(client, /O2_STDIN_PAYLOAD_MAX_BYTES = 1024 \* 1024/);
assert.match(client, /assertRunO2Result\([\s\S]*invoke\("run_o2_payload"/);
assert.match(files, /O2_INLINE_DOCUMENT_MAX_BYTES = O2_STDIN_PAYLOAD_MAX_BYTES/);
assert.match(files, /function assertInlineDocumentSize\(content: string\)/);
assert.match(files, /assertInlineDocumentSize\(payload\.content\)/);
assert.match(files, /runO2StdinPayloadParsedJson<FilesWriteJson>/);
assert.doesNotMatch(files, /invoke<RunO2Result>/);
console.log("document transport contract: one governed stdin client enforces the inline save limit");

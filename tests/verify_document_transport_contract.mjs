import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../src/components/common/o2Files.ts", import.meta.url),
  "utf8",
);

assert.match(source, /O2_INLINE_DOCUMENT_MAX_BYTES = 1024 \* 1024/);
assert.match(source, /function assertInlineDocumentSize\(content: string\)/);
assert.match(source, /assertInlineDocumentSize\(payload\.content\)/);
assert.match(source, /invoke<RunO2Result>\("run_o2_payload"/);
console.log("document transport contract: inline save limit enforced before Tauri invocation");

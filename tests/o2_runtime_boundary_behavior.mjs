import assert from "node:assert/strict";
import {
  O2_JSON_RESPONSE_MAX_BYTES,
  O2_STDERR_MAX_BYTES,
  O2ResponseError,
  assertRunO2Result,
  parseO2Json,
  redactO2Verb,
} from "../src/components/common/o2Client.ts";

const success = {
  ok: true,
  code: 0,
  stdout: "{}\n",
  stderr: "",
  failureKind: null,
  requestId: "rc-42-123456-7",
  durationMs: 12,
};
assert.deepEqual(assertRunO2Result(success), success);

for (const malformed of [
  null,
  {},
  { ...success, ok: "true" },
  { ...success, code: 1 },
  { ...success, ok: false, code: 0, failureKind: "TIMEOUT" },
  { ...success, failureKind: "TIMEOUT" },
  { ...success, requestId: "attacker-selected" },
  { ...success, durationMs: -1 },
  { ...success, ok: false, failureKind: null },
  { ...success, ok: false, failureKind: "MADE_UP" },
  { ...success, stdout: "x".repeat(O2_JSON_RESPONSE_MAX_BYTES + 1) },
  { ...success, stderr: "x".repeat(O2_STDERR_MAX_BYTES + 1) },
]) {
  assert.throws(() => assertRunO2Result(malformed), O2ResponseError);
}

assert.deepEqual(parseO2Json('{"value":"{[escaped]}","ok":true}', "bad"), {
  value: "{[escaped]}",
  ok: true,
});
assert.throws(() => parseO2Json("{", "invalid JSON"), /invalid JSON/);
assert.throws(
  () => parseO2Json("[".repeat(129) + "]".repeat(129), "deep JSON"),
  /nesting depth 128/,
);
assert.throws(
  () => parseO2Json(`"${"x".repeat(O2_JSON_RESPONSE_MAX_BYTES)}"`, "large JSON"),
  /response exceeds 4194304 bytes/,
);

const sensitive = "project_create.start.c2VjcmV0LXBheWxvYWQ";
assert.equal(
  redactO2Verb(sensitive),
  "project_create.start.<redacted:19chars>",
);
assert.equal(redactO2Verb("dqotd.snapshot"), "dqotd.snapshot");

console.log("O2 client boundary: typed envelopes, bounded JSON, and payload redaction");

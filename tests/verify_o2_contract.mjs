import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertCompatibleO2Contract } from "../src/components/common/o2Contract.ts";

const client = JSON.parse(
  await readFile(new URL("../contracts/o2-radcontrol/v1/client.json", import.meta.url)),
);
const valid = {
  ok: true,
  protocol: client.protocol,
  protocolVersion: 1,
  minimumClientProtocolVersion: 1,
  maximumClientProtocolVersion: 1,
  capabilities: [...client.requiredCapabilities],
  schema: "o2://contracts/o2-radcontrol/v1/contract-info.schema.json",
};

assert.equal(assertCompatibleO2Contract(valid).protocolVersion, 1);
assert.throws(
  () => assertCompatibleO2Contract({ ...valid, protocolVersion: 2 }),
  /Incompatible O2 protocol version 2/,
);
assert.throws(
  () => assertCompatibleO2Contract({ ...valid, minimumClientProtocolVersion: 2 }),
  /this client is 1/,
);
assert.throws(
  () => assertCompatibleO2Contract({ ...valid, capabilities: [] }),
  /missing required capabilities/,
);

const transport = await readFile(
  new URL("../src/components/common/o2Files.ts", import.meta.url),
  "utf8",
);
assert.ok(transport.includes('invokeO2Unchecked("contract_info")'));
assert.ok(transport.includes("await ensureO2Compatibility()"));
console.log("O2 compatibility contract: version and capabilities fail closed");

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  REQUIRED_OPERATOR_PROJECT_KEYS,
  assertCompatibleO2Contract,
} from "../src/components/common/o2Contract.ts";

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
assert.deepEqual(REQUIRED_OPERATOR_PROJECT_KEYS, client.requiredOperatorProjectKeys);
assert.deepEqual(client.requiredOperatorProjectKeys, [
  "dqotd", "dqotd-backend", "tbis", "tbis-backend", "offroad", "offroad-backend",
  "radstock", "radcrm", "radconenterprises", "radfamily", "radwolfe", "radcalendar",
]);
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
  new URL("../src/components/common/o2Client.ts", import.meta.url),
  "utf8",
);
const diagnostics = await readFile(
  new URL("../src/components/runtime/RuntimeDiagnosticsModal.tsx", import.meta.url),
  "utf8",
);
assert.ok(transport.includes('invokeO2Unchecked("contract_info")'));
assert.ok(transport.includes("await ensureO2Compatibility()"));
assert.match(diagnostics, /REQUIRED_OPERATOR_PROJECT_KEYS/);
assert.doesNotMatch(diagnostics, /EXPECTED_PROJECT_KEYS/);
console.log("O2 compatibility contract: version and capabilities fail closed");

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  parsePortfolioBlueprint,
  PORTFOLIO_BLUEPRINT_PATH,
} from "../src/components/paste-tabs/portfolioBlueprintModel.ts";

const valid = {
  schemaVersion: 1,
  title: "Portfolio",
  status: "working_blueprint",
  reviewedAt: "2026-07-30",
  purpose: "Planning only.",
  guardrails: ["Do not infer legal status."],
  records: [
    {
      key: "root",
      label: "Root",
      kind: "operator",
      status: "confirmed",
      role: "Operator",
      parentKey: null,
      relationshipStatus: "confirmed",
      notes: "A non-sensitive record.",
    },
  ],
  nextDecisions: ["Verify facts."],
};

assert.equal(parsePortfolioBlueprint(valid).records[0].key, "root");
assert.throws(
  () => parsePortfolioBlueprint({ ...valid, schemaVersion: 2 }),
  /schemaVersion must be 1/,
);
assert.throws(
  () => parsePortfolioBlueprint({ ...valid, records: [{ ...valid.records[0], parentKey: "missing" }] }),
  /parentKey must reference a known record/,
);

const view = await readFile(
  new URL("../src/components/paste-tabs/PortfolioBlueprint.tsx", import.meta.url),
  "utf8",
);
assert.match(view, /readO2File/);
assert.match(view, /PORTFOLIO_BLUEPRINT_PATH/);
assert.match(view, /not legal advice or proof of formation/);
assert.equal(PORTFOLIO_BLUEPRINT_PATH, "docs/portfolio/PORTFOLIO_BLUEPRINT.json");
console.log("portfolio blueprint contract: validated O2 record, explicit statuses, read-only presentation");

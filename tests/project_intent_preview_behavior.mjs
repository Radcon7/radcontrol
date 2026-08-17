import assert from "node:assert/strict";
import { assertFormationPreviewResult } from "../src/components/projects/projectIntentPreview.ts";

const headings = [
  ["purpose", "Purpose"],
  ["usersCustomersOperators", "Users / Customers / Operators"],
  ["problemNeed", "Problem / Need"],
  ["value", "Value"],
  ["success", "Success"],
  ["acceptedCapabilities", "Accepted Capabilities"],
  ["constraintsNonGoals", "Constraints / Non-Goals"],
  ["specializedAuthorities", "Specialized Authorities"],
];

function fixture(label) {
  return {
    ok: true,
    action: "project_create.preview",
    projectIdentity: {
      name: label,
      label,
      key: label.toLowerCase(),
      org: "radcon",
      repoPath: `/home/chris/dev/playground/${label.toLowerCase()}`,
      projectArchetype: "standalone-product",
      deliverySurface: "public_website",
    },
    projectIntent: {
      contractVersion: 1,
      sections: headings.map(([key, heading]) => ({
        key,
        heading,
        body: `${label} ${heading} from O2`,
      })),
    },
    projectionDigest: "a".repeat(64),
  };
}

for (const label of ["Public", "Internal", "Minimal"]) {
  const result = assertFormationPreviewResult(fixture(label));
  assert.equal(result.projectIntent.sections[0].body, `${label} Purpose from O2`);
  assert.equal(result.projectIntent.sections.length, 8);
}

assert.throws(
  () => assertFormationPreviewResult({ ...fixture("Changed"), projectionDigest: "not-a-digest" }),
  /SHA-256/,
);
const reordered = fixture("Reordered");
[reordered.projectIntent.sections[0], reordered.projectIntent.sections[1]] = [
  reordered.projectIntent.sections[1],
  reordered.projectIntent.sections[0],
];
assert.throws(() => assertFormationPreviewResult(reordered), /does not match/);

console.log("Project Intent preview: O2 structure is strictly validated for Review");

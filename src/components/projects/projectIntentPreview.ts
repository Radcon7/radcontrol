const SECTION_CONTRACT = [
  ["purpose", "Purpose"],
  ["usersCustomersOperators", "Users / Customers / Operators"],
  ["problemNeed", "Problem / Need"],
  ["value", "Value"],
  ["success", "Success"],
  ["acceptedCapabilities", "Accepted Capabilities"],
  ["constraintsNonGoals", "Constraints / Non-Goals"],
  ["specializedAuthorities", "Specialized Authorities"],
] as const;

export type ProjectIntentSection = {
  key: (typeof SECTION_CONTRACT)[number][0];
  heading: (typeof SECTION_CONTRACT)[number][1];
  body: string;
};

export type FormationPreviewResult = {
  ok: true;
  action: "project_create.preview";
  projectIdentity: {
    name: string;
    label: string;
    key: string;
    org: string;
    repoPath: string;
    projectArchetype: string;
    deliverySurface: string;
  };
  projectIntent: {
    contractVersion: 1;
    sections: ProjectIntentSection[];
  };
  projectionDigest: string;
};

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function stringField(value: Record<string, unknown>, key: string, label: string): string {
  const field = value[key];
  if (typeof field !== "string" || !field.trim()) {
    throw new Error(`${label}.${key} must be a non-empty string.`);
  }
  return field;
}

export function assertFormationPreviewResult(value: unknown): FormationPreviewResult {
  const response = record(value, "Project Intent preview");
  if (response.ok !== true || response.action !== "project_create.preview") {
    throw new Error("O2 did not return a successful Project Intent preview.");
  }
  const digest = stringField(response, "projectionDigest", "Project Intent preview");
  if (!/^[a-f0-9]{64}$/.test(digest)) {
    throw new Error("Project Intent preview digest must be a SHA-256 hex value.");
  }

  const rawIdentity = record(response.projectIdentity, "Project Intent identity");
  const projectIdentity = {
    name: stringField(rawIdentity, "name", "Project Intent identity"),
    label: stringField(rawIdentity, "label", "Project Intent identity"),
    key: stringField(rawIdentity, "key", "Project Intent identity"),
    org: stringField(rawIdentity, "org", "Project Intent identity"),
    repoPath: stringField(rawIdentity, "repoPath", "Project Intent identity"),
    projectArchetype: stringField(rawIdentity, "projectArchetype", "Project Intent identity"),
    deliverySurface: stringField(rawIdentity, "deliverySurface", "Project Intent identity"),
  };

  const rawIntent = record(response.projectIntent, "Project Intent");
  if (rawIntent.contractVersion !== 1 || !Array.isArray(rawIntent.sections)) {
    throw new Error("O2 returned an unsupported Project Intent contract.");
  }
  if (rawIntent.sections.length !== SECTION_CONTRACT.length) {
    throw new Error("O2 Project Intent must contain the eight canonical sections.");
  }
  const sections = rawIntent.sections.map((rawSection, index) => {
    const section = record(rawSection, `Project Intent section ${index + 1}`);
    const [expectedKey, expectedHeading] = SECTION_CONTRACT[index];
    if (section.key !== expectedKey || section.heading !== expectedHeading) {
      throw new Error(`O2 Project Intent section ${index + 1} does not match the v1 contract.`);
    }
    return {
      key: expectedKey,
      heading: expectedHeading,
      body: stringField(section, "body", `Project Intent section ${index + 1}`),
    };
  });

  return {
    ok: true,
    action: "project_create.preview",
    projectIdentity,
    projectIntent: { contractVersion: 1, sections },
    projectionDigest: digest,
  };
}

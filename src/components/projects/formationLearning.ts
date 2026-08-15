export type FormationLearningInheritance = {
  routerContractVersion?: string;
  projectKey?: string;
  projectArchetype?: string;
  qualityProfile?: string;
  productAuthorityPath?: string;
  correctionLearningContractVersion?: string;
  boundedQueryRouting?: boolean;
  correctionReviewAvailable?: boolean;
  roadblockReviewAvailable?: boolean;
  qualityReviewAvailable?: boolean;
  correctionCloseoutRequired?: boolean;
  promotionMode?: string;
  memory?: {
    hostLocal?: boolean;
    optional?: boolean;
    authority?: boolean;
    inherited?: boolean;
    projectFilesCreated?: boolean;
    projectConfigurationCreated?: boolean;
  };
  sourceOwnership?: {
    productBehavior?: string;
    reusableLearning?: string;
    runtimeMemory?: string;
  };
  conformance?: { ok?: boolean; status?: string; errors?: string[] };
};

export function assertFormationLearningInheritance(
  value: unknown,
  expected: { projectKey: string; projectArchetype: string },
): FormationLearningInheritance {
  const learning = value as FormationLearningInheritance | null;
  const errors: string[] = [];
  if (!learning || typeof learning !== "object") {
    throw new Error("Bootstrap learning inheritance evidence is missing.");
  }
  if (learning.routerContractVersion !== "1") errors.push("router contract v1");
  if (learning.projectKey !== expected.projectKey) errors.push("project identity");
  if (learning.projectArchetype !== expected.projectArchetype) errors.push("project archetype");
  if (!learning.qualityProfile) errors.push("quality profile");
  if (learning.productAuthorityPath !== "docs/REPO_STATE.md") errors.push("product authority");
  if (learning.correctionLearningContractVersion !== "1") errors.push("correction-learning v1");
  if (learning.boundedQueryRouting !== true) errors.push("bounded O2 query route");
  if (learning.correctionReviewAvailable !== true) errors.push("correction review route");
  if (learning.roadblockReviewAvailable !== true) errors.push("roadblock review route");
  if (learning.qualityReviewAvailable !== true) errors.push("quality review route");
  if (learning.correctionCloseoutRequired !== true) errors.push("correction closeout");
  if (learning.promotionMode !== "human-reviewed-only") errors.push("human-reviewed promotion");
  if (
    learning.memory?.hostLocal !== true ||
    learning.memory?.optional !== true ||
    learning.memory?.authority !== false ||
    learning.memory?.inherited !== false ||
    learning.memory?.projectFilesCreated !== false ||
    learning.memory?.projectConfigurationCreated !== false
  ) {
    errors.push("non-authoritative non-inherited memory boundary");
  }
  if (
    learning.sourceOwnership?.productBehavior !== "repository-local-authority" ||
    learning.sourceOwnership?.reusableLearning !== "o2-candidate-lifecycle" ||
    learning.sourceOwnership?.runtimeMemory !== "host-local-optional-context"
  ) {
    errors.push("learning source ownership");
  }
  if (learning.conformance?.ok !== true || learning.conformance?.status !== "conformant") {
    errors.push("learning conformance");
  }
  if (errors.length) {
    throw new Error(`Bootstrap learning inheritance is incomplete: ${errors.join(", ")}.`);
  }
  return learning;
}

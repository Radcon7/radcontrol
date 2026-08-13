export const LEARNING_CANDIDATE_STATUSES = [
  "proposed",
  "needs-evidence",
  "duplicate",
  "accepted",
  "rejected",
  "promoted",
  "superseded",
  "retired",
] as const;

export type LearningCandidateStatus = (typeof LEARNING_CANDIDATE_STATUSES)[number];

export type SafeAuthorityLink = {
  id: string;
  title: string;
  repository: string;
  path: string;
  authorityClass: string;
  lifecycleStatus: string;
};

export type SafeCandidateSummary = {
  id: string;
  title: string;
  status: LearningCandidateStatus;
  relatedCatalogIds: string[];
  promotionState: string | null;
  authorityLinked: boolean;
  authorityLinks: SafeAuthorityLink[];
};

export type CandidateListSummary = {
  totalMatched: number;
  candidates: SafeCandidateSummary[];
};

export type SafeMemoryStatus = {
  enabled: boolean;
  useMemories: boolean;
  generateMemories: boolean;
  disableOnExternalContext: boolean;
  minimumRateLimitRemainingPercent: number | null;
  memoryFileCount: number;
  store: {
    integrity: string;
    jobCount: number | null;
    failedJobCount: number | null;
    generatedInputCount: number | null;
    lastSuccessfulGeneration: string | null;
  };
  extensionHost: {
    available: boolean;
    supportsMemories: boolean;
    version: string | null;
  };
  shellCli: {
    available: boolean;
    supportsMemories: boolean;
    version: string | null;
  };
};

type JsonRecord = Record<string, unknown>;

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} was not an object`);
  }
  return value as JsonRecord;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} was not boolean`);
  return value;
}

function nullableCount(value: unknown, label: string): number | null {
  if (value === null) return null;
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${label} was not a non-negative integer or null`);
  }
  return value as number;
}

function optionalString(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} was not a string or null`);
  }
  return value.trim();
}

function isCandidateStatus(value: unknown): value is LearningCandidateStatus {
  return LEARNING_CANDIDATE_STATUSES.includes(value as LearningCandidateStatus);
}

function boundedString(value: unknown, label: string, maxLength = 300): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > maxLength ||
    /[\r\n]/u.test(value)
  ) {
    throw new Error(`${label} was invalid`);
  }
  return value.trim();
}

function parseAuthorityLink(value: unknown): SafeAuthorityLink {
  const link = record(value, "authority link");
  return {
    id: boundedString(link.id, "authority link ID", 120),
    title: boundedString(link.title, "authority link title", 240),
    repository: boundedString(link.repository, "authority link repository", 80),
    path: boundedString(link.path, "authority link path", 500),
    authorityClass: boundedString(link.authorityClass, "authority class", 80),
    lifecycleStatus: boundedString(link.lifecycleStatus, "authority lifecycle", 80),
  };
}

function parseCandidateSummary(value: unknown): SafeCandidateSummary {
  const item = record(value, "candidate summary");
  if (typeof item.id !== "string" || !/^lesson-[a-f0-9]{16}$/u.test(item.id)) {
    throw new Error("candidate summary had an invalid ID");
  }
  if (typeof item.title !== "string" || !item.title.trim() || item.title.length > 240) {
    throw new Error("candidate summary had an invalid title");
  }
  if (!isCandidateStatus(item.status)) {
    throw new Error("candidate summary had an invalid status");
  }
  if (
    !Array.isArray(item.relatedCatalogIds) ||
    item.relatedCatalogIds.some(
      (id) => typeof id !== "string" || !/^[a-z0-9][a-z0-9._-]{1,119}$/u.test(id),
    )
  ) {
    throw new Error("candidate summary had invalid catalog IDs");
  }
  const promotionState = item.promotionState === null
    ? null
    : optionalString(item.promotionState, "candidate promotion state");
  const authorityLinked = item.authorityLinked === true;
  const authorityLinks = Array.isArray(item.authorityLinks)
    ? item.authorityLinks.map(parseAuthorityLink)
    : [];
  if (authorityLinked !== (authorityLinks.length > 0)) {
    throw new Error("candidate authority-link state was inconsistent");
  }
  return {
    id: item.id,
    title: item.title.trim(),
    status: item.status,
    relatedCatalogIds: item.relatedCatalogIds,
    promotionState,
    authorityLinked,
    authorityLinks,
  };
}

export function parseCandidateListSummary(
  value: unknown,
  expectedStatus: LearningCandidateStatus,
): CandidateListSummary {
  const response = record(value, "candidate list response");
  if (response.ok !== true || response.outcome !== "listed") {
    throw new Error("candidate list response was not healthy");
  }
  const totalMatched = nullableCount(response.totalMatched, "candidate total");
  if (totalMatched === null || !Array.isArray(response.candidates)) {
    throw new Error("candidate list response was incomplete");
  }
  const candidates = response.candidates.map(parseCandidateSummary);
  if (
    candidates.length > totalMatched ||
    candidates.some((candidate) => candidate.status !== expectedStatus)
  ) {
    throw new Error("candidate list response did not match its status filter");
  }
  return { totalMatched, candidates };
}

function parseHost(value: unknown, label: string): SafeMemoryStatus["extensionHost"] {
  const host = record(value, label);
  return {
    available: boolean(host.available, `${label}.available`),
    supportsMemories: boolean(host.supportsMemories, `${label}.supportsMemories`),
    version: optionalString(host.version, `${label}.version`),
  };
}

export function parseSafeMemoryStatus(value: unknown): SafeMemoryStatus {
  const response = record(value, "memory status response");
  if (response.ok !== true || response.rawMemoryContentIncluded !== false) {
    throw new Error("memory status response was not safe");
  }
  const store = record(response.store, "memory store status");
  if (typeof store.integrity !== "string" || !store.integrity.trim()) {
    throw new Error("memory store integrity was invalid");
  }
  return {
    enabled: boolean(response.enabled, "memory enabled"),
    useMemories: boolean(response.useMemories, "memory use setting"),
    generateMemories: boolean(response.generateMemories, "memory generation setting"),
    disableOnExternalContext: boolean(
      response.disableOnExternalContext,
      "external-context memory setting",
    ),
    minimumRateLimitRemainingPercent: nullableCount(
      response.minimumRateLimitRemainingPercent,
      "memory rate-limit threshold",
    ),
    memoryFileCount: nullableCount(response.memoryFileCount, "memory file count") ?? 0,
    store: {
      integrity: store.integrity.trim(),
      jobCount: nullableCount(store.jobCount, "memory job count"),
      failedJobCount: nullableCount(store.failedJobCount, "failed memory job count"),
      generatedInputCount: nullableCount(store.generatedInputCount, "generated memory input count"),
      lastSuccessfulGeneration: optionalString(
        store.lastSuccessfulGeneration,
        "last successful memory generation",
      ),
    },
    extensionHost: parseHost(response.extensionHost, "extension host"),
    shellCli: parseHost(response.shellCli, "shell CLI"),
  };
}

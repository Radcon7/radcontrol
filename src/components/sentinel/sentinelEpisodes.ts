import type { SentinelHostFinding } from './sentinelModel';

export type SentinelPresence = 'present' | 'observed-clear' | 'unknown';
export type SentinelSignificance = 'informational' | 'watching' | 'attention' | 'critical';
export type SentinelActionability = 'no-automatic-action' | 'governed-action-available' | 'operator-investigation-required';
export type ProcessContext = {
  capturedAt?: string | null; source: string; coverage: 'available' | 'unavailable';
  attribution: string; cpuBasis?: string;
  processes: Array<{process?: string; pid?: number; ppid?: number; cpuPercent?: number; projectKey?: string}>;
};
type Range = {min: number; max: number};
export type SentinelConcern = {
  episodeId?: string; concernKey: string; kind: string; title: string; finding?: SentinelHostFinding;
  presence: SentinelPresence; significance: SentinelSignificance; actionability: SentinelActionability;
  firstObservedAt?: string; lastObservedAt?: string; lastCheckedAt?: string; observedClearAt?: string | null;
  observationCount: number; recurrenceCount?: number; observationSpanSeconds?: number;
  evidenceScope?: 'current' | 'retained' | 'diagnostic'; currentObservedAt?: string; currentRecurrence?: boolean;
  currentTemperatureC?: number; temperatureC?: Range; fanRpm?: Range; cpuPercent?: Range; loadOneMinute?: Range;
  throttle?: {observed: boolean | null; delta?: Record<string,number>; basis?: string};
  resolution?: string; coverageQuality?: string; identityQuality?: string; impact?: string;
  attributionStatus?: string; processContext?: ProcessContext; evidenceRefs?: string[];
  nextAction?: 'fix-it' | 'investigate' | 'review-trend'; repairCapability?: string | null;
  repair?: {eventId: string; outcome: string; actionOccurred: boolean; verificationComplete: boolean} | null;
  learnedEvidence?: {observedEpisodes: number; observations: number; observedClearEpisodes: number; policyAdapted: false};
};
export type SentinelInterpretation = {
  version: 1; state: 'healthy' | 'watching' | 'attention' | 'unknown'; critical: boolean;
  currentEvidenceState?: 'healthy' | 'attention' | 'unknown' | 'critical';
  message: string; concerns: SentinelConcern[]; missingCore: string[]; coverage: string;
  actionability: SentinelActionability; processContext: ProcessContext; persisted: false; policyAdapted: false;
};
export type SentinelEpisodeProjection = {
  version: 1; concerns: SentinelConcern[]; episodes: SentinelConcern[]; policyVersion: number; policyAdapted: false;
  bounds: {maxEvents: number; maxEpisodes: number; maxEvidenceRefs: number; eventsExamined: number; episodesProjected: number; truncated: boolean};
  limitations: string[];
};

export function processContextState(context: ProcessContext | undefined, now = Date.now()): string {
  if (!context || context.coverage !== 'available') return 'Unknown';
  const captured = Date.parse(context.capturedAt || '');
  if (!Number.isFinite(captured) || captured > now) return 'Unknown capture time';
  // Reuse the existing current-view freshness boundary, not a new policy threshold.
  return now - captured > 90_000 ? 'Stale · retained context' : 'Available';
}
export function strongestProcessContext(diagnostic?: ProcessContext, retained?: ProcessContext): ProcessContext | undefined {
  return diagnostic?.coverage === 'available' ? diagnostic : retained?.coverage === 'available' ? retained : diagnostic || retained;
}

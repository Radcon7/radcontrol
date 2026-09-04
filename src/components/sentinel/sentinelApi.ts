import {
  runO2ParsedJson,
  runO2PayloadParsedJson,
} from "../common/o2Client";
import type {
  SentinelAutomation,
  SentinelCurrentMeasurements,
  SentinelHostFinding,
  SentinelHostGuidance,
  SentinelObservation,
  SentinelStatus,
} from "./sentinelModel";

export type HostCheckResponse = {
  ok: boolean;
  overallStatus: string;
  checkedAt?: string;
  eventId?: string;
  scanKind?: "full" | "targeted";
  scanDurationMs?: number;
  primaryFinding?: SentinelHostFinding;
  findings?: SentinelHostFinding[];
  guidance?: SentinelHostGuidance;
  metrics?: Record<string, SentinelObservation>;
  error?: string;
};

type FanExplanationResponse = {
  ok: boolean;
  analysisType: "deterministic";
  explanation: string;
  report: HostCheckResponse;
  llmUsed: boolean;
  error?: string;
};

export type PopUpgradeCleanupPreviewResponse = {
  ok: boolean;
  candidate: {
    id: "service:pop-upgrade.service";
    service: "pop-upgrade.service";
    label?: string;
  } | null;
  requiresOperatorConfirmation: boolean;
  requiresOsAuthorization: boolean;
  error?: string;
};

export type AskSentinelResponse = {
  ok: boolean;
  intent: string;
  answer: string;
  llmConnected: boolean;
  executionPermitted: boolean;
  requiresSourceVerification: boolean;
  eventId: string;
  error?: string;
};

export function loadSentinelStatus(): Promise<SentinelStatus> {
  return runO2ParsedJson<SentinelStatus>(
    "sentinel.status",
    "Could not load Sentinel status",
    "Sentinel status returned invalid data",
  );
}

export function loadCurrentHostMeasurements(): Promise<SentinelCurrentMeasurements> {
  return runO2ParsedJson<SentinelCurrentMeasurements>(
    "sentinel.host.current",
    "Could not refresh current host measurements",
    "Current Host Guardian measurements returned invalid data",
  );
}

export function investigateHostObservation(observationId: string): Promise<{
  ok: boolean;
  observationId: string;
  diagnosis: string;
  jobId: string;
  llmUsed: true;
  repairExecuted: false;
  nextStep: string;
}> {
  return runO2PayloadParsedJson(
    "sentinel.host.investigate",
    { observationId },
    "The governed Host Guardian diagnosis did not complete",
    "Host Guardian diagnosis returned invalid data",
  );
}

export function runHostHealthCheck(): Promise<HostCheckResponse> {
  return runO2ParsedJson<HostCheckResponse>(
    "sentinel.host.check",
    "Host Guardian health check failed",
    "Host Guardian returned invalid data",
  );
}

export function runHostDeepCheck(): Promise<HostCheckResponse> {
  return runO2ParsedJson<HostCheckResponse>(
    "sentinel.host.deep_check",
    "Host Guardian deep check failed",
    "Host Guardian returned invalid data",
  );
}

export function explainFans(): Promise<FanExplanationResponse> {
  return runO2ParsedJson<FanExplanationResponse>(
    "sentinel.host.explain_fans",
    "Host Guardian fan investigation failed",
    "Host Guardian fan investigation returned invalid data",
  );
}

export function runSecurityCheck(): Promise<HostCheckResponse> {
  return runO2ParsedJson<HostCheckResponse>(
    "sentinel.security.check",
    "Security Guardian check failed",
    "Security Guardian returned invalid data",
  );
}

export function askSentinel(question: string): Promise<AskSentinelResponse> {
  return runO2PayloadParsedJson<AskSentinelResponse>(
    "sentinel.ask",
    { question, sourceKind: "operator" },
    "Ask Sentinel failed",
    "Ask Sentinel returned invalid data",
  );
}

export function configureHostAutomation(
  enabled: boolean,
  frequency: SentinelAutomation["frequency"],
): Promise<{ ok: boolean; automation: SentinelAutomation }> {
  return runO2PayloadParsedJson(
    "sentinel.host.automation.configure",
    { enabled, frequency },
    "Host Guardian automatic observation configuration failed",
    "Host Guardian automatic observation returned invalid data",
  );
}

export function previewPopUpgradeCleanup(): Promise<PopUpgradeCleanupPreviewResponse> {
  return runO2ParsedJson<PopUpgradeCleanupPreviewResponse>(
    "workstation.cleanup.pop_upgrade.preview",
    "Safe Cleanup preview failed",
    "Safe Cleanup preview returned invalid data",
  );
}

export function applyPopUpgradeCleanup(): Promise<{ ok: boolean; actions?: Array<{ ok?: boolean; summary?: string }>; error?: string }> {
  return runO2ParsedJson<{ ok: boolean; actions?: Array<{ ok?: boolean; summary?: string }>; error?: string }>(
    "workstation.cleanup.pop_upgrade.apply",
    "Safe Cleanup did not complete",
    "Safe Cleanup returned invalid data",
  );
}

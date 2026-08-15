import {
  runO2ParsedJson,
  runO2PayloadParsedJson,
} from "../common/o2Files";
import type { SentinelStatus } from "./sentinelModel";

type HostCheckResponse = {
  ok: boolean;
  overallStatus: string;
  error?: string;
};

type FanExplanationResponse = {
  ok: boolean;
  explanation: string;
  llmUsed: boolean;
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

export type SentinelDryRunResponse = {
  ok: boolean;
  executed: boolean;
  action: {
    id: string;
    requestedCapability: string;
    policyResult: string;
    approvalRequirement: string;
    executionResult: string;
  };
  error?: string;
};

export function loadSentinelStatus(): Promise<SentinelStatus> {
  return runO2ParsedJson<SentinelStatus>(
    "sentinel.status",
    "Could not load Sentinel status",
    "Sentinel status returned invalid data",
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

export function prepareLockdownDryRun(): Promise<SentinelDryRunResponse> {
  return runO2PayloadParsedJson<SentinelDryRunResponse>(
    "sentinel.action.dry_run",
    {
      capability: "host.emergency.isolate-network",
      requestingAgent: "radcontrol-operator",
      reason: "Prepare lockdown simulation from RadControl",
      evidenceIds: [],
      arguments: {},
      sourceKind: "operator",
    },
    "Sentinel lockdown simulation failed",
    "Sentinel lockdown simulation returned invalid data",
  );
}

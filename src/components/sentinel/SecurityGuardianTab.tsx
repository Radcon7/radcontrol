import { useCallback, useEffect, useMemo, useState } from "react";
import { loadSentinelStatus, runSecurityCheck } from "./sentinelApi";
import {
  buildSentinelActivity,
  sentinelStatusLabel,
  type SentinelEvidenceStatus,
  type SentinelStatus,
} from "./sentinelModel";

const FUTURE_CONTROLS = [
  ["View User Activity", "Application session sources are not connected yet."],
  ["Authentication Logs", "Provider and product authentication feeds are not connected yet."],
  ["Security Events", "No live website or provider security-event adapter is connected yet."],
  ["Suspicious Activity", "Cross-account, device, purchase, return, and abuse signals are not connected yet."],
  ["Lock Down RCE", "Not connected. A future control must be server-owned, authenticated, confirmed, logged, and reversible."],
  ["Maintenance / Restrict Access", "Not connected. Hiding a tab is not security enforcement."],
] as const;

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function StatusPill({ status }: { status: SentinelEvidenceStatus }) {
  return <span className={`sentinelStatus sentinelStatus-${status}`}>{sentinelStatusLabel(status)}</span>;
}

export function SecurityGuardianTab() {
  const [status, setStatus] = useState<SentinelStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const next = await loadSentinelStatus();
    setStatus(next);
    return next;
  }, []);

  useEffect(() => {
    let active = true;
    void loadSentinelStatus()
      .then((next) => { if (active) setStatus(next); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function checkInventory(): Promise<void> {
    if (checking) return;
    setChecking(true);
    setError("");
    try {
      await runSecurityCheck();
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setChecking(false);
    }
  }

  const securityActivity = useMemo(
    () => buildSentinelActivity(status).filter((row) => row.guardian === "security").slice(0, 12),
    [status],
  );
  const security = status?.security;

  return (
    <section className="sentinelShell securityGuardianShell" data-testid="security-guardian-workspace">
      <header className="securityGuardianHero">
        <div>
          <span className="sentinelEyebrow">ONLINE TECHNOLOGY ESTATE</span>
          <h1>Security Guardian</h1>
          <p>Online technology estate — websites, apps, providers and connected security coverage, only where a real source is connected.</p>
        </div>
        <div className="securityGuardianHeroState">
          <StatusPill status={security?.overallStatus || "unknown"} />
          <span>Last inventory: {loading ? "Loading…" : formatDateTime(security?.checkedAt)}</span>
          <span>{security?.liveReadOnlyAdapterCount || 0} live read-only adapters</span>
        </div>
        <button className="btn btnPrimary" type="button" onClick={() => void checkInventory()} disabled={checking} data-testid="security-guardian-check">
          {checking ? "Checking…" : "Refresh Security Inventory"}
        </button>
      </header>

      {error ? <div className="panelError">{error}</div> : null}

      <section className="securityGuardianSection" data-testid="security-guardian-sources">
        <div className="sentinelSectionHeading"><span>VISIBILITY NOW</span><strong>Registry truth is not live security health</strong></div>
        <div className="securityGuardianSourceGrid">
          <article className="sentinelAdvancedSection">
            <div className="sentinelSubCardHeading"><div><span>PROVIDERS + SECURITY SYSTEMS</span><strong>{security?.providers.length || 0} declared sources</strong></div></div>
            <div className="sentinelProviderList securityInsetScroll">
              {(security?.providers || []).map((provider) => (
                <div key={provider.key} title={provider.reason}>
                  <span><strong>{provider.label}</strong><small>{provider.observationKinds?.join(" · ") || provider.category}</small></span>
                  <span className="securityConnectionState"><StatusPill status={provider.status} /><small>{provider.status === "not_configured" ? "Not connected yet" : provider.reason}</small></span>
                </div>
              ))}
              {!security?.providers.length ? <div className="surfaceEmptyState">Refresh the governed inventory to load declared sources.</div> : null}
            </div>
          </article>

          <article className="sentinelAdvancedSection">
            <div className="sentinelSubCardHeading"><div><span>REGISTERED WEBSITES + APPS</span><strong>{security?.websites.length || 0} inventory records</strong></div></div>
            <div className="sentinelWebsiteList securityInsetScroll">
              {(security?.websites || []).map((website) => (
                <div key={website.key} title={website.reason}>
                  <span><strong>{website.label}</strong><small>{website.url || website.key}</small></span>
                  <span className="securityConnectionState"><StatusPill status={website.status} /><small>Live security observer not connected yet</small></span>
                </div>
              ))}
              {!security?.websites.length ? <p>No website inventory has been loaded.</p> : null}
            </div>
          </article>
        </div>
      </section>

      <section className="securityGuardianSection" data-testid="security-guardian-controls">
        <div className="sentinelSectionHeading"><span>CONTROL READINESS</span><strong>No fake or client-only enforcement</strong></div>
        <div className="securityGuardianControlGrid securityInsetScroll">
          {FUTURE_CONTROLS.map(([label, reason]) => (
            <article key={label}>
              <strong>{label}</strong>
              <span>Not connected yet</span>
              <p>{reason}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="sentinelActivity securityGuardianActivity" data-testid="security-guardian-activity">
        <div className="sentinelActivityHeader"><div><span>RECENT SECURITY GUARDIAN ACTIVITY</span><strong>Real inventory events only</strong></div></div>
        <div className="sentinelActivityTable securityInsetScroll">
          {securityActivity.map((row) => (
            <div className="sentinelActivityRow" key={row.id} data-kind={row.kind}>
              <span><i className={`sentinelRecordDot sentinelRecordDot-${row.severity}`} /><strong>{formatDateTime(row.timestamp)}</strong><small>{row.kind.toUpperCase()}</small></span>
              <span><strong>{row.title}</strong><small>{row.severity.toUpperCase()}</small></span>
              <span><strong>{row.asset}</strong><small>{row.origin.replace(/-/g, " ")}</small></span>
              <span><strong>{row.result}</strong><small>{row.policy}</small></span>
            </div>
          ))}
          {!securityActivity.length ? <div className="surfaceEmptyState">No Security Guardian event has been recorded yet.</div> : null}
        </div>
      </section>

      <footer className="sentinelBoundary">
        <span>Provider mutation: {status?.providerMutation || "disabled"}</span>
        <span>Audit: {status?.auditVerification.claim || "hash-chained-not-immutable"}</span>
        <span>Routine monitoring: deterministic · no model tokens</span>
      </footer>
    </section>
  );
}

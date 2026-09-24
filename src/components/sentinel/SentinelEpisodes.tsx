import type { ProcessContext, SentinelConcern, SentinelEpisodeProjection } from './sentinelEpisodes.ts';
import { processContextState } from './sentinelEpisodes.ts';

const time = (value?: string | null) => value ? new Date(value).toLocaleString() : 'Unknown';
export function SentinelProcessContext({context, now}: {context?: ProcessContext; now: number}) {
  return <div className="sentinelProcessContext" data-testid="sentinel-process-context"><strong>Process context</strong>
    <small>Captured {time(context?.capturedAt)} · {processContextState(context, now)} · {context?.source || 'No retained source'}</small>
    {context?.processes.length ? <p>{context.processes.map(row => `${row.process || 'Process'} · PID ${row.pid ?? '?'} · ${row.cpuPercent ?? '?'}% CPU`).join(' / ')}</p> : <p>Process evidence unknown.</p>}
    {context?.workload ? <p data-testid="sentinel-workload-attribution">{context.workload.message}</p> : null}
    {context?.processes.length ? <small>Workload correlation; cause not established.</small> : null}
  </div>;
}
export function SentinelEpisodes({projection, current, expanded, onExpand}: {
  projection?: SentinelEpisodeProjection; current: SentinelConcern[]; expanded: boolean;
  onExpand: () => void;
}) {
  const rows = projection?.concerns || [];
  return <section className="guardianActivity" data-testid="recent-guardian-activity">
    <div className="sentinelActivityHeader"><div><span>RECENT EVENTS</span><strong>Concerns & episodes</strong></div><small>Retained observations · gaps are unknown</small></div>
    <div className="guardianActivityColumns" aria-hidden="true"><span>First / last observed</span><span>State</span><span>Evidence</span><span>Concern</span></div>
    <div className="guardianActivityScroll securityInsetScroll">
      {(expanded ? rows : rows.slice(0,6)).map(row => {
        const live = current.find(item => item.concernKey === row.concernKey);
        const present = live?.evidenceScope === 'current' ? live : row;
        const label = present.presence === 'unknown' ? 'UNKNOWN' : present.significance === 'attention' || present.significance === 'critical' ? 'NEEDS ATTENTION' : 'WATCHING';
        return <article className={`guardianActivityRow guardianActivityRow-${present.significance}`} key={row.concernKey} data-testid="guardian-activity-row">
          <div className="guardianActivityCell" data-activity-label="Observed"><strong>{time(row.firstObservedAt)}</strong><small>Last {time(row.lastObservedAt)}</small></div>
          <div className="guardianActivityCell" data-activity-label="State"><span className={`sentinelStatus sentinelStatus-${present.significance}`}>{label}</span><small>{present.presence === 'present' ? present.evidenceScope === 'current' ? 'Present now' : 'Present at last observation' : present.presence === 'observed-clear' ? 'Observed clear' : 'Not currently determined'}</small></div>
          <div className="guardianActivityCell" data-activity-label="Evidence"><strong>{row.learnedEvidence?.observations ?? row.observationCount} observations</strong><small>{row.recurrenceCount || 0} proven recurrences</small>{row.temperatureC ? <small>Peak {row.temperatureC.max}°C</small> : null}</div>
          <div className="guardianActivityCell guardianActivityContext" data-activity-label="Concern"><strong>{row.title}</strong>
            <small>{row.repair?.verificationComplete ? row.repair.actionOccurred ? 'Sentinel repair succeeded' : 'Recovery verified; no new repair' : present.actionability === 'governed-action-available' ? 'Governed updater action · fresh preview required' : 'No automatic repair available'}</small>
            {present.currentRecurrence ? <small>Hot again now; earlier clearance remains historical.</small> : null}
            <details className="guardianScanEvidence" data-testid="sentinel-episode-details"><summary>Review trend</summary>
              {row.fanRpm ? <p>Cooling response: fan {row.fanRpm.min.toLocaleString()}–{row.fanRpm.max.toLocaleString()} RPM.</p> : <p>Fan coverage unknown.</p>}
              <p>Throttle increase: {row.throttle?.observed === true ? 'observed' : row.throttle?.observed === false ? 'not observed in retained sample' : 'unknown'}. Workload attribution: {row.attributionStatus || 'unavailable'}.</p>
              <p>Observed clear {time(row.observedClearAt)}. Observation span {row.observationSpanSeconds == null ? '?' : Math.round(row.observationSpanSeconds)} seconds; actual duration unknown.</p>
              {row.cpuPercent || row.loadOneMinute ? <p>CPU {row.cpuPercent ? `${row.cpuPercent.min}–${row.cpuPercent.max}%` : 'unknown'} · Load {row.loadOneMinute ? `${row.loadOneMinute.min}–${row.loadOneMinute.max}` : 'unknown'}.</p> : null}
              {row.processContext ? <SentinelProcessContext context={row.processContext} now={Date.now()} /> : null}
              {row.identityQuality ? <p>{row.identityQuality}.</p> : null}
              <p>Coverage: {row.coverageQuality || 'unknown'}. {row.impact || ''}</p>
              <p>Historical evidence: {row.learnedEvidence?.observedClearEpisodes || 0} observed-clear occurrences. Policy unchanged.</p>
              <small>Raw evidence references: {row.evidenceRefs?.join(', ') || 'Not retained'}. Full retained scan snapshots remain in Details.</small>
              <details><summary>Episode evidence</summary><pre>{JSON.stringify(projection?.episodes.filter(episode => episode.concernKey === row.concernKey), null, 2)}</pre></details>
            </details>
          </div>
        </article>;
      })}
      {!rows.length ? <div className="surfaceEmptyState">{projection ? 'No concerns in retained episode evidence.' : 'Episode evidence unavailable.'}</div> : null}
    </div>
    {rows.length > 6 ? <button className="btn btnGhost btnCompact guardianActivityToggle" onClick={onExpand}>{expanded ? 'Show recent concerns' : `Show ${rows.length - 6} older concerns`}</button> : null}
  </section>;
}

import "./progressRail.css";

type Control = {
  disabled?: boolean;
  onChange: (percent: number) => void;
  onCommit: (percent: number) => void;
  onCancel: () => void;
};

/** Shared visual scale only. Task and initiative authorities remain separate. */
export function ProgressRail({ percent, label, trackClassName = "", control }: {
  percent: number; label: string; trackClassName?: string; control?: Control;
}) {
  return <div className="progressRail">
    <span aria-hidden="true">0</span>
    <div className={`progressRailTrack ${trackClassName}`} role={control ? undefined : "progressbar"}
      aria-label={control ? undefined : label} aria-valuemin={control ? undefined : 0}
      aria-valuemax={control ? undefined : 100} aria-valuenow={control ? undefined : percent}>
      <div className="progressRailFill" style={{ width: `${percent}%` }} />
      {control ? <input type="range" min="0" max="100" step="1" value={percent} aria-label={label}
        aria-valuetext={`${percent}%`} disabled={control.disabled}
        onChange={event => control.onChange(Number(event.currentTarget.value))}
        onPointerUp={event => control.onCommit(Number(event.currentTarget.value))}
        onPointerCancel={control.onCancel}
        onKeyUp={event => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) control.onCommit(Number(event.currentTarget.value)); }}
        onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); control.onCancel(); } }}
        onBlur={event => control.onCommit(Number(event.currentTarget.value))} />
        : <i className="progressRailPuck" style={{ left: `${percent}%` }} aria-hidden="true" />}
    </div>
    <span aria-hidden="true">100</span>
  </div>;
}

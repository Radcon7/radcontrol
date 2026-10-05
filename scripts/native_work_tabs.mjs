import assert from 'node:assert/strict';

// Computed RGB forms used by native CSSOM. Unknown or malformed forms fail closed.
export function computedRgbAlpha(color) {
  const match = /^rgba?\((.*)\)$/i.exec(String(color).trim());
  assert.ok(match, 'expected a computed rgb/rgba color');
  const body = match[1];
  let channels, alpha;
  if (body.includes(',')) {
    const parts = body.split(',').map(part => part.trim());
    assert.ok(parts.length === 3 || parts.length === 4, 'invalid computed RGB channels');
    channels = parts.slice(0, 3); alpha = parts[3] ?? '1';
  } else {
    const parts = body.split('/');
    assert.ok(parts.length <= 2, 'invalid computed RGB alpha');
    channels = parts[0].trim().split(/\s+/); alpha = parts[1]?.trim() ?? '1';
    assert.equal(channels.length, 3, 'invalid computed RGB channels');
  }
  const number = (token, maximum) => {
    assert.match(token, /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?%?$/i, 'invalid computed color number');
    const percent = token.endsWith('%');
    const value = Number(percent ? token.slice(0, -1) : token);
    assert.ok(Number.isFinite(value) && value >= 0 && value <= (percent ? 100 : maximum), 'computed color out of range');
    return percent ? value / 100 : value / maximum;
  };
  channels.forEach(channel => number(channel, 255));
  return number(alpha, 1);
}

export const WORK_TAB_STATE_SCRIPT = `
  const root = document.querySelector('[data-testid="work-workspace"]');
  return [...(root?.querySelectorAll(':scope > [role="tablist"] > [role="tab"]') || [])].map(tab => {
    const style = getComputedStyle(tab);
    return {
      id: tab.getAttribute('data-testid'), selected: tab.getAttribute('aria-selected'),
      tabIndex: tab.tabIndex, activeClass: tab.classList.contains('workspaceModeButtonActive'),
      borderColor: style.borderBottomColor, borderStyle: style.borderBottomStyle,
      borderWidth: style.borderBottomWidth,
      transitioning: tab.getAnimations().some(animation =>
        typeof animation.transitionProperty === 'string' && (animation.pending || animation.playState === 'running'))
    };
  });`;

export function assertWorkTabs(tabs, active) {
  const modes = ['tasks', 'initiatives', 'timeline'];
  assert.ok(modes.includes(active), 'expected Work mode');
  assert.deepEqual(tabs.map(tab => tab.id), modes.map(mode => `work-mode-${mode}`), 'one scoped Work tab for each mode');
  tabs.forEach((tab, index) => {
    const selected = modes[index] === active;
    assert.equal(tab.selected, String(selected), 'Work tab selection');
    assert.equal(tab.activeClass, selected, 'Work active styling belongs to selected tab');
    assert.equal(tab.tabIndex, selected ? 0 : -1, 'Work roving keyboard focus');
    assert.equal(tab.transitioning, false, 'Work tab transitions must settle before styling acceptance');
    assert.equal(tab.borderStyle, 'solid', 'Work tab keeps its solid border geometry');
    assert.equal(tab.borderWidth, '1px', 'Work tab keeps its one-pixel border geometry');
    const alpha = computedRgbAlpha(tab.borderColor);
    if (selected) assert.equal(alpha, 0, 'active Work tab bottom seam must be fully transparent');
    else assert.ok(alpha > 0, 'inactive Work tab border must remain visible');
  });
}

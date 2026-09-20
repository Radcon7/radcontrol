import assert from "node:assert/strict";

export async function assertSentinelDetails(base, sessionId, expectedOpen) {
  const state = await request(base, `/session/${sessionId}/execute/sync`, "POST", {
    script: `const disclosures = [...document.querySelectorAll('details.sentinelAdvancedWorkspace')];
      const details = disclosures[0];
      const panel = document.querySelector('[data-testid="sentinel-health-measurements"]');
      const summary = details?.querySelector(':scope > summary');
      const retainedContent = Boolean(panel && details?.contains(panel) && !summary?.contains(panel));
      if (details?.open && panel) panel.scrollIntoView({ block: 'start' });
      let suppressed = false;
      for (let node = panel; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        const firstSummary = node instanceof HTMLDetailsElement ? node.querySelector(':scope > summary') : null;
        suppressed ||= node.hidden || style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) === 0;
        suppressed ||= node instanceof HTMLDetailsElement && !node.open && !firstSummary?.contains(panel);
      }
      // WebKit can retain layout boxes (and report WebDriver displayed=true)
      // for unpainted non-summary content inside a closed details element.
      const bounds = panel?.getBoundingClientRect();
      const hasLayout = Boolean(bounds && bounds.width > 0 && bounds.height > 0);
      const hit = hasLayout ? document.elementFromPoint(bounds.left + 20, bounds.top + 20) : null;
      return {
        count: disclosures.length,
        open: details?.open ?? null,
        retainedContent,
        measurementVisible: retainedContent && !suppressed && hasLayout,
        measurementTextExposed: document.body.innerText.includes('MEASUREMENT DETAILS'),
        technicalTextExposed: /MEASUREMENT DETAILS|ADVANCED SYSTEM INFORMATION|SYSTEM EVIDENCE|SCAN COVERAGE|SAFETY & PERMISSIONS/.test(document.body.innerText),
        measurementHit: Boolean(hit && panel?.contains(hit)),
      };`,
    args: [],
  });
  assertSentinelDetailsState(state, expectedOpen);
}

export function assertSentinelDetailsState(state, expectedOpen) {
  assert.equal(state.count, 1, "Sentinel must retain one technical-details disclosure");
  assert.equal(state.open, expectedOpen, "Sentinel Details must follow the operator's disclosure state");
  assert.equal(state.retainedContent, true, "Technical measurements must remain in Details outside its summary");
  assert.equal(state.measurementVisible, expectedOpen, "Technical measurements must be visible only when Details is open");
  assert.equal(state.measurementTextExposed, expectedOpen, "Technical measurement text must be exposed only when Details is open");
  assert.equal(state.measurementHit, expectedOpen, "Technical measurements must be hit-testable only when Details is open");
  // WebDriver body text also includes unpainted descendants of closed Details in WebKit.
  if (!expectedOpen) assert.equal(state.technicalTextExposed, false, "Technical panels must not dominate the collapsed default view");
}


export async function guardianActivityGeometry(base, sessionId) {
  return request(base, `/session/${sessionId}/execute/sync`, "POST", {
    script: `
      const header = document.querySelector('.guardianActivityColumns');
      const scroll = document.querySelector('.guardianActivityScroll');
      const rows = [...document.querySelectorAll('[data-testid="guardian-activity-row"]')];
      const rect = (node) => {
        const value = node.getBoundingClientRect();
        return { top: value.top, right: value.right, bottom: value.bottom, left: value.left, width: value.width, height: value.height };
      };
      const isVisible = (node) => {
        const closedDetails = node.closest('details:not([open])');
        if (closedDetails && !node.closest('summary')) return false;
        const style = getComputedStyle(node);
        const value = node.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && value.width > 0 && value.height > 0;
      };
      const rowGeometry = rows.map((row) => {
        const bounds = rect(row);
        const descendants = [...row.querySelectorAll('*')].filter(isVisible);
        return {
          bounds,
          columnRects: [...row.children].map(rect),
          directChildCount: row.children.length,
          findingCount: row.querySelectorAll('.guardianFindingList > div').length,
          buttonCount: row.querySelectorAll('button').length,
          escapingDescendants: descendants.filter((node) => {
            const child = node.getBoundingClientRect();
            return child.top < bounds.top - 1 || child.bottom > bounds.bottom + 1;
          }).map((node) => node.className || node.tagName),
        };
      });
      const scrollBounds = scroll ? rect(scroll) : null;
      const contentBottom = rowGeometry.length && scrollBounds
        ? Math.max(...rowGeometry.map((row) => row.bounds.bottom)) - scrollBounds.top + scroll.scrollTop
        : 0;
      return {
        viewportWidth: window.innerWidth,
        headerDisplay: header ? getComputedStyle(header).display : null,
        headerColumnCount: header ? header.children.length : 0,
        headerColumnRects: header ? [...header.children].map(rect) : [],
        rowCount: rowGeometry.length,
        rows: rowGeometry,
        rowCrossings: rowGeometry.slice(0, -1).map((row, index) => row.bounds.bottom - rowGeometry[index + 1].bounds.top),
        scrollHeight: scroll?.scrollHeight || 0,
        clientHeight: scroll?.clientHeight || 0,
        contentBottom,
        overflowY: scroll ? getComputedStyle(scroll).overflowY : null,
      };
    `,
    args: [],
  });
}

export function assertGuardianActivityGeometry(layout, label, { desktop }) {
  assert.ok(layout.rowCount >= 2, `${label}: multiple retained Guardian rows are required`);
  assert.ok(layout.rows.some((row) => row.findingCount >= 2), `${label}: at least one multi-finding row is required`);
  assert.ok(layout.rows.some((row) => row.buttonCount > 0), `${label}: a rendered finding action is required`);
  assert.equal(layout.overflowY, "auto", `${label}: Guardian Activity must remain vertically scrollable`);
  assert.ok(layout.scrollHeight >= layout.clientHeight, `${label}: the scroll container must retain its complete content height`);
  assert.ok(layout.scrollHeight + 2 >= layout.contentBottom, `${label}: scrollHeight does not contain every activity row`);
  assert.deepEqual(layout.rows.map((row) => row.directChildCount), Array(layout.rowCount).fill(4), `${label}: each row must contain four logical cells`);
  assert.deepEqual(layout.rows.flatMap((row) => row.escapingDescendants), [], `${label}: a visible descendant escaped its owning row`);
  assert.ok(layout.rowCrossings.every((crossing) => crossing <= 1), `${label}: adjacent Guardian Activity rows overlap`);
  for (const row of layout.rows) assert.ok(row.bounds.height >= 62, `${label}: an activity row collapsed below its minimum height`);
  if (desktop) {
    assert.equal(layout.headerDisplay, "grid", `${label}: the four-column header must be visible`);
    assert.equal(layout.headerColumnCount, 4, `${label}: the desktop header must contain four columns`);
    for (const row of layout.rows) {
      row.columnRects.forEach((column, index) => {
        assert.ok(Math.abs(column.left - layout.headerColumnRects[index].left) <= 20, `${label}: row column ${index + 1} does not align with its header`);
      });
    }
  }
}


export async function request(base, route, method = "GET", body) {
  const response = await fetch(`${base}${route}`, {
    signal: AbortSignal.timeout(30_000),
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.value?.error) throw new Error(`${method} ${route}: ${JSON.stringify(payload)}`);
  return payload.value;
}


// Shared candidate/installed Wave 1 proof. This file is already digest-bound by
// the governed candidate receipt; navigation here never edits operational data.
export async function assertWave1Work(base, sessionId, click, until) {
  const execute = (script, args = []) => request(base, `/session/${sessionId}/execute/sync`, "POST", { script, args });
  const text = () => execute('return document.body.innerText;');
  await until(async () => assert.equal(await execute('return document.querySelector("[data-testid=logs-toggle]")?.getAttribute("aria-expanded");'), 'false'));
  assert.equal(await execute('return !!document.getElementById("command-output");'), false);
  await click('[data-testid="logs-toggle"]');
  await until(async () => assert.equal(await execute('return !!document.getElementById("command-output");'), true));
  await click('[data-testid="logs-toggle"]');
  await click('[data-testid="tab-notes"]');
  await click('[data-testid="notes-mode-empire_todo"]');
  await until(async () => assert.equal(await execute('return document.querySelectorAll("[data-testid=empire-todo-detail]").length;'), 1));
  const compact = await execute(`return {
    rows: document.querySelectorAll('.empireTodoRow').length,
    rowEditors: document.querySelectorAll('.empireTodoRow textarea,.empireTodoRow input:not([type=checkbox])').length,
    fields: [...document.querySelectorAll('.todoDetail textarea')].map(e=>e.getAttribute('aria-label')),
    next: document.querySelectorAll('.todoRowNext').length,
    progress: [...document.querySelectorAll('.todoProgress')].map(e=>({text:e.innerText,basis:e.dataset.progressBasis})),
    selectors: [...document.querySelectorAll('.todoRowSelect')].slice(0,2).map(e=>e.dataset.testid)
  };`);
  assert.ok(compact.rows > 0); assert.equal(compact.rowEditors, 0);
  assert.equal(compact.next, compact.rows);
  for (const name of ['Current state','Next Action','Dependencies / blockers','Acceptance / done condition','Summary','Context','Why it matters']) assert.ok(compact.fields.includes(name), name);
  assert.equal(compact.fields.length, 8);
  for (const state of compact.progress) {
    assert.equal(state.basis, 'lifecycle');
    assert.ok(!state.text.includes('%') || state.text === 'Done · 100%', 'No invented task percentage');
  }
  for (const selector of compact.selectors) {
    await click(`[data-testid="${selector}"]`);
    await until(async () => assert.equal(await execute('return document.querySelector("[data-testid=empire-todo-detail] [role=status]")?.innerText;'), 'Saved'));
  }
  await click('[data-testid="notes-mode-progress"]');
  await until(async () => assert.ok(await execute('return document.querySelectorAll(".taskProgressRail").length > 0;')));
  const progress = await execute(`return [...document.querySelectorAll('.empireTodoRow')].map(row => ({
    state: row.querySelector('.taskProgressRail')?.innerText,
    width: row.querySelector('.taskProgressTrack')?.getBoundingClientRect().width,
    available: row.querySelector('.todoRowSelect')?.getBoundingClientRect().width,
    next: !!row.querySelector('.todoRowNext'), selector: row.querySelector('.todoRowSelect')?.dataset.testid
  }));`);
  assert.ok(progress.length > 1, 'Progress retains several active tasks');
  for (const row of progress) {
    assert.match(row.state.trim(), /^(In progress|Blocked)$/i);
    assert.ok(row.width > row.available * 0.9, 'Lifecycle rail spans the active row');
    assert.equal(row.next, true);
  }
  assert.equal(await execute('return document.querySelectorAll("[data-testid=empire-todo-detail]").length;'), 0);
  await click(`[data-testid="${progress[0].selector}"]`);
  await until(async () => assert.equal(await execute('return document.querySelectorAll("[data-testid=empire-todo-detail]").length;'), 1));
  assert.equal(await execute('return document.querySelectorAll(".empireTodoRow").length;'), progress.length);
  await click('[aria-label="Close task detail"]');
  await until(async () => assert.equal(await execute('return document.querySelectorAll("[data-testid=empire-todo-detail]").length;'), 0));
  await click('[data-testid="notes-mode-timeline"]');
  await until(async () => {
    const body = await text(); assert.match(body, /Timeline/i); assert.doesNotMatch(body, /Loading timeline/i);
    assert.equal(await execute('return !!document.querySelector(".workspaceShell [role=alert]");'), false);
  });
  await click('[data-testid="tab-projects"]');
  await until(async () => assert.equal(await execute('return !!document.querySelector("[data-testid=project-notes]");'), true));
  const noteStatus = await until(async () => {
    const status = await execute('return document.querySelector("[data-testid=project-notes]").parentElement.innerText;');
    assert.doesNotMatch(status, /Loading note|Saving\.\.\./); return status;
  });
  assert.doesNotMatch(noteStatus, /1970/);
  assert.ok(await execute('return document.querySelectorAll("[data-testid^=project-row-]").length > 0;'), "Projects roster remains populated");
  return ['compact-task-list','selected-task-detail','next-action-blocker-acceptance','lifecycle-progress','progress-full-width-rails','progress-inline-detail-preserves-overview','read-only-navigation','timeline','project-notes-no-epoch','logs-collapsed-expanded-recollapsed','projects-navigation'];
}

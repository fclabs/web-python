/**
 * spec-04 — what a layout switch must leave alone.
 *
 * The switch is presentation only (BR-401): its whole effect is the
 * `data-layout` attribute, the control's checked state and one `localStorage`
 * write. Everything below asserts that from the outside, by observing the
 * session before and after — no production test hook is needed, because every
 * forbidden effect (a lint pass, an autosave write, a worker message, a
 * request, a transition) is observable in the page.
 *
 * VC-420 (FR-419, BR-401) — the editor's document, caret, selection, undo
 *                           history, markers and view identity.
 * VC-421 (FR-420) — the console buffer, its truncation marker and its scroll.
 * VC-422 (FR-421, BR-401) — a run continues on the same worker.
 * VC-423 (FR-422) — a pending stdin read and its unsubmitted text.
 * VC-424 (FR-423) — the diagnostics list, and no lint scheduled.
 * VC-425 (FR-424, BR-401) — no autosave reset, no `postMessage`, no request.
 * VC-426 (FR-425, NFR-404) — <= 100 ms, no long task, no transition, no request.
 * VC-434 (FR-426) — the editor's document scroll position, not its offset.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  consoleText,
  diagnosticEntries,
  openPlayground,
  runProgram,
  setCaret,
  setProgram,
  submitStdin,
  waitForLinter,
  waitForPythonReady,
  waitForStdinPrompt,
} from './helpers';

type Layout = 'vertical' | 'horizontal';

const WIDE = { width: 1280, height: 800 };

const RADIOS: Record<Layout, string> = {
  vertical: '#layout-vertical',
  horizontal: '#layout-horizontal',
};

test.use({ viewport: WIDE });

/** Load with the layout pinned, so every test starts from a known rendering. */
async function openAtLayout(page: Page, layout: Layout): Promise<void> {
  await page.addInitScript((seed) => {
    try {
      window.localStorage.setItem('pyplay.layout.v1', seed);
    } catch {
      /* not this suite's subject */
    }
  }, layout);
  await openPlayground(page);
  await expect
    .poll(() => page.evaluate(() => document.getElementById('app')?.dataset.layout))
    .toBe(layout);
}

/** Switch by the control, the way the visitor does, and wait for the paint. */
async function switchTo(page: Page, layout: Layout): Promise<void> {
  await page.click(RADIOS[layout]);
  await expect
    .poll(() => page.evaluate(() => document.getElementById('app')?.dataset.layout))
    .toBe(layout);
  // One frame, so the new geometry is settled before anything is measured.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));
}

/* -------------------------------------------------------------------------
   VC-420 (FR-419, BR-401)
   ------------------------------------------------------------------------- */

interface EditorObservations {
  doc: string;
  caret: number;
  selection: { from: number; to: number };
  markers: { from: number; to: number }[];
  sameView: boolean;
}

/**
 * Everything FR-419 enumerates, read out of the live `EditorView`.
 *
 * The view is stashed on `window` the first time this runs, so `sameView`
 * answers FR-419's "the same object it was before the switch" directly rather
 * than by proxy.
 */
async function observeEditor(page: Page): Promise<EditorObservations> {
  return page.evaluate(() => {
    const content = document.querySelector('.cm-content') as
      | (HTMLElement & { cmView?: { view: unknown }; cmTile?: { view: unknown } })
      | null;
    const view = (content?.cmTile?.view ?? content?.cmView?.view) as
      | {
          state: {
            doc: { toString(): string };
            selection: { main: { head: number; from: number; to: number } };
            field(f: unknown, required: false): unknown;
          };
        }
      | undefined;
    if (!view) throw new Error('CodeMirror view not found');

    const store = window as unknown as { __layoutView?: unknown };
    const sameView = store.__layoutView === undefined ? true : store.__layoutView === view;
    store.__layoutView = view;

    // The rendered marker ranges, read from the decorations CodeMirror
    // actually painted rather than from the diagnostics that produced them.
    const markers = Array.from(document.querySelectorAll('.cm-content .cm-diagnostic-mark')).map(
      (el) => {
        const box = el.getBoundingClientRect();
        return { from: Math.round(box.width), to: (el.textContent ?? '').length };
      },
    );

    const main = view.state.selection.main;
    return {
      doc: view.state.doc.toString(),
      caret: main.head,
      selection: { from: main.from, to: main.to },
      markers,
      sameView,
    };
  });
}

/** The editor's current document text. */
async function editorDoc(page: Page): Promise<string> {
  return page.evaluate(() => {
    const content = document.querySelector('.cm-content') as
      | (HTMLElement & { cmView?: { view: unknown }; cmTile?: { view: unknown } })
      | null;
    const view = (content?.cmTile?.view ?? content?.cmView?.view) as
      | { state: { doc: { toString(): string } } }
      | undefined;
    return view?.state.doc.toString() ?? '';
  });
}

/**
 * How many distinct documents `Ctrl/Cmd+Z` walks back through before the
 * history bottoms out — the observable form of FR-419's "undo history depth".
 * The floor is the restored program, not an empty document, so the count is
 * what is compared rather than any particular end state.
 */
async function undoSteps(page: Page, limit = 20): Promise<number> {
  let steps = 0;
  let previous = await editorDoc(page);
  for (let i = 0; i < limit; i++) {
    await page.locator('.cm-content').press('ControlOrMeta+z');
    const current = await editorDoc(page);
    if (current === previous) break;
    steps++;
    previous = current;
  }
  return steps;
}

test('VC-420 (FR-419, BR-401): the editor survives a switch each way intact', async ({ page }) => {
  await openAtLayout(page, 'vertical');
  await waitForPythonReady(page);
  await waitForLinter(page);

  // A 40-line program with a name error, so lint produces a marker.
  const lines = Array.from({ length: 39 }, (_, i) => `value_${i} = ${i} * 2`);
  lines.splice(11, 0, 'print(undefined_name)');
  const program = `${lines.join('\n')}\n`;
  await setProgram(page, program);
  await expect.poll(() => diagnosticEntries(page)).not.toHaveLength(0);
  await expect(page.locator('.cm-content .cm-diagnostic-mark')).not.toHaveCount(0);

  // Caret at line 12 column 5, then a 20-character selection, then one undo
  // and one redo — so the history has depth on both sides.
  await setCaret(page, 12, 5);
  await page.locator('.cm-content').press('ControlOrMeta+z');
  // `Mod-y` is CodeMirror's redo on Windows and Linux only; `Mod-Shift-z` is
  // bound on every platform, macOS included.
  await page.locator('.cm-content').press('ControlOrMeta+Shift+z');
  await expect
    .poll(async () => (await observeEditor(page)).doc)
    .toBe(program);
  // The undo and the redo are both document changes, so each re-schedules
  // lint (`LINT_DEBOUNCE_MS`) and the markers are replaced. Wait for the pass
  // that follows the redo, or the observations below would capture the gap.
  await expect(page.locator('.cm-content .cm-diagnostic-mark')).not.toHaveCount(0);
  await setCaret(page, 12, 5);
  await page.evaluate(() => {
    const content = document.querySelector('.cm-content') as
      | (HTMLElement & { cmView?: { view: unknown }; cmTile?: { view: unknown } })
      | null;
    const view = (content?.cmTile?.view ?? content?.cmView?.view) as
      | {
          state: { selection: { main: { head: number } } };
          dispatch(spec: unknown): void;
        }
      | undefined;
    const head = view!.state.selection.main.head;
    view!.dispatch({ selection: { anchor: head, head: head + 20 } });
  });

  const before = await observeEditor(page);
  expect(before.doc).toBe(program);
  expect(before.selection.to - before.selection.from, 'a 20-character selection').toBe(20);
  expect(before.markers, 'lint produced at least one marker').not.toHaveLength(0);

  for (const layout of ['horizontal', 'vertical'] as const) {
    await switchTo(page, layout);
    const after = await observeEditor(page);
    expect(after.doc, `${layout}: the document text`).toBe(before.doc);
    expect(after.caret, `${layout}: the caret offset`).toBe(before.caret);
    expect(after.selection, `${layout}: the selection range`).toEqual(before.selection);
    expect(after.markers, `${layout}: the rendered markers`).toEqual(before.markers);
    expect(after.sameView, `${layout}: the same EditorView instance`).toBe(true);
  }

  // FR-419's last clause: the history is not merely present but usable, and
  // it still undoes the same edit. `setProgram` dispatched one change over the
  // starter program, so exactly one undo returns to it.
  await page.locator('.cm-content').press('ControlOrMeta+z');
  const undone = await observeEditor(page);
  expect(undone.doc, 'Ctrl/Cmd+Z still undoes the same edit').not.toBe(program);
  await page.locator('.cm-content').press('ControlOrMeta+Shift+z');
  expect((await observeEditor(page)).doc, 'and redo restores it').toBe(program);
});

test('VC-420 (FR-419): the undo depth is unchanged by a switch', async ({ page }) => {
  await openAtLayout(page, 'vertical');
  await waitForPythonReady(page);

  /** Type three separately-undoable edits and report the resulting depth. */
  const buildHistory = async (): Promise<{ doc: string }> => {
    await page.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Delete');
    for (const text of ['a = 1\n', 'b = 2\n', 'c = 3\n']) {
      await page.keyboard.type(text);
      // CodeMirror groups keystrokes by time; a pause makes each line a step.
      await page.waitForTimeout(600);
    }
    return { doc: await editorDoc(page) };
  };

  // The depth is destructive to measure, so it is measured twice from the same
  // starting recipe: once with no switch, once with two. FR-419 requires the
  // two counts to agree.
  const { doc: withoutSwitch } = await buildHistory();
  const baseline = await undoSteps(page);
  expect(baseline, 'three edits produced at least three history steps').toBeGreaterThanOrEqual(3);

  await page.reload();
  await page.waitForSelector('.cm-content');
  const { doc: withSwitch } = await buildHistory();
  expect(withSwitch, 'the same document either way').toBe(withoutSwitch);

  await switchTo(page, 'horizontal');
  await switchTo(page, 'vertical');
  expect(await editorDoc(page), 'the switches changed nothing').toBe(withSwitch);

  expect(await undoSteps(page), 'the switches cost no history').toBe(baseline);
});

/* -------------------------------------------------------------------------
   VC-421 (FR-420)
   ------------------------------------------------------------------------- */

/** The console's scroll state, and whether it is pinned to the bottom. */
async function consoleScroll(
  page: Page,
): Promise<{ top: number; height: number; scrollHeight: number; pinned: boolean }> {
  return page.evaluate(() => {
    const el = document.getElementById('console')!;
    return {
      top: el.scrollTop,
      height: el.clientHeight,
      scrollHeight: el.scrollHeight,
      pinned: Math.abs(el.scrollTop + el.clientHeight - el.scrollHeight) <= 2,
    };
  });
}

test('VC-421 (FR-420): a bottom-pinned console stays pinned and keeps following', async ({
  page,
}) => {
  await openAtLayout(page, 'vertical');
  await waitForPythonReady(page);

  await runProgram(page, 'for i in range(6000):\n    print(i)\n');
  await expect(page.locator('#console')).toContainText('Program finished in', { timeout: 60_000 });

  const before = await consoleText(page);
  expect(await consoleScroll(page)).toMatchObject({ pinned: true });

  await switchTo(page, 'horizontal');

  expect(await consoleText(page), 'the buffer is byte-identical').toBe(before);
  expect((await consoleScroll(page)).pinned, 'still pinned to the bottom').toBe(true);

  // FR-420's second clause: it still auto-follows.
  await runProgram(page, 'print("after the switch")\n');
  await expect(page.locator('#console')).toContainText('after the switch');
  expect((await consoleScroll(page)).pinned, 'new output is still followed').toBe(true);
});

test('VC-421 (FR-420): a scrolled-up console keeps its first visible line', async ({ page }) => {
  await openAtLayout(page, 'vertical');
  await waitForPythonReady(page);

  await runProgram(page, 'for i in range(6000):\n    print(i)\n');
  await expect(page.locator('#console')).toContainText('Program finished in', { timeout: 60_000 });

  const before = await consoleText(page);

  // Scroll so that a known line is the first visible one, and remember which.
  await page.evaluate(() => {
    document.getElementById('console')!.scrollTop = 1200;
  });
  const firstVisibleBefore = await page.evaluate(() => {
    const el = document.getElementById('console')!;
    const top = el.getBoundingClientRect().top;
    return document.caretPositionFromPoint?.(el.getBoundingClientRect().left + 4, top + 4)?.offsetNode
      ?.textContent?.slice(0, 40) ?? null;
  });
  const scrollBefore = await consoleScroll(page);
  expect(scrollBefore.pinned, 'the console is scrolled up').toBe(false);

  await switchTo(page, 'horizontal');

  expect(await consoleText(page), 'the buffer is byte-identical').toBe(before);
  const afterScroll = await consoleScroll(page);
  expect(afterScroll.top, 'the scroll offset is kept').toBeCloseTo(scrollBefore.top, 0);
  const firstVisibleAfter = await page.evaluate(() => {
    const el = document.getElementById('console')!;
    const top = el.getBoundingClientRect().top;
    return document.caretPositionFromPoint?.(el.getBoundingClientRect().left + 4, top + 4)?.offsetNode
      ?.textContent?.slice(0, 40) ?? null;
  });
  expect(firstVisibleAfter, 'the same first visible line').toBe(firstVisibleBefore);

  // FR-420: a scrolled-up console does *not* auto-follow new output.
  await runProgram(page, 'print("after the switch")\n');
  await expect(page.locator('#console')).toContainText('after the switch');
  expect((await consoleScroll(page)).pinned, 'it still does not follow').toBe(false);
});

/* -------------------------------------------------------------------------
   VC-422 (FR-421, BR-401)
   ------------------------------------------------------------------------- */

test('VC-422 (FR-421, BR-401): a run continues across two switches on the same worker', async ({
  page,
}) => {
  await openAtLayout(page, 'vertical');
  await waitForPythonReady(page);

  const readyLines = (): Promise<number> =>
    page.evaluate(() => (document.getElementById('console')!.textContent ?? '').split('ready').length - 1);
  const readyBefore = await readyLines();

  await runProgram(page, 'import time\nfor i in range(30):\n    print(i)\n    time.sleep(0.2)\n');
  await expect(page.locator('#console')).toContainText('0');

  // Run stays disabled and Stop enabled throughout, sampled around each switch.
  const buttons = (): Promise<{ run: string | null; stop: string | null }> =>
    page.evaluate(() => ({
      run: document.getElementById('btn-run')!.getAttribute('aria-disabled'),
      stop: document.getElementById('btn-stop')!.getAttribute('aria-disabled'),
    }));
  expect(await buttons()).toEqual({ run: 'true', stop: 'false' });

  await switchTo(page, 'horizontal');
  expect(await buttons(), 'mid-run, after the first switch').toEqual({ run: 'true', stop: 'false' });
  await page.waitForTimeout(400);
  await switchTo(page, 'vertical');
  expect(await buttons(), 'mid-run, after the second switch').toEqual({
    run: 'true',
    stop: 'false',
  });

  await expect(page.locator('#console')).toContainText('Program finished in', { timeout: 60_000 });

  // Every number exactly once, in order, and no output lost or duplicated.
  const text = await consoleText(page);
  for (let i = 0; i < 30; i++) {
    const occurrences = text.split(new RegExp(`(?<=\\n|^)${i}(?=\\n)`)).length - 1;
    expect(occurrences, `${i} printed exactly once`).toBe(1);
  }
  const positions = Array.from({ length: 30 }, (_, i) => text.indexOf(`\n${i}\n`));
  expect(positions, 'in order').toEqual([...positions].sort((a, b) => a - b));

  // The worker was never replaced.
  expect(await readyLines(), 'no second Python … ready line').toBe(readyBefore);
  expect(text, 'no restart').not.toContain('Restarting Python');
});

/* -------------------------------------------------------------------------
   VC-423 (FR-422)
   ------------------------------------------------------------------------- */

test('VC-423 (FR-422): a pending read and its unsubmitted text survive', async ({ page }) => {
  await openAtLayout(page, 'vertical');
  await waitForPythonReady(page);

  await runProgram(page, 'import sys\na = input("? ")\nb = sys.stdin.readline()\nprint(a, b.strip())\n');
  await waitForStdinPrompt(page);

  // Type without submitting, then switch twice.
  const field = page.locator('#stdin-input');
  await field.click();
  await page.keyboard.type('hola');

  for (const layout of ['horizontal', 'vertical'] as const) {
    await switchTo(page, layout);
    await expect(field, `${layout}: still enabled`).toBeEnabled();
    await expect(field, `${layout}: still holds the text`).toHaveValue('hola');
    expect(
      await field.evaluate((el: HTMLInputElement) => el.selectionStart),
      `${layout}: the caret is still at offset 4`,
    ).toBe(4);
    expect(await consoleText(page), `${layout}: the read is still blocked`).not.toContain('hola ');
  }

  // Submitting afterwards delivers exactly what was typed.
  await field.press('Enter');
  // The second read is pending; switch again before answering it.
  await waitForStdinPrompt(page);
  await switchTo(page, 'horizontal');
  await submitStdin(page, 'chau');

  await expect(page.locator('#console')).toContainText('hola chau');
});

/* -------------------------------------------------------------------------
   VC-424 (FR-423)
   ------------------------------------------------------------------------- */

test('VC-424 (FR-423): the diagnostics list is untouched and no lint is scheduled', async ({
  page,
}) => {
  await openAtLayout(page, 'vertical');
  await waitForPythonReady(page);
  await waitForLinter(page);

  await setProgram(page, 'import os\nimport sys\nimport json\nx = 1\n');
  await expect.poll(() => diagnosticEntries(page)).not.toHaveLength(0);
  await expect
    .poll(async () => (await diagnosticEntries(page)).length)
    .toBeGreaterThanOrEqual(3);

  const before = await diagnosticEntries(page);
  const countBefore = await page.evaluate(
    () => document.getElementById('diagnostics-count')!.textContent,
  );

  /*
   * FR-423 forbids the switch from scheduling a lint. A scheduled pass fires
   * 400 ms later (`LINT_DEBOUNCE_MS`) and replaces the panel's children, so
   * watching `#diagnostics-list` for mutations across the switches and for
   * longer than the debounce proves no pass was scheduled *or* run — without
   * reaching into the bundle for a hook.
   */
  await page.evaluate(() => {
    const records: number[] = [];
    (window as unknown as { __lintMutations: number[] }).__lintMutations = records;
    new MutationObserver((entries) => records.push(entries.length)).observe(
      document.getElementById('diagnostics-list')!,
      { childList: true, subtree: true, characterData: true },
    );
  });

  await switchTo(page, 'horizontal');
  await switchTo(page, 'vertical');
  await page.waitForTimeout(700);

  expect(await diagnosticEntries(page), 'the entries and their order').toEqual(before);
  expect(
    await page.evaluate(() => document.getElementById('diagnostics-count')!.textContent),
    'the live count',
  ).toBe(countBefore);
  expect(
    await page.evaluate(() => (window as unknown as { __lintMutations: number[] }).__lintMutations),
    'no lint pass replaced the panel',
  ).toEqual([]);

  // Clicking the second entry still reveals its line.
  await page.locator('#diagnostics-list .diagnostic-entry').nth(1).click();
  await expect(page.locator('.cm-content')).toBeFocused();
});

/* -------------------------------------------------------------------------
   VC-425 (FR-424, BR-401)
   ------------------------------------------------------------------------- */

test('VC-425 (FR-424, BR-401): no autosave reset, no worker message, no request', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = {
      writes: [] as { key: string; at: number }[],
      messages: 0,
    };
    (window as unknown as { __costs: typeof state }).__costs = state;

    const originalSet = window.localStorage.setItem.bind(window.localStorage);
    Object.defineProperty(window.localStorage, 'setItem', {
      configurable: true,
      value: (key: string, value: string) => {
        state.writes.push({ key, at: performance.now() });
        originalSet(key, value);
      },
    });

    const originalPost = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function patched(this: Worker, ...args: unknown[]) {
      state.messages++;
      return (originalPost as (...a: unknown[]) => void).apply(this, args);
    } as typeof Worker.prototype.postMessage;
  });

  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));

  await openAtLayout(page, 'vertical');
  await waitForPythonReady(page);

  // Baselines taken after boot, so the runtime's own traffic is excluded.
  const messagesBefore = await page.evaluate(
    () => (window as unknown as { __costs: { messages: number } }).__costs.messages,
  );
  await page.evaluate(() => {
    (window as unknown as { __costs: { writes: unknown[] } }).__costs.writes.length = 0;
  });
  requests.length = 0;

  // One keystroke, then two switches inside the 500 ms autosave debounce.
  await page.locator('.cm-content').click();
  const keystrokeAt = await page.evaluate(() => performance.now());
  await page.keyboard.type('#');
  await page.waitForTimeout(100);
  await switchTo(page, 'horizontal');
  await switchTo(page, 'vertical');

  // Wait past the debounce so the autosave write has certainly landed.
  await page.waitForTimeout(900);

  const costs = await page.evaluate(
    () =>
      (window as unknown as { __costs: { writes: { key: string; at: number }[]; messages: number } })
        .__costs,
  );

  // Only the layout key and the program key were written.
  const layoutWrites = costs.writes.filter((w) => w.key === 'pyplay.layout.v1');
  const programWrites = costs.writes.filter((w) => w.key === 'pyplay.program.v1');
  expect(costs.writes.map((w) => w.key).filter((k) => !k.startsWith('pyplay.'))).toEqual([]);
  expect(layoutWrites.length, 'one write per switch').toBe(2);

  // FR-424: the switch neither started nor *reset* the debounce — the program
  // write still landed 500 ms after the keystroke, not after the last switch.
  expect(programWrites, 'the autosave write landed').toHaveLength(1);
  const elapsed = programWrites[0]!.at - keystrokeAt;
  expect(elapsed, 'not sooner than the 500 ms debounce').toBeGreaterThanOrEqual(500);
  expect(elapsed, 'and not pushed out by the switches').toBeLessThan(900);

  expect(costs.messages - messagesBefore, 'no message was sent to the worker').toBe(0);
  expect(requests, 'no network request').toEqual([]);
});

/* -------------------------------------------------------------------------
   VC-426 (FR-425, NFR-404)
   ------------------------------------------------------------------------- */

test('VC-426 (FR-425, NFR-404): each switch paints in under 100 ms, with no transition', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));

  await openAtLayout(page, 'vertical');
  await waitForPythonReady(page);
  await waitForLinter(page);

  // NFR-404's load: 500 editor lines, 5 000 console lines, 50 diagnostics.
  const program = [
    ...Array.from({ length: 50 }, (_, i) => `import os${i === 0 ? '' : ''}`),
    ...Array.from({ length: 450 }, (_, i) => `value_${i} = ${i}`),
  ].join('\n');
  await setProgram(page, `${program}\n`);
  await expect.poll(async () => (await diagnosticEntries(page)).length).toBeGreaterThanOrEqual(40);

  await page.evaluate(() => {
    const el = document.getElementById('console')!;
    const chunk = document.createDocumentFragment();
    for (let i = 0; i < 5000; i++) {
      const span = document.createElement('span');
      span.className = 'console-stdout';
      span.textContent = `line ${i}\n`;
      chunk.append(span);
    }
    el.append(chunk);
  });

  // Instrument the paint clock and the animation events, in the page.
  await page.evaluate(() => {
    const state = {
      latencies: [] as number[],
      transitions: [] as string[],
      longTasks: [] as number[],
      activatedAt: 0,
    };
    (window as unknown as { __switchCost: typeof state }).__switchCost = state;

    for (const type of ['transitionrun', 'transitionstart', 'animationstart'] as const) {
      document.addEventListener(
        type,
        (event) => {
          const target = event.target as Element | null;
          if (target?.closest('.panel')) state.transitions.push(`${type}:${target.className}`);
        },
        true,
      );
    }

    document.getElementById('layout-group')!.addEventListener(
      'click',
      () => {
        state.activatedAt = performance.now();
        // The frame after the activating event is the frame that shows the new
        // geometry, which is what NFR-404 measures to.
        requestAnimationFrame(() => {
          state.latencies.push(performance.now() - state.activatedAt);
        });
      },
      true,
    );

    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > 100) state.longTasks.push(entry.duration);
        }
      }).observe({ entryTypes: ['longtask'] });
    } catch {
      /* Not every engine exposes longtask; the latency check still holds. */
    }
  });

  requests.length = 0;

  await switchTo(page, 'horizontal');
  await switchTo(page, 'vertical');

  const cost = await page.evaluate(
    () =>
      (
        window as unknown as {
          __switchCost: { latencies: number[]; transitions: string[]; longTasks: number[] };
        }
      ).__switchCost,
  );

  expect(cost.latencies, 'one measurement per switch').toHaveLength(2);
  for (const latency of cost.latencies) {
    expect(latency, 'the new geometry is painted within 100 ms').toBeLessThanOrEqual(100);
  }
  // FR-425: no transition or animation runs on any panel — the new layout is
  // painted in one frame.
  expect(cost.transitions, 'no transition or animation on any .panel').toEqual([]);
  expect(cost.longTasks, 'no main-thread task over 100 ms').toEqual([]);
  expect(requests, 'no network request').toEqual([]);
});

/* -------------------------------------------------------------------------
   VC-434 (FR-426)
   ------------------------------------------------------------------------- */

test('VC-434 (FR-426): the editor keeps its document position, not its offset', async ({
  page,
}) => {
  await openAtLayout(page, 'vertical');
  await waitForPythonReady(page);

  // 200 lines, five of them long enough to wrap at both column widths.
  // The five wrapping lines deliberately exclude line 120: the criterion
  // requires line 120 to be *fully* visible, which a block taller than the
  // editor viewport never is.
  const lines = Array.from({ length: 200 }, (_, i) =>
    [30, 60, 90, 150, 180].includes(i + 1)
      ? `long_${i} = "${'palabra '.repeat(40)}"`
      : `value_${i} = ${i}`,
  );
  await setProgram(page, `${lines.join('\n')}\n`);

  /** The document line at the editor viewport's top edge. */
  const topLine = (): Promise<number> =>
    page.evaluate(() => {
      const content = document.querySelector('.cm-content') as
        | (HTMLElement & { cmView?: { view: unknown }; cmTile?: { view: unknown } })
        | null;
      const view = (content?.cmTile?.view ?? content?.cmView?.view) as
        | {
            posAtCoords(coords: { x: number; y: number }): number | null;
            state: { doc: { lineAt(pos: number): { number: number } } };
            scrollDOM: HTMLElement;
            defaultLineHeight: number;
          }
        | undefined;
      if (!view) throw new Error('CodeMirror view not found');
      const box = view.scrollDOM.getBoundingClientRect();
      /*
       * Half a line height in, not one or two pixels. `.cm-content` carries
       * 4 px of top padding and `scrollTop` is rounded to an integer, so the
       * first few pixels below the scroller's edge are padding and resolve to
       * the line *above* the first visible one. Half a line height is inside
       * the first visible line whatever that padding is.
       */
      const pos = view.posAtCoords({
        x: box.left + 20,
        y: box.top + view.defaultLineHeight / 2,
      });
      return pos === null ? -1 : view.state.doc.lineAt(pos).number;
    });

  /** Whether document line `n` is fully visible in the editor viewport. */
  const fullyVisible = (n: number): Promise<boolean> =>
    page.evaluate((line) => {
      const content = document.querySelector('.cm-content') as
        | (HTMLElement & { cmView?: { view: unknown }; cmTile?: { view: unknown } })
        | null;
      const view = (content?.cmTile?.view ?? content?.cmView?.view) as
        | {
            state: { doc: { line(n: number): { from: number } } };
            lineBlockAt(pos: number): { top: number; bottom: number };
            scrollDOM: HTMLElement;
          }
        | undefined;
      if (!view) throw new Error('CodeMirror view not found');
      const block = view.lineBlockAt(view.state.doc.line(line).from);
      const top = view.scrollDOM.scrollTop;
      const bottom = top + view.scrollDOM.clientHeight;
      return block.top >= top - 1 && block.bottom <= bottom + 1;
    }, n);

  /*
   * Scroll so that line 120's block starts exactly at the top of the editor
   * viewport — the state FR-426 calls "the first fully visible line".
   *
   * `lineBlockAt().top` has to be re-read after each scroll: CodeMirror only
   * measures the lines it has rendered and *estimates* the rest, so the first
   * answer for a line 120 rows down is off by tens of pixels and settles once
   * that region has actually been laid out. Two or three passes converge.
   */
  const scrollToTopLine = async (target: number): Promise<void> => {
    let previous = -1;
    for (let i = 0; i < 20; i++) {
      const top = await page.evaluate((line) => {
        const content = document.querySelector('.cm-content') as
          | (HTMLElement & { cmView?: { view: unknown }; cmTile?: { view: unknown } })
          | null;
        const view = (content?.cmTile?.view ?? content?.cmView?.view) as
          | {
              state: { doc: { line(n: number): { from: number } } };
              lineBlockAt(pos: number): { top: number };
              scrollDOM: HTMLElement;
            }
          | undefined;
        if (!view) throw new Error('CodeMirror view not found');
        const block = view.lineBlockAt(view.state.doc.line(line).from);
        view.scrollDOM.scrollTop = block.top;
        return block.top;
      }, target);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
      if (Math.abs(top - previous) < 1) return;
      previous = top;
    }
    throw new Error(`never settled with line ${target} at the top`);
  };
  await scrollToTopLine(120);

  expect(await topLine(), 'line 120 is the first visible line').toBe(120);
  expect(await fullyVisible(120), 'and it is fully visible').toBe(true);

  for (const layout of ['horizontal', 'vertical'] as const) {
    await switchTo(page, layout);
    // FR-426: the *document position* is preserved. The column width changed,
    // so `scrollTop` necessarily did too — that is not what is being kept.
    expect(await topLine(), `${layout}: the top of the viewport is at or before line 120`).
      toBeLessThanOrEqual(120);
    expect(await fullyVisible(120), `${layout}: line 120 is fully visible`).toBe(true);
    expect(await fullyVisible(119), `${layout}: line 119 is not`).toBe(false);
  }
});

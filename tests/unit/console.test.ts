import { beforeEach, describe, expect, it } from 'vitest';
import { ConsoleView } from '../../src/console';

let host: HTMLElement;
let view: ConsoleView;

beforeEach(() => {
  document.body.innerHTML = '<div id="console"></div>';
  host = document.getElementById('console') as HTMLElement;
  view = new ConsoleView(host);
});

describe('ConsoleView (FR-019, FR-020, FR-021)', () => {
  it('preserves the exact characters of a stdout chunk', () => {
    view.stdout('a\tb\n');
    view.stdout('  indented\n');
    expect(view.text).toBe('a\tb\n  indented\n');
  });

  it('joins partial stdout writes on the same line', () => {
    view.stdout('he');
    view.stdout('llo\n');
    expect(view.text).toBe('hello\n');
  });

  it('prefixes every stderr chunk with the literal marker', () => {
    view.stderr('boom\n');
    view.stderr('again\n');
    expect(view.text).toBe('[stderr] boom\n[stderr] again\n');
  });

  it('renders stderr in a class distinct from stdout, so the cue is not colour-only', () => {
    view.stdout('out\n');
    view.stderr('err\n');
    // Painting is batched onto an animation frame (NFR-009), so ask for it.
    view.flush();
    expect(host.querySelectorAll('.console-stdout')).toHaveLength(1);
    expect(host.querySelectorAll('.console-stderr')).toHaveLength(1);
  });

  it('starts a page-generated line on a fresh line after a partial write', () => {
    view.stdout('no newline');
    view.meta('─── Run at 10:00:00 ───');
    expect(view.text).toBe('no newline\n─── Run at 10:00:00 ───\n');
  });

  it('does not insert a blank line when the previous chunk ended a line', () => {
    view.stdout('done\n');
    view.meta('Program finished in 0.01 s');
    expect(view.text).toBe('done\nProgram finished in 0.01 s\n');
  });

  it('clears every chunk (FR-026)', () => {
    view.stdout('x\n');
    view.flush();
    view.clear();
    expect(view.text).toBe('');
    expect(host.children).toHaveLength(0);
  });

  it('reports empty until the first retained character (FR-1505)', () => {
    expect(view.empty).toBe(true);
    view.stdout('');
    expect(view.empty).toBe(true);
    view.stdout('x');
    expect(view.empty).toBe(false);
    view.clear();
    expect(view.empty).toBe(true);
  });

  it('selects the displayed transcript (FR-1504)', () => {
    view.stdout('café\n你好\n');
    view.selectAll();
    expect(window.getSelection()?.toString()).toBe('café\n你好\n');
  });

  it('notifies only when emptiness changes (FR-1505)', () => {
    const seen: boolean[] = [];
    const watched = new ConsoleView(host, () => seen.push(watched.empty));
    watched.stdout('x\n');
    watched.stdout('y\n');
    watched.clear();
    watched.clear();
    expect(seen).toEqual([false, true]);
  });
});

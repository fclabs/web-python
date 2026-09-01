import './styles.css';
import { Autosaver } from './autosave';
import { writeClipboard } from './clipboard';
import { createEditor, selectAll, setDoc } from './editor';
import { Notices } from './notices';
import { STARTER_PROGRAM } from './starter';
import { getLocalStorage, loadProgram, saveProgram } from './storage';

const AUTOSAVE_UNAVAILABLE = 'Autosave unavailable — your code will not survive a reload';
const COPY_FAILED = "Couldn't copy — select the code and press Ctrl/Cmd+C";
const RESET_CONFIRM = 'Discard your code?';
const COPIED_MS = 2000;

function need<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

function boot(): void {
  const notices = new Notices(need('notices'));
  const storage = getLocalStorage();

  // FR-003 / FR-004
  const initialDoc = loadProgram(storage);

  const autosaver = new Autosaver(
    (code) => saveProgram(storage, code),
    () => notices.show(AUTOSAVE_UNAVAILABLE),
  );

  const view = createEditor({
    parent: need('editor'),
    initialDoc,
    onChange: (doc) => autosaver.schedule(doc),
  });

  // FR-050: flush any pending write synchronously when the page goes away.
  const flush = () => autosaver.flush();
  window.addEventListener('pagehide', flush);
  window.addEventListener('beforeunload', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });

  // FR-006 / FR-007: Copy code.
  const copyBtn = need<HTMLButtonElement>('btn-copy');
  let copyTimer: ReturnType<typeof setTimeout> | null = null;
  copyBtn.addEventListener('click', () => {
    void (async () => {
      const code = view.state.doc.toString();
      const ok = await writeClipboard(code);
      if (ok) {
        copyBtn.textContent = 'Copied';
        copyBtn.dataset.state = 'copied';
        if (copyTimer !== null) clearTimeout(copyTimer);
        copyTimer = setTimeout(() => {
          copyBtn.textContent = 'Copy code';
          delete copyBtn.dataset.state;
          copyTimer = null;
        }, COPIED_MS);
      } else {
        notices.show(COPY_FAILED);
        selectAll(view);
      }
    })();
  });

  // FR-010: Reset.
  need<HTMLButtonElement>('btn-reset').addEventListener('click', () => {
    if (!window.confirm(RESET_CONFIRM)) return;
    setDoc(view, STARTER_PROGRAM);
    autosaver.schedule(STARTER_PROGRAM);
    autosaver.flush();
    view.focus();
  });

  // FR-011: the editor is usable immediately; runtime-dependent controls stay
  // disabled until later iterations wire up Pyodide.
  document.documentElement.dataset.shellReady = 'true';
}

boot();

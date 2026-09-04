# Spec 06 — Offline Python Name Completion

| Field | Value |
|---|---|
| Version | 1.0.0 |
| Last Updated | 2026-09-04 |
| Status | IMPLEMENTED — manual VC-624 sign-off pending |
| Parent spec | `specs/01-static-python-web-frozen.md` |

This child spec uses the `6xx` identifier range. It adds lightweight,
IntelliSense-style name completion to the active editable file in the local
workspace.

## Purpose and scope

Completion helps students discover and finish names without a server, account,
language server, or running Python interpreter. It is syntactic only: names
defined in the current file, Python built-ins, and Python 3.13 hard and soft
keywords. Imports/modules, member completion after `.`, signatures, type
inference, hover documentation, and snippets are deliberately excluded.

The maintained CodeMirror autocomplete UI supplies the listbox, selection, and
keyboard behavior. The source is compiled into the existing main bundle and is
always enabled. It neither reads from nor writes to the Pyodide/Ruff workers.

## Functional requirements

| ID | Requirement |
|---|---|
| **FR-601** | After an identifier prefix, completion offers visible current-scope names (including Unicode Python identifiers) and Python built-ins, preserving their type metadata. |
| **FR-602** | Completion contains every `keyword.kwlist` and `keyword.softkwlist` entry shipped by CPython 3.13. |
| **FR-603** | Labels are unique. When a current-scope name collides with a global, the local completion and its type win. |
| **FR-604** | Accepting any option inserts exactly its label. No option exposes a snippet, placeholder, signature, detail, hover information, or documentation. |
| **FR-605** | Completion opens automatically 100 ms after typing an identifier prefix and explicitly with `Ctrl+Space`, including on a blank line; its best match is initially selected. |
| **FR-606** | `ArrowUp`/`ArrowDown` and page keys navigate, `Enter`, `Tab`, or pointer accepts, and `Escape` dismisses. With no completion open, `Tab` continues page traversal; it never indents. |
| **FR-607** | Completion returns no result in comments, strings, formatted strings (including replacement fields), or property/member positions after `.`. |
| **FR-608** | Acceptance is one normal CodeMirror transaction: one Undo reverses it and existing autosave and lint observe the resulting document. |
| **FR-609** | Completion stays usable while Python/Ruff load, if either fails, during execution, and after an offline reload. A running program continues against the full workspace and entry-file snapshot captured when Run was activated. |

## Business rules

| ID | Rule |
|---|---|
| **BR-601** | The feature is always enabled; it has no instructor/student toggle or persisted preference. |
| **BR-602** | All processing is local. Completion sends no source text, creates no request, adds no worker message, storage key, cookie, database, or API call. |
| **BR-603** | Suggestions come only from the active file plus fixed globals; they never inspect sibling workspace files or resolve imports. Python remains pinned to the project's 3.13 runtime. Semantic cross-file completion requires a future analysis-worker spec. |
| **BR-604** | `@codemirror/autocomplete` is a direct dependency at the already locked 6.20.x version and completion remains in the existing main bundle. |

## Non-functional requirements

| ID | Requirement | Threshold |
|---|---|---|
| **NFR-601** | Popup layout at 375 × 667. | No horizontal page overflow or viewport clipping; the list scrolls vertically. |
| **NFR-602** | Popup text and non-text contrast in light/dark palettes. | Text ≥ 4.5:1; border and selected fill ≥ 3:1. |
| **NFR-603** | Automatic completion on a 500-line file. | Painted ≤ 200 ms after the final prefix keystroke; no main-thread task > 100 ms. |
| **NFR-604** | Privacy and offline delivery. | Zero completion-triggered requests; total compressed cold load remains ≤ 15 MB; no new emitted asset URL. |
| **NFR-605** | Accessibility. | The popup exposes one `listbox`, `option` children, and exactly one initially selected option. |
| **NFR-606** | Bundle cost of the feature itself, over its `3efb8be` branch point. | ≤ 9 KB gzipped app-payload delta. Measured at ship: **7.49 KiB**. |

## Python 3.13 keyword data

Hard keywords: `False`, `None`, `True`, `and`, `as`, `assert`, `async`,
`await`, `break`, `class`, `continue`, `def`, `del`, `elif`, `else`, `except`,
`finally`, `for`, `from`, `global`, `if`, `import`, `in`, `is`, `lambda`,
`nonlocal`, `not`, `or`, `pass`, `raise`, `return`, `try`, `while`, `with`,
`yield`.

Soft keywords: `_`, `case`, `match`, `type`.

The normative source is [CPython 3.13 `Lib/keyword.py`](https://github.com/python/cpython/blob/3.13/Lib/keyword.py).

## Verification criteria

| ID | Verification |
|---|---|
| **VC-601 – VC-606** | Unit-test merged locals, Unicode, built-ins, both keyword lists, deduplication/local precedence, literal application, suppression, and automatic-prefix gating. |
| **VC-607** | In a browser, verify automatic `pri → print`, a local parameter, `ret → return`, and explicit blank-line completion with initial selection. |
| **VC-608** | Verify arrows, page navigation, `Enter`, pointer, `Escape`, `Tab` acceptance while open, and unchanged `Tab` traversal while closed. |
| **VC-609** | Accept `for`; the document is exactly `for` and has no snippet field or placeholder. |
| **VC-610** | Explicit completion produces no popup in a comment, string, formatted string, or after `.`. |
| **VC-611** | One Undo restores the prefix; Redo, autosave, and lint observe the accepted text. |
| **VC-612 – VC-614** | Verify completion during Python loading, after Python failure, during a run without changing its snapshot, and after Ruff failure. |
| **VC-619** | At 375 × 667 the popup stays within the viewport, the page does not overflow, and listbox/selected-option ARIA state is correct. |
| **VC-621** | Record requests around explicit activation and acceptance; none occur and no source is transmitted. |
| **VC-622** | Extend the existing rendered light/dark contrast audit to ordinary and selected completion options, border, and selected fill. |
| **VC-623** | On 500 lines, measure final-keystroke-to-paint ≤ 200 ms, longest task ≤ 100 ms, zero requests, and (NFR-606) an app-size delta ≤ 9 KB gzipped against the `3efb8be` branch point. Keep spec-01's ≤ 15 MB cold-load check and spec-03 VC-326's unchanged asset-set/manifest-count checks. |
| **VC-624** | Manually smoke-test automatic and explicit completion, navigation, acceptance, dismissal, Tab, and Run in the institution's real LockDown Browser exam flow on every supported student platform. |

## LockDown Browser deployment note

Respondus desktop clients are Chromium-based, but ordinary Chromium automation
does not establish compatibility with a particular institutional policy. Before
using the playground in an exam, test with a real student account and the exact
exam configuration. When the playground is reached through an exam link, its
origin must be included in the exam's permitted external domains. See the
[Respondus requirements](https://web.respondus.com/k12/lockdownbrowser/resources/)
and [external-domain guidance](https://support.respondus.com/hc/en-us/articles/4409604275867-Accessing-external-web-domains-in-LockDown-Browser).

## Manual verification status

VC-624 cannot be automated by this repository and remains a release sign-off
item. It requires institutional credentials, policy configuration, and each
supported student platform.

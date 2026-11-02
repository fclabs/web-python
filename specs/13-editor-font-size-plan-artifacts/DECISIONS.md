# DECISIONS — Editor Font Size (spec 13)

## D-001: How VC-1317 extracts the inline allow-list (Iteration 1)
Context: BR-1304 requires a unit test proving the `index.html` allow-list equals `FONT_SIZES` and that the inline
and module validators agree. The inline script is an IIFE with no exports.
Decision: the inline script declares its allow-list as a literal `var ALLOWED = ['12', ...]`. The test reads
`index.html`, picks the `<script>` containing `pyplay.fontsize.v1`, parses the `ALLOWED = [...]` literal with a
regex and compares to `FONT_SIZES.map(String)`. For validator agreement it executes the real script text via
`new Function('document','localStorage', script)` against stubs, for "0"…"100", `016`, `16px`, ` 16`, `""`.
Rejected: a regex-only comparison of validators (would not test the actual inline logic); a shared generated
file (inline script must stay self-contained and render-blocking, no build step).
Consequences: renaming `ALLOWED` or restructuring the script requires updating the test's regex; the inline
script must keep using `document`/`localStorage` as free identifiers.

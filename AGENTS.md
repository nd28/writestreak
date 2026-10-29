# WriteStreak — Agent Guide

## Project Overview
WriteStreak is a gamified terminal writing app built with OpenTUI (imperative API, not React/Ink) and Bun runtime. Users earn XP, level up, build streaks, and track writing sessions. Data is stored in MessagePack binary format.

- **Language:** TypeScript (ESNext modules, no JSX)
- **Runtime:** Bun (`#!/usr/bin/env bun` shebang in `src/index.ts`)
- **UI Framework:** `@opentui/core` (imperative `BoxRenderable` / `TextRenderable` / `TextareaRenderable`)
- **Storage:** `@msgpack/msgpack` binary format (`writestreak.bin`)
- **Tests:** Vitest (186 tests across scoring, levels, msgpack + draft, history filter, share formats, help keymap, chord collisions, CLI)
- **Build:** `npm run build` → `tsc` → `dist/`
- **Dev:** `bun src/index.ts` or `npm run dev`
- **Global CLI:** `writestreak` / `ws` (linked via `bin` in package.json)

## Mandatory Agent Rules

Whenever you modify the app code, you MUST do all of the following:

### 1. Bump the version
- Run `bun scripts/bump.ts [patch|minor|major]` to bump the version in package.json:
  - **patch**: bug fixes, small tweaks (e.g. `1.0.0` → `1.0.1`)
  - **minor**: new features, UI additions (e.g. `1.0.0` → `1.1.0`)
  - **major**: breaking changes or major rewrites (e.g. `1.0.0` → `2.0.0`)
- The version is imported into the app via `import pkg from "../package.json"` in `src/App.ts` and displayed as `v{VERSION}` next to the WRITESTREAK title in the banner.

### 2. Update this file's Project State section
- Update the "Current State" subsection to reflect what changed.
- Add/remove feature bullets so the next session agent knows exactly what exists.
- Update "Known Issues" if any new bugs appear or old ones are resolved.

### 3. Verify before finishing
- Run `npm run build` — must compile with zero errors.
- Run `npm test -- --run` — all tests must pass.
- Do NOT commit unless the user explicitly asks.

## Architecture

```
src/
  index.ts          Entry point. Parses argv: a CLI subcommand runs headless and exits;
                    anything else lazily imports App.js to start the TUI.
  App.ts            Main app: renderer setup, UI build, key bindings, all modes
  types.ts          TS interfaces: PlayerStats, WritingSession, ScorePopup, LevelThreshold
  game/
    scoring.ts      countWords, calculateXp (2 XP/word base, streak multiplier, milestone bonuses), updateStreak
    levels.ts       12-level progression table (Novice Scribe → God of Words)
  storage/
    msgpack.ts      exportToBin / importFromBin / getDefaultStats (MessagePack binary)
  history/
    filter.ts       filterSessions + FilterInput/FilterResult/PAGE_SIZE/FILTER_ORDER (pure, no UI)
    filter.test.ts  Vitest unit tests
  share/
    format.ts       formatSession (md/txt/html) + shareFilename/escapeHtml/formatDateTime/
                    formatDuration/groupNumber (pure, no UI, no fs)
    format.test.ts  Vitest unit tests
  help/
    keymap.ts       HELP_SECTIONS — single source of truth for the Ctrl+K help panel (pure)
    keymap.test.ts  Structure checks + a guard that every Ctrl chord bound in App.ts is documented
    chords.test.ts  Guards against Ctrl chords that collide with reserved control bytes
  cli/
    args.ts         parseArgs — argv to a CliCommand union (pure)
    render.ts       renderList/renderShow/renderStats/resolveTarget/helpText (pure)
    run.ts          Thin IO: resolves the save path, reads the .bin, returns {stdout, stderr, code}
    args.test.ts    Vitest unit tests
    render.test.ts  Vitest unit tests
```

### Key Implementation Notes
- `TextareaRenderable` is used for the editor (NOT `InputRenderable`, which is single-line and has a 1000-char maxLength default). TextareaRenderable supports multiline, Enter inserts newlines.
- TextareaRenderable uses `onContentChange` callback (not `"input"` event), `.setText()` / `.plainText` (not `.value`).
- UI uses persistent renderable instances (created once in `buildUI()`), then `.content` is updated in-place to avoid redraw glitches.
- Mode label (modeBox) is clickable — `onMouseDown: () => cycleMode()` cycles writing → history → insights → writing.
- Color button cycles 3 pastel colors: Rose (#E8A0BF), Sky (#A8D8EA), Dim (#C8C8C8). Label shows color name.
- Color selection persists to save file.
- Writing pad is capped: `editorWrapper` uses `width: "100%"` + `maxWidth: 100` + `alignSelf: "center"`.
- **Do not give the editor a concrete `width: 100`.** `alignSelf: "center"` makes a box content-sized, so a child's `width: "100%"` resolves against an indefinite parent and collapses — that is why an earlier attempt was reverted in 26f915c. The fix is a *definite* wrapper width (`width: "100%"` + `maxWidth: 100`), after which the textarea's `width: "100%"` reflows correctly at every terminal size, including the very first render.
- Rows that hold several fixed labels (banner stat blocks, editor stats row) use `flexWrap: "wrap"` so they reflow onto a second line instead of mid-word wrapping when the terminal is narrow.
- Sharing writes UTF-8 via `writeFileSync`; all formatting lives in the pure `src/share/format.ts` so it is unit-testable without a renderer. HTML output escapes every user string and links no external assets.
- **Ctrl+<letter> is the byte `letter - 0x60`, and some of those bytes are already keys.** Ctrl+H is 0x08 (backspace) and Ctrl+I is 0x09 (tab), so both parse with `ctrl: false` and a different `name` — `key.ctrl && key.name === "h"` reads correctly but never fires. Ctrl+H is matched by its raw byte instead (`key.sequence === "\b"`; the real Backspace key sends 0x7f), and Ctrl+I has the alias Ctrl+L. Before binding a new chord, check it against `RESERVED_CONTROL_BYTES` in `src/help/chords.test.ts` — 0x08, 0x09, 0x0a, 0x0d and 0x1b are all taken (Ctrl+J and Ctrl+M are Enter/newline).
- **Autosave owns the draft.** Typing only mutates `stats` in memory. `scheduleDraftSave()` debounces a write 1500 ms after the last keystroke, `flushDraft()` forces one, and `shutdown()` flushes — so Ctrl+C, a signal or a closed terminal cannot lose work. `stats.draft` is the unsaved editor buffer; `saveSession()` and `newSession()` clear it. Never mutate `currentText` without arranging a flush.
- **Timers must not outlive the renderer.** Destroying the renderer frees each renderable's TextBuffer, so a `setTimeout` that later writes to `.content` crashes with `TextBuffer is destroyed`. Every deferred UI write goes through `later()` (cancelled by `shutdown()`, which also runs on the renderer's `destroy` event, covering Ctrl+C). Never call bare `setTimeout` to touch a renderable.
- The share prompt blurs the editor while it waits for a format key, so `m`/`t`/`h` are not typed into the draft.
- `src/index.ts` must not import `App.js` at the top level — App.ts starts the renderer as an import side effect, which would make every CLI command open the TUI.
- Banner is full-width bordered box with 5 stat blocks: XP, WORDS, STREAK, SESSIONS, LONGEST.

## Current State

**Version:** 1.9.0

### Features Implemented
- Full OpenTUI imperative UI (no React/Ink)
- Gamification: XP (2/word base + streak multiplier + milestone bonuses), 12 levels, daily streaks
- Banner scoreboard: full-width bordered box with 5 stat blocks (XP, WORDS, STREAK, SESSIONS, LONGEST)
- Level progress bar with XP progress text
- Multiline editor via `TextareaRenderable` (Enter inserts newlines, no 1000-char limit)
- Autosave: the editor draft (plus the XP/words/streak earned) is persisted to `stats.draft` 1500 ms after the last keystroke, and flushed on any shutdown path. Ctrl+C now exits cleanly without committing a session, and the next launch offers the draft back ("Recovered unsaved draft — Ctrl+S to save it"). A recovered draft takes priority over the older resume-last-session behaviour.
- Auto-resume: last saved session content loaded on startup when there is no draft
- Session save / new session / export to .wbin
- Session history: searchable (content+title, case-insensitive), paginated (20 per page), metadata filters (all/date/words/xp)
- Session reader: scrollable word-wrapped full-text view for any past session (Enter to open, ↑↓ to scroll, Esc to close)
- Resume into editor: press `r` in reader to load a past session's content into the editor as a new session (original preserved)
- Session share in three formats: `s` in the history list, `s` in the reader, or `Ctrl+G` while writing opens a prompt (`m` Markdown · `t` Text · `h` HTML · Esc cancel) and writes `writestreak-session-YYYY-MM-DD-HHMMSS.{md,txt,html}`. Each file is self-contained with title, stats (words · chars · XP · duration), full prose and a level/streak footer; the HTML is a styled standalone page with a light/dark palette and no external assets. Ctrl+G shares the in-progress draft without saving it. Empty sessions are refused with a message rather than writing a blank file.
- Headless CLI (no TUI): `writestreak list|show|stats|help|version`, with `--json` everywhere, `--format md|txt|html|json|raw` for `show`, `--query`/`--filter`/`--limit`/`--page`/`--all`/`--content` for `list`, and `--file` (or `$WRITESTREAK_FILE`) to point at a save file from any directory. `show` accepts `latest`, a 1-based index, or a session id/unique prefix. Exit 0 on success, 1 on error, errors on stderr — built so other tools and agents can read sessions without opening the UI.
- Help panel (`Ctrl+K` anywhere, `?` in history): every shortcut in two scrollable columns that stack on narrow terminals. Added so the always-on hint rows could be cut back to a single `? help` / `^K help` pointer instead of crowding the UI.
- Pure filter module: `src/history/filter.ts` (no UI deps; unit-tested in `src/history/filter.test.ts`)
- Pure share module: `src/share/format.ts` (no UI/fs deps). Locale-independent date/number formatting so output is identical on every machine.
- Pure help module: `src/help/keymap.ts`, with a test that greps App.ts for `key.ctrl && key.name === "x"` bindings and fails if any is undocumented (or documented but unbound).
- Pure CLI modules: `src/cli/args.ts` + `src/cli/render.ts`; `run.ts` returns `{stdout, stderr, code}` rather than printing, so it is testable without spawning a process.
- Insights panel (Ctrl+I or mode cycle): disk size, avg words, best session, time writing, best day, 7-day bar chart
- First-launch guide (skippable with `--skip-guide`)
- Color theming via `--color #hex` flag, persisted to save file
- Color cycling button in banner (Rose / Sky / Dim), label shows current color name
- Clickable mode label — cycles writing → history → insights
- Mouse support enabled
- Version display (`v{VERSION}`) next to WRITESTREAK title
- Message bar with timed toasts ("Session saved!", "Exported to...", etc.)
- Live XP feedback text (`+{n} XP`) in editor stats row, auto-clears after 1.5s; gold if streak active, green otherwise
- Milestone popup display (🎉 50 words! +50 XP) in magenta, 3s timeout
- Level-up celebration toast: prominent 3-second toast with level title and bonus description
- Streak fire indicator: 🔥 emoji(s) scale with streak length (1-4 fires, color gradient gold → orange → red) + "streak" label
- Session XP tracking: XP accumulated per session is stored and displayed in history and insights
- Mode switch flash feedback: mode label flashes white on mode change
- Color cycling flash: banner border flashes on color change
- Save feedback: mode label flashes green on Ctrl+S, "Saved. Goodbye!" on Ctrl+Q
- Editor placeholder: "Start typing..." when editor is empty
- Empty states: history and insights panels show helpful messages when no data
- Responsive layout: editor, banner and help panel reflow at any terminal width (verified at 100/60/50/48/40 columns with OpenTUI's `createTestRenderer`)
- Hint rows carry a single `? help` / `^K help` pointer instead of a full keymap; the history header shows the active filter, since that is state rather than a shortcut
- Layout hardened against small terminals: header/footer (`flexShrink: 0`) no longer get crushed when wrapped editor content exceeds the terminal height, middle section clips (`overflow: "hidden"`) instead of bleeding into the footer, and the banner title row wraps (`flexWrap: "wrap"`) instead of overlapping when it doesn't fit one line
- MessagePack binary storage (`writestreak.bin`)
- 186 unit tests (scoring, levels, msgpack + draft, history filter, share formats, help keymap, chord collisions, CLI args + render) — all passing
- Global CLI: `writestreak` / `ws` (both symlinks resolve to `dist/index.js`, so `npm run build` is required for global commands to pick up changes)

### Known Issues
- None currently known.

### Resolved in 1.6.0 – 1.9.0
- **Ctrl+H and Ctrl+I never worked.** Their bytes (0x08/0x09) parse as backspace/tab, so history and insights could only be reached by clicking the mode label. Fixed by raw-byte matching for Ctrl+H and the Ctrl+L alias for Ctrl+I.
- **Search trapped the history list.** Pressing Enter after a search blurred the input but left `searchFocused` true, so every later key still went to the search box — arrows dead, Enter would not open a session, `s` typed into the query. Enter now leaves search mode and rebuilds so the list regains focus.
- **Search could not recover from an empty result set.** `refreshHistoryList` bailed out on a null select and updated a detached one after the empty state rendered, so the list stayed blank when matches came back. It now rebuilds whenever the empty/non-empty boundary is crossed.
- **Ctrl+C lost unsaved work**, including earned XP — there was no autosave at all. See the autosave note above.
- **Crash on quit.** `Ctrl+Q` destroyed the renderer after 500 ms while `showMessage`'s 2000 ms clear-timer was still pending; when it fired it wrote to a freed TextBuffer and threw `TextBuffer is destroyed`. All seven deferred UI writes now route through the cancellable `later()` helper. Ctrl+C is covered via the renderer's `destroy` event.
- **`ws --version` opened the TUI.** argv is now parsed before the renderer is imported.
- **Editor was not responsive.** The textarea had a concrete `width: 100` inside a centered wrapper, so on any terminal narrower than 100 columns it overflowed both edges and the text was clipped — at 60 columns the opening words were silently cut off the left. Fixed by giving the wrapper a definite width and the textarea `width: "100%"`.
- **First-render wrapping.** Same root cause; text now wraps correctly on the first frame with no resize needed.
- **Banner mid-word wrapping below ~55 columns** ("WORDS" -> "WOR"/"DS"). Fixed with `flexWrap: "wrap"`; the stat blocks now reflow onto a second row with labels intact.

### CLI (headless)

```
ws list [--json] [--limit N] [--page N] [--all] [--query TEXT] [--filter all|date|words|xp] [--content]
ws show <latest|N|id> [--format md|txt|html|json|raw]
ws stats [--json]
ws help | ws version
# any command: --file <path>, or $WRITESTREAK_FILE
```

`ws show latest --format raw` prints only the session text, which is the form
other tools should pipe. `list` indexes are positions in the whole newest-first
history, so they stay valid `show` targets even under a filter or on page 2.

### Keyboard Shortcuts
- `Ctrl+N` — new session (saves current)
- `Ctrl+S` — save session (green flash feedback)
- `Ctrl+K` — toggle the help panel (also `?` in history list/reader)
- `Ctrl+L` — toggle insights (`Ctrl+I` only works under the kitty keyboard protocol)
- `Ctrl+H` — toggle history / exit reader
- (history list) `s` — share selected session · `?` — help · `/` — focus search · `f` — cycle filter · `[`/`]` — prev/next page · `Enter` — open reader · `Esc` — clear search/filter or close
- (history reader) `r` — resume into editor · `s` — share this session · `?` — help · `↑/↓` — scroll · `Esc` — back to list
- (share prompt) `m` Markdown · `t` Text · `h` HTML · `Esc` cancel
- `Ctrl+G` — share current draft, then pick a format (`Ctrl+Shift+S` is not usable: terminals deliver it as plain `Ctrl+S`)
- `Ctrl+E` — export to .wbin
- `Ctrl+Q` — save and quit (shows goodbye message)
- `Ctrl+C` — exit without committing a session; the draft is flushed first and recovered next launch
- Mouse: click mode label to cycle modes, click color button to cycle colors
# WriteStreak — Agent Guide

## Project Overview
WriteStreak is a gamified terminal writing app built with OpenTUI (imperative API, not React/Ink) and Bun runtime. Users earn XP, level up, build streaks, and track writing sessions. Data is stored in MessagePack binary format.

- **Language:** TypeScript (ESNext modules, no JSX)
- **Runtime:** Bun (`#!/usr/bin/env bun` shebang in `src/index.ts`)
- **UI Framework:** `@opentui/core` (imperative `BoxRenderable` / `TextRenderable` / `TextareaRenderable`)
- **Storage:** `@msgpack/msgpack` binary format (`writestreak.bin`)
- **Tests:** Vitest (59 tests across scoring, levels, msgpack)
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
  index.ts          Entry point (shebang: #!/usr/bin/env bun), calls main()
  App.ts            Main app: renderer setup, UI build, key bindings, all modes
  types.ts          TS interfaces: PlayerStats, WritingSession, ScorePopup, LevelThreshold
  game/
    scoring.ts      countWords, calculateXp (2 XP/word base, streak multiplier, milestone bonuses), updateStreak
    levels.ts       12-level progression table (Novice Scribe → God of Words)
  storage/
    msgpack.ts      exportToBin / importFromBin / getDefaultStats (MessagePack binary)
```

### Key Implementation Notes
- `TextareaRenderable` is used for the editor (NOT `InputRenderable`, which is single-line and has a 1000-char maxLength default). TextareaRenderable supports multiline, Enter inserts newlines.
- TextareaRenderable uses `onContentChange` callback (not `"input"` event), `.setText()` / `.plainText` (not `.value`).
- UI uses persistent renderable instances (created once in `buildUI()`), then `.content` is updated in-place to avoid redraw glitches.
- Mode label (modeBox) is clickable — `onMouseDown: () => cycleMode()` cycles writing → history → insights → writing.
- Color button cycles 3 pastel colors: Rose (#E8A0BF), Sky (#A8D8EA), Dim (#C8C8C8). Label shows color name.
- Color selection persists to save file.
- Writing pad is capped: `editorWrapper` uses `maxWidth: 100` and `alignSelf: "center"`.
- Banner is full-width bordered box with 5 stat blocks: XP, WORDS, STREAK, SESSIONS, LONGEST.

## Current State

**Version:** 1.4.0

### Features Implemented
- Full OpenTUI imperative UI (no React/Ink)
- Gamification: XP (2/word base + streak multiplier + milestone bonuses), 12 levels, daily streaks
- Banner scoreboard: full-width bordered box with 5 stat blocks (XP, WORDS, STREAK, SESSIONS, LONGEST)
- Level progress bar with XP progress text
- Multiline editor via `TextareaRenderable` (Enter inserts newlines, no 1000-char limit)
- Auto-resume: last session content loaded on startup
- Session save / new session / export to .wbin
- Session history view (Ctrl+H or mode cycle), shows last 15 sessions
- Insights panel (Ctrl+I or mode cycle): empty state for new users, disk, avg words, best session, time, best day, 7-day bar chart
- First-launch guide (skippable with `--skip-guide`)
- Color theming via `--color #hex` flag, persisted to save file
- Color cycling button in banner (Rose / Sky / Dim), label shows current color name
- Clickable mode label — cycles writing → history → insights
- Flash feedback: mode label flashes white on mode switch (500ms), banner border flashes on color cycle (300ms)
- Mouse support enabled
- Version display (`v{VERSION}`) next to WRITESTREAK title
- Message bar with timed toasts ("Session saved!", "Exported to...", etc.)
- Live XP feedback text (`+{n} XP`) in editor stats row, auto-clears after 1.5s; gold if streak active, green otherwise
- Milestone popup: magenta text ("🎉 50 words! +50 XP") in stats row, auto-clears after 3s
- Level-up celebration toast: prominent 3-second toast when crossing a level threshold (e.g. "⬆ LEVEL UP! Apprentice Writer (LVL 2)"). Shows XP/word bonus for next level.
- Streak fire indicator: 🔥 emoji(s) scale with streak length (1-4 fires, color gradient gold → orange → red), includes "streak" label text
- Session XP tracking: XP accumulated per session is stored and displayed in history (`· {n} XP`) and insights best session
- MessagePack binary storage (`writestreak.bin`)
- 59 unit tests (scoring, levels, msgpack) — all passing
- Save feedback flash: mode label flashes green on Ctrl+S
- Goodbye message toast on Ctrl+Q ("Saved. Goodbye!") before exit
- Resume toast on auto-resume ("Resumed from last session (n words)")
- Global CLI: `writestreak` / `ws`

### Known Issues
- (none currently)

### Keyboard Shortcuts
- `Ctrl+N` — new session (saves current)
- `Ctrl+S` — save session
- `Ctrl+H` — toggle history
- `Ctrl+I` — toggle insights
- `Ctrl+E` — export to .wbin
- `Ctrl+Q` — save and quit
- `Ctrl+C` — exit (via OpenTUI exitOnCtrlC)
- Mouse: click mode label to cycle modes, click color button to cycle colors
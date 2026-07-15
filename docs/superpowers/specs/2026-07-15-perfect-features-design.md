# Perfect Current Features — Design Spec

**Date:** 2026-07-15
**Scope:** Bug fixes + visual consistency + animation & feedback + micro-interactions
**Version target:** 1.4.0 (minor bump — polish pass, no breaking changes)

---

## 1. Bug Fixes

### 1.1 Display Glitch (Last 2 Rows)

**Root cause:** `statsRow` at `App.ts:508` has `flexGrow: 1`, causing it to balloon and overlap the textarea's bottom rows.

**Fix:** Remove `flexGrow: 1` from `statsRow`. The stats row becomes a fixed-height element that sits cleanly below the textarea.

### 1.2 Text Wrapping

**Root cause:** `TextareaRenderable` falls back to 80 columns at construction when `this.width` is 0 (layout hasn't resolved). Native `EditorView` handles wrapping via `setViewportSize` on resize, but the initial state may be wrong.

**Fix:** Set `width: "100%"` on the TextareaRenderable so it fills the `editorWrapper` container. This ensures the native EditorView gets the correct viewport width on first layout.

### 1.3 Guide Text Accuracy

- Remove reference to "Click [History] button in status bar" — button was removed, mode label cycles modes
- Change "Esc to close" in history/insights panels to correct shortcuts (mode label click or Ctrl+H/Ctrl+I)
- Add missing shortcuts: mouse mode cycling, color cycling button

---

## 2. Visual Consistency

### 2.1 Banner Scoreboard

- Consistent padding/gaps between stat blocks (XP, WORDS, STREAK, SESSIONS, LONGEST)
- Progress bar uses primary color consistently
- Level title text dimmed (not bright yellow competing with the title)

### 2.2 Editor View

- Word/line count stats row: consistent dim gray, smaller feel
- XP gain text (`+{n} XP`) aligns right in the stats row
- Editor text color and cursor color cohesive with primary color

### 2.3 History Panel

- Consistent spacing between date, time, stats, preview per session row
- Preview text truncated cleanly (no mid-word cutoffs)
- Subtle row separators or consistent vertical gaps

### 2.4 Insights Panel

- Stats blocks match banner's visual weight
- Bar chart bars use primary color with consistent height
- Labels consistently dim, values consistently bold

### 2.5 Status Bar

- Mode label and session title consistent spacing
- Shortcut hints dimmer and more compact

---

## 3. Animation & Feedback

### 3.1 XP Feedback

- `+{n} XP` text shows immediately, fades after 1.5s (down from 2s)
- Milestone bonuses (50/100/250/500/1000 words): `calculateXp` already generates popups — wire them into the UI. Show `🎉 50 words! +50 XP` in magenta below the `+{n} XP` text, with a 3s timeout

### 3.2 Level-Up Celebration

- Toast shows for 3s (keep existing)
- Include level title and brief description: `⬆ LEVEL UP! Journeyman Author (LVL 3) → 2 XP/word bonus`

### 3.3 Streak Fire Indicator

- Current fire scaling (1-4 fires) kept
- Add text label next to fires: `🔥🔥 5d streak` instead of `🔥🔥 5d`
- Color gradient unchanged (gold → orange → red)

### 3.4 Mode Switch Feedback

- Briefly flash mode label background on mode change (show new mode name for 0.5s then settle)
- Gives tactile feedback that click registered

### 3.5 Toast Messages

- All toasts use consistent 2s timing
- Consistent positioning in footer, never overlapping editor

---

## 4. Micro-Interactions & Edge Cases

### 4.1 Color Cycling

- Flash banner border in new color for 300ms on click before settling
- Color name label updates instantly

### 4.2 Empty States

- History panel: "No sessions yet — start writing!" in dim gray
- Insights panel: "Write a few sessions to see insights" when insufficient data
- Editor: placeholder text "Start typing..." in dim gray when empty

### 4.3 Save Feedback

- `Ctrl+S`: flash mode label green for 300ms before reverting — confirms save registered
- `Ctrl+Q`: show "Saved. Goodbye!" for 500ms before exit

### 4.4 Session Resume

- On auto-resume, show toast: "Resumed from last session ({n} words)"

### 4.5 Responsive Layout

- Editor wrapper doesn't overflow on narrow terminals (minWidth check)
- Banner stat blocks collapse gracefully on small screens

---

## Files to Modify

- `src/App.ts` — all changes (bug fixes, visual polish, animations, micro-interactions)
- `AGENTS.md` — update Current State section
- `package.json` — version bump to 1.4.0

## Verification

- `npm run build` — zero errors
- `npm test -- --run` — all 59 tests pass
- Manual test: run `bun src/index.ts`, verify all visual and interaction changes

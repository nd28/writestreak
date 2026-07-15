# Gamification Polish — Design Spec

**Date:** 2026-07-15
**Scope:** Gamification improvements only (live XP, level-up celebrations, streak fire, session XP)
**Approach:** Inline feedback (non-intrusive, lightweight)

## Problem

The gamification system (XP, levels, streaks) exists in the data model but provides zero visual feedback during writing. Players earn XP silently, level up without celebration, and streaks show as plain numbers. This makes the gamification feel flat and unrewarding.

## Goals

1. Make XP gains visible in real-time as the user types
2. Celebrate level-ups with a prominent (but non-blocking) notification
3. Make streaks visually exciting with fire indicators
4. Track and display XP earned per session

## Design

### 1. Live XP Feedback

**What:** A `TextRenderable` called `xpGainText` in the editor stats row shows `+{xp} XP` after each word batch.

**Where:** Editor stats row, right-aligned after line count. Layout: `[word count] · [line count]          [+{xp} XP]`

**Behavior:**
- Shows `+{xp} XP` in green (`#00FF00`) when streak is 0
- Shows `+{xp} XP` in gold (`#FFD700`) when streak > 0
- Clears to empty string after 2 seconds of no typing
- XP amount includes streak multiplier and milestone bonuses (uses existing `calculateXp` return value)

**Implementation:**
- Add `let xpGainText: TextRenderable | null = null` to persistent renderables
- Add `let xpGainTimeout: NodeJS.Timeout | null = null` for debouncing
- In `onContentChange`, after `calculateXp`: set `xpGainText.content`, start timeout to clear
- In `buildMiddleSection()` writing mode, add `xpGainText` to stats row

### 2. Level-up Celebration

**What:** When `stats.totalXp` crosses a level threshold, a colored banner line appears in the message area.

**Where:** Existing message area (above status bar), using `showMessage()` mechanism.

**Behavior:**
- Shows: `⬆ LEVEL UP! {title} (LVL {level})`
- Uses primary color for the level title text
- Auto-dismisses after 3 seconds (longer than regular 2s toasts)
- Also persists `stats.level` to save file

**Implementation:**
- Add `let previousLevel = getLevelInfo(stats.totalXp).level` at session start
- In `onContentChange`, after XP update: compare `getLevelInfo(stats.totalXp).level` to `previousLevel`
- If crossed: call `showMessageLevelUp(...)` (new function, 3s timeout), update `stats.level`, update `previousLevel`
- Add `showMessageLevelUp(msg)` — same as `showMessage` but with 3000ms timeout

### 3. Streak Fire Indicator

**What:** Fire emoji(s) appear next to the streak count in the banner, scaling with streak length.

**Where:** Banner STREAK stat block.

**Behavior:**
| Streak | Display | Color |
|--------|---------|-------|
| 0 | `0d` | `#888888` (gray) |
| 1-2 | `🔥 2d` | `#FFD700` (gold) |
| 3-5 | `🔥🔥 4d` | `#FF8C00` (orange) |
| 6-9 | `🔥🔥🔥 7d` | `#FF4500` (red-orange) |
| 10+ | `🔥🔥🔥🔥 12d` | `#FF0000` (red) |

Fire count formula: `min(floor(streak / 3) + 1, 4)`

**Implementation:**
- In `updateHeaderStats()`, compute fire count and color based on streak
- Update `streakText.content` and `streakText.fg` accordingly
- No new renderables needed — just update existing `streakText`

### 4. Session XP Tracking

**What:** Compute and store XP earned per session, display in history and insights.

**Where:** History list shows `123w · 450 XP`; Insights "BEST SESSION" shows XP alongside words.

**Implementation:**
- Add `let sessionXp = 0` variable
- In `onContentChange`, when XP is earned: `sessionXp += xp`
- In `saveSession()`: set `session.xpEarned = sessionXp`
- In `newSession()`: reset `sessionXp = 0`
- In `buildHistory()`: change display from `${session.wordCount}w` to `${session.wordCount}w · ${session.xpEarned} XP`
- In `buildInsights()`: update best session display to show XP

## Files Modified

- `src/App.ts` — All changes are in this single file
  - Add `xpGainText`, `xpGainTimeout`, `sessionXp`, `previousLevel` variables
  - Update `onContentChange` handler for XP feedback and level detection
  - Update `updateHeaderStats()` for streak fire
  - Update `buildMiddleSection()` for xpGainText in stats row
  - Update `saveSession()` for xpEarned
  - Update `newSession()` for sessionXp reset
  - Update `buildHistory()` and `buildInsights()` for XP display
  - Add `showMessageLevelUp()` function

## Testing

- Existing 59 tests continue to pass (no changes to scoring/levels/msgpack logic)
- Manual testing: type words, verify +XP appears and clears; verify level-up toast; verify streak fire; verify history shows XP
- Run `npm run build` — zero errors
- Run `npm test -- --run` — all pass

## Version

Bump to `1.1.0` (minor — new features).

# Gamification Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add live XP feedback, level-up celebrations, streak fire indicators, and session XP tracking to the WriteStreak terminal app.

**Architecture:** All changes are in `src/App.ts`. No new files, no new dependencies, no changes to scoring/levels/msgpack logic. Four independent features sharing the same `onContentChange` handler and `updateHeaderStats()` function.

**Tech Stack:** TypeScript, OpenTUI (`@opentui/core`), Bun runtime

## Global Constraints

- Runtime: Bun (`~/.bun/bin/bun`)
- UI Framework: `@opentui/core` imperative API (BoxRenderable, TextRenderable, TextareaRenderable)
- Version bump to `1.1.0` (minor) via `bun scripts/bump.ts minor`
- All 59 existing tests must continue passing (`npm test -- --run`)
- Build must compile with zero errors (`npm run build`)
- Do NOT commit unless user explicitly asks

---

### Task 1: Add live XP feedback text element

**Files:**
- Modify: `src/App.ts`

**What this does:** Adds a `TextRenderable` to the editor stats row that shows `+{xp} XP` when the user types, auto-clearing after 2 seconds.

- [ ] **Step 1: Add persistent variables**

In `src/App.ts`, near the other persistent renderable declarations (around line 341), add:

```typescript
let xpGainText: TextRenderable | null = null;
let xpGainTimeout: NodeJS.Timeout | null = null;
```

- [ ] **Step 2: Add xpGainText to editor stats row**

In `buildMiddleSection()`, in the writing mode branch, after creating `lineCountText` and before adding to `statsRow`, add the xpGainText creation and add it to statsRow. Find the line `statsRow.add(lineCountText);` and add after it:

```typescript
xpGainText = new TextRenderable(renderer, {
  content: "",
  fg: "#00FF00"
});

statsRow.add(wordCountText);
statsRow.add(lineCountText);
statsRow.add(xpGainText);
```

Also add `flexGrow: 1` to the `statsRow` BoxRenderable options so the gap pushes xpGainText to the right:

```typescript
const statsRow = new BoxRenderable(renderer, {
  flexDirection: "row",
  justifyContent: "space-between",
  flexGrow: 1,
  paddingX: 2
});
```

- [ ] **Step 3: Update onContentChange to show XP gain**

In the `onContentChange` handler, inside the `if (newWordCount > oldWordCount)` block, after `prevWordCount = newWordCount;`, add:

```typescript
if (xpGainText) {
  xpGainText.content = `+${xp} XP`;
  xpGainText.fg = streakInfo.streak > 0 ? "#FFD700" : "#00FF00";
  if (xpGainTimeout) clearTimeout(xpGainTimeout);
  xpGainTimeout = setTimeout(() => {
    if (xpGainText) xpGainText.content = "";
  }, 2000);
}
```

Note: `xp` comes from `const { xp } = calculateXp(...)` which is already destructured on the line above.

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: Zero errors

---

### Task 2: Add streak fire indicator

**Files:**
- Modify: `src/App.ts`

**What this does:** Updates the banner's STREAK stat block to show fire emoji(s) that scale with streak length.

- [ ] **Step 1: Update updateHeaderStats() streak logic**

In `updateHeaderStats()`, replace the streak content block (the `const streakContent = ...` and `if (streakText)` section) with:

```typescript
const streak = stats.currentStreak;
let streakContent: string;
let streakColor: string;

if (streak === 0) {
  streakContent = "0d";
  streakColor = "#888888";
} else {
  const fireCount = Math.min(Math.floor(streak / 3) + 1, 4);
  const fires = "🔥".repeat(fireCount);
  streakContent = `${fires} ${streak}d`;

  if (streak <= 2) {
    streakColor = "#FFD700"; // gold
  } else if (streak <= 5) {
    streakColor = "#FF8C00"; // orange
  } else if (streak <= 9) {
    streakColor = "#FF4500"; // red-orange
  } else {
    streakColor = "#FF0000"; // red
  }
}

if (streakText) {
  streakText.content = streakContent;
  streakText.fg = streakColor;
}
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Zero errors

---

### Task 3: Add level-up celebration

**Files:**
- Modify: `src/App.ts`

**What this does:** When XP crosses a level threshold, shows a prominent toast in the message area that auto-dismisses after 3 seconds.

- [ ] **Step 1: Add previousLevel variable**

Near the other persistent state variables (around line 45), add:

```typescript
let previousLevel = getLevelInfo(stats.totalXp).level;
```

- [ ] **Step 2: Add showMessageLevelUp function**

After the existing `showMessage` function, add:

```typescript
function showMessageLevelUp(msg: string) {
  message = msg;
  updateMessage();
  if (messageTimeout) clearTimeout(messageTimeout);
  messageTimeout = setTimeout(() => {
    message = "";
    updateMessage();
  }, 3000);
}
```

- [ ] **Step 3: Add level-up detection in onContentChange**

In the `onContentChange` handler, inside the `if (newWordCount > oldWordCount)` block, after the XP gain display code (from Task 1), add:

```typescript
const currentLevel = getLevelInfo(stats.totalXp).level;
if (currentLevel > previousLevel) {
  const levelInfo = getLevelInfo(stats.totalXp);
  showMessageLevelUp(`⬆ LEVEL UP! ${levelInfo.title} (LVL ${levelInfo.level})`);
  stats = { ...stats, level: currentLevel };
  previousLevel = currentLevel;
}
```

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: Zero errors

---

### Task 4: Add session XP tracking

**Files:**
- Modify: `src/App.ts`

**What this does:** Tracks XP earned during a session, stores it in the session on save, and displays it in history and insights.

- [ ] **Step 1: Add sessionXp variable**

Near the other state variables (around line 45), add:

```typescript
let sessionXp = 0;
```

- [ ] **Step 2: Accumulate XP in onContentChange**

In the `onContentChange` handler, inside the `if (newWordCount > oldWordCount)` block, after the level-up detection code (from Task 3), add:

```typescript
sessionXp += xp;
```

- [ ] **Step 3: Store XP in saveSession()**

In `saveSession()`, change the session object's `xpEarned` field from `0` to `sessionXp`:

```typescript
const session: WritingSession = {
  id: Math.random().toString(36).slice(2),
  title: sessionTitle,
  content: currentText,
  wordCount: countWords(currentText),
  charCount: currentText.length,
  startedAt: sessionStart,
  endedAt: Date.now(),
  xpEarned: sessionXp,
};
```

- [ ] **Step 4: Reset sessionXp in newSession()**

In `newSession()`, after `prevWordCount = 0;`, add:

```typescript
sessionXp = 0;
```

- [ ] **Step 5: Update buildHistory() display**

In `buildHistory()`, find the line that shows word count:

```typescript
Text({ content: `${session.wordCount}w`, fg: "#00FF00" }),
```

Change it to:

```typescript
Text({ content: `${session.wordCount}w · ${session.xpEarned || 0} XP`, fg: "#00FF00" }),
```

- [ ] **Step 6: Update buildInsights() best session display**

In `buildInsights()`, find the best session display:

```typescript
Text({ content: bestSession ? `${bestSession.wordCount}w` : "N/A", fg: "#00FF00", attributes: TextAttributes.BOLD })
```

Change it to:

```typescript
Text({ content: bestSession ? `${bestSession.wordCount}w · ${bestSession.xpEarned || 0} XP` : "N/A", fg: "#00FF00", attributes: TextAttributes.BOLD })
```

- [ ] **Step 7: Build and verify**

Run: `npm run build`
Expected: Zero errors

---

### Task 5: Version bump, AGENTS.md update, and final verification

**Files:**
- Modify: `package.json` (via bump script)
- Modify: `AGENTS.md`

**What this does:** Bumps version to 1.1.0, updates AGENTS.md with new features, runs full build + test verification.

- [ ] **Step 1: Bump version**

Run: `bun scripts/bump.ts minor`
Expected: package.json version changes from `1.0.1` to `1.1.0`

- [ ] **Step 2: Update AGENTS.md Current State**

Update the "Current State" section in `AGENTS.md`:

- Change version to `1.1.0`
- Add to "Features Implemented":
  - Live XP feedback: `+{xp} XP` appears in editor stats row, auto-clears after 2s
  - Level-up celebration: toast banner with level title, 3s auto-dismiss
  - Streak fire indicator: 🔥 emoji(s) scale with streak length (1-4 fires, color gradient)
  - Session XP tracking: XP earned per session displayed in history and insights
- Update "Known Issues": Remove "Glitch in last 2 rows" if still present, or keep if unresolved

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Zero errors

- [ ] **Step 4: Run tests**

Run: `npm test -- --run`
Expected: 59 tests pass

- [ ] **Step 5: Manual smoke test**

Run: `bun src/index.ts`
Verify:
- Type words → `+{xp} XP` appears in stats row, clears after ~2s
- Type enough words to level up → `⬆ LEVEL UP! ...` toast appears for 3s
- Banner STREAK shows 🔥 emoji(s) with correct color
- Ctrl+S to save, Ctrl+H to see history shows `Xw · Y XP`
- Ctrl+I to see insights shows XP in best session

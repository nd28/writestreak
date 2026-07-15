# Perfect Current Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix display bugs, polish visual consistency, add animation feedback, and implement micro-interactions across the writestreak terminal app.

**Architecture:** All changes are in `src/App.ts` (single-file UI), with minor updates to `AGENTS.md` and `package.json`. No new files needed. No test changes — all UI-only.

**Tech Stack:** TypeScript, OpenTUI imperative API (`BoxRenderable`, `TextRenderable`, `TextareaRenderable`), Bun runtime

## Global Constraints

- Runtime: Bun (`~/.bun/bin/bun`)
- UI Framework: `@opentui/core` imperative API (NOT React/Ink)
- Tests: 59 existing tests must continue passing (`npm test -- --run`)
- Build: `npm run build` must compile with zero errors
- Version: bump to 1.4.0 via `bun scripts/bump.ts minor`
- After ALL tasks: update `AGENTS.md` Current State section

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/App.ts` | Modify | All UI changes (tasks 1-13) |
| `package.json` | Modify | Version bump (task 14) |
| `AGENTS.md` | Modify | Update Current State (task 14) |

---

### Task 1: Fix display glitch & text wrapping

**Files:**
- Modify: `src/App.ts:501-534` (statsRow and TextareaRenderable)

**Interfaces:**
- Consumes: existing `editorWrapper` BoxRenderable, `input` TextareaRenderable
- Produces: fixed layout where stats row doesn't balloon

- [ ] **Step 1: Remove flexGrow from statsRow**

In `buildMiddleSection()`, find the `statsRow` BoxRenderable creation (around line 508). Remove `flexGrow: 1`:

```typescript
// BEFORE
const statsRow = new BoxRenderable(renderer, {
  flexDirection: "row",
  justifyContent: "space-between",
  flexGrow: 1,
  paddingX: 2
});

// AFTER
const statsRow = new BoxRenderable(renderer, {
  flexDirection: "row",
  justifyContent: "space-between",
  paddingX: 2
});
```

- [ ] **Step 2: Fix TextareaRenderable width**

Find the `input` TextareaRenderable creation (around line 362). Change `width: 100` to `width: "100%"`:

```typescript
// BEFORE
const input = new TextareaRenderable(renderer, {
  id: "editor-input",
  width: 100,
  wrapMode: "word",
  // ...
});

// AFTER
const input = new TextareaRenderable(renderer, {
  id: "editor-input",
  width: "100%",
  wrapMode: "word",
  // ...
});
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: zero errors

Run: `npm test -- --run`
Expected: 59 tests pass

- [ ] **Step 4: Commit**

```bash
git add src/App.ts
git commit -m "fix: remove statsRow flexGrow and fix textarea width for proper layout"
```

---

### Task 2: Fix guide text

**Files:**
- Modify: `src/App.ts:215-249` (buildGuide function)

**Interfaces:**
- Consumes: existing `primaryColor` variable
- Produces: corrected guide content

- [ ] **Step 1: Update guide content**

Replace the entire `buildGuide()` function body. Key changes:
- Remove "Click [History] button in status bar" line
- Change "Esc to close" references to correct shortcuts
- Add mouse/color cycling shortcuts

```typescript
function buildGuide() {
  return Box(
    { flexDirection: "column", flexGrow: 1, paddingX: 2, paddingY: 1 },
    Text({ content: "Welcome to WriteStreak!", fg: primaryColor, attributes: TextAttributes.BOLD }),
    Text({ content: " " }),
    Text({ content: "HOW TO WRITE", fg: "#FFFF00", attributes: TextAttributes.BOLD }),
    Text({ content: "Just start typing. Every word earns you XP.", fg: "#888888" }),
    Text({ content: " " }),
    Text({ content: "SCORING", fg: "#FFFF00", attributes: TextAttributes.BOLD }),
    Text({ content: "• 2 XP per word (base)", fg: "#888888" }),
    Text({ content: "• Streak multiplier: +10% per consecutive day", fg: "#888888" }),
    Text({ content: "• Milestone bonuses at 50, 100, 250, 500, 1000 words", fg: "#888888" }),
    Text({ content: "• 12 levels from \"Novice Scribe\" to \"God of Words\"", fg: "#888888" }),
    Text({ content: " " }),
    Text({ content: "CONTROLS", fg: "#FFFF00", attributes: TextAttributes.BOLD }),
    Text({ content: "• Ctrl+N  New session (saves current)", fg: "#888888" }),
    Text({ content: "• Ctrl+S  Save session", fg: "#888888" }),
    Text({ content: "• Ctrl+H  Toggle history", fg: "#888888" }),
    Text({ content: "• Ctrl+I  Toggle insights", fg: "#888888" }),
    Text({ content: "• Ctrl+E  Export to .wbin", fg: "#888888" }),
    Text({ content: "• Ctrl+Q  Save and quit", fg: "#888888" }),
    Text({ content: " " }),
    Text({ content: "MOUSE", fg: "#FFFF00", attributes: TextAttributes.BOLD }),
    Text({ content: "• Click mode label to cycle views", fg: "#888888" }),
    Text({ content: "• Click color button to cycle themes", fg: "#888888" }),
    Text({ content: " " }),
    Text({ content: "THEMING", fg: "#FFFF00", attributes: TextAttributes.BOLD }),
    Text({ content: "• writestreak --color #efee23", fg: "#888888" }),
    Text({ content: "  Sets your primary color (saved to profile)", fg: "#888888" }),
    Text({ content: " " }),
    Text({ content: "TIPS", fg: "#FFFF00", attributes: TextAttributes.BOLD }),
    Text({ content: "• Write daily to build your streak", fg: "#888888" }),
    Text({ content: "• Sessions auto-resume from last save", fg: "#888888" }),
    Text({ content: "• Export .wbin files to backup or share", fg: "#888888" }),
    Text({ content: " " }),
    Text({ content: "Press Enter or Esc to start writing...", fg: primaryColor, attributes: TextAttributes.BOLD })
  );
}
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: zero errors

Run: `npm test -- --run`
Expected: 59 tests pass

- [ ] **Step 3: Commit**

```bash
git add src/App.ts
git commit -m "fix: correct guide text — remove removed buttons, add mouse shortcuts"
```

---

### Task 3: Banner visual consistency

**Files:**
- Modify: `src/App.ts:578-718` (bannerBox and stat blocks in buildUI)

**Interfaces:**
- Consumes: `primaryColor` variable
- Produces: visually consistent banner

- [ ] **Step 1: Add gap between stat blocks**

In `buildUI()`, find the `statsRow` inside `bannerBox` (around line 661). Add `gap: 2`:

```typescript
const statsRow = new BoxRenderable(renderer, {
  flexDirection: "row",
  justifyContent: "space-between",
  width: "100%",
  marginTop: 1,
  gap: 2
});
```

- [ ] **Step 2: Dim level title text**

Find `levelTitleText` creation (around line 617). Change `fg: "#FFFF00"` to `fg: "#AAAAAA"`:

```typescript
levelTitleText = new TextRenderable(renderer, {
  content: "",
  fg: "#AAAAAA"
});
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: zero errors

Run: `npm test -- --run`
Expected: 59 tests pass

- [ ] **Step 4: Commit**

```bash
git add src/App.ts
git commit -m "style: consistent banner spacing and dimmed level title"
```

---

### Task 4: Editor visual consistency

**Files:**
- Modify: `src/App.ts:508-532` (statsRow and xpGainText in buildMiddleSection)

**Interfaces:**
- Consumes: existing statsRow, xpGainText
- Produces: aligned stats row with right-aligned XP gain

- [ ] **Step 1: Add spacer between lineCount and xpGain**

Replace the statsRow creation in `buildMiddleSection()`:

```typescript
const statsRow = new BoxRenderable(renderer, {
  flexDirection: "row",
  justifyContent: "space-between",
  paddingX: 2
});

wordCountText = new TextRenderable(renderer, {
  content: `${countWords(currentText)} words · ${currentText.length} chars`,
  fg: "#666666"
});

lineCountText = new TextRenderable(renderer, {
  content: `Ln ${currentText.split("\n").length}`,
  fg: "#666666"
});

xpGainText = new TextRenderable(renderer, {
  content: "",
  fg: "#00FF00"
});

statsRow.add(wordCountText);
statsRow.add(lineCountText);
statsRow.add(xpGainText);
```

The `justifyContent: "space-between"` will push xpGainText to the right edge.

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: zero errors

Run: `npm test -- --run`
Expected: 59 tests pass

- [ ] **Step 3: Commit**

```bash
git add src/App.ts
git commit -m "style: right-align XP gain text and dim editor stats"
```

---

### Task 5: History panel visual consistency

**Files:**
- Modify: `src/App.ts:179-213` (buildHistory function)

**Interfaces:**
- Consumes: `stats.sessions`, `primaryColor`
- Produces: cleaned up history panel

- [ ] **Step 1: Rewrite buildHistory**

Replace the entire `buildHistory()` function:

```typescript
function buildHistory() {
  const sorted = [...stats.sessions].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  const visible = sorted.slice(0, 15);

  const historyBox = Box(
    { flexDirection: "column", flexGrow: 1, paddingX: 1, gap: 1 },
    Box({ flexDirection: "row", justifyContent: "space-between" },
      Text({ content: "SESSION HISTORY", fg: "#FFFF00", attributes: TextAttributes.BOLD }),
      Text({ content: `${stats.sessions.length} sessions · Click mode label to close`, fg: "#888888" })
    )
  );

  if (visible.length === 0) {
    historyBox.add(Text({ content: "No sessions yet — start writing!", fg: "#666666" }));
  } else {
    visible.forEach((session, i) => {
      const date = new Date(session.startedAt);
      const dateStr = date.toLocaleDateString();
      const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const preview = session.content
        ? session.content.replace(/\n/g, " ").slice(0, 40)
        : "(empty)";

      historyBox.add(Box({ flexDirection: "row", gap: 1 },
        Text({ content: `${String(i + 1).padStart(2)}.`, fg: "#666666" }),
        Text({ content: dateStr, fg: "#00FFFF" }),
        Text({ content: timeStr, fg: "#888888" }),
        Text({ content: `${session.wordCount}w · ${session.xpEarned || 0} XP`, fg: "#00FF00" }),
        Text({ content: preview, fg: "#666666" })
      ));
    });
  }

  return historyBox;
}
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: zero errors

Run: `npm test -- --run`
Expected: 59 tests pass

- [ ] **Step 3: Commit**

```bash
git add src/App.ts
git commit -m "style: consistent history panel spacing and empty state"
```

---

### Task 6: Insights panel visual consistency

**Files:**
- Modify: `src/App.ts:251-342` (buildInsights function)

**Interfaces:**
- Consumes: `stats`, `primaryColor`, `SAVE_PATH`
- Produces: cleaned up insights panel

- [ ] **Step 1: Rewrite buildInsights**

Replace the entire `buildInsights()` function with consistent styling:

```typescript
function buildInsights() {
  const sessions = stats.sessions;
  const totalSessions = sessions.length;

  const diskBytes = existsSync(SAVE_PATH) ? statSync(SAVE_PATH).size : 0;
  const diskLabel = diskBytes < 1024
    ? `${diskBytes} B`
    : diskBytes < 1048576
      ? `${(diskBytes / 1024).toFixed(1)} KB`
      : `${(diskBytes / 1048576).toFixed(2)} MB`;

  const avgWords = totalSessions > 0
    ? Math.round(sessions.reduce((s, x) => s + x.wordCount, 0) / totalSessions)
    : 0;

  const bestSession = totalSessions > 0
    ? sessions.reduce((best, s) => s.wordCount > best.wordCount ? s : best, sessions[0])
    : null;

  const totalMinutes = sessions.reduce((sum, s) => {
    if (s.startedAt && s.endedAt) return sum + Math.round((s.endedAt - s.startedAt) / 60000);
    return sum;
  }, 0);
  const timeLabel = totalMinutes < 60
    ? `${totalMinutes}m`
    : `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayCounts = new Array(7).fill(0);
  sessions.forEach(s => {
    if (s.startedAt) dayCounts[new Date(s.startedAt).getDay()]++;
  });
  const bestDayIdx = dayCounts.indexOf(Math.max(...dayCounts));
  const bestDay = totalSessions > 0 ? dayNames[bestDayIdx] : "N/A";

  const now = Date.now();
  const last7: { label: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    const key = d.toISOString().split("T")[0];
    const dayLabel = dayNames[d.getDay()];
    const count = sessions.filter(s => {
      const sd = new Date(s.startedAt).toISOString().split("T")[0];
      return sd === key;
    }).length;
    last7.push({ label: dayLabel, count });
  }
  const maxDay = Math.max(...last7.map(d => d.count), 1);

  const box = Box(
    { flexDirection: "column", flexGrow: 1, paddingX: 1, gap: 1 },
    Box({ flexDirection: "row", justifyContent: "space-between" },
      Text({ content: "INSIGHTS", fg: "#FFFF00", attributes: TextAttributes.BOLD }),
      Text({ content: "Click mode label to close", fg: "#888888" })
    ),
    totalSessions === 0
      ? Text({ content: "Write a few sessions to see insights", fg: "#666666" })
      : Box({ flexDirection: "row", gap: 3 },
          Box({ flexDirection: "column" },
            Text({ content: "DISK", fg: "#666666" }),
            Text({ content: diskLabel, fg: primaryColor, attributes: TextAttributes.BOLD })
          ),
          Box({ flexDirection: "column" },
            Text({ content: "AVG WORDS", fg: "#666666" }),
            Text({ content: `${avgWords}`, fg: "#FFFFFF", attributes: TextAttributes.BOLD })
          ),
          Box({ flexDirection: "column" },
            Text({ content: "BEST SESSION", fg: "#666666" }),
            Text({ content: bestSession ? `${bestSession.wordCount}w · ${bestSession.xpEarned || 0} XP` : "N/A", fg: "#00FF00", attributes: TextAttributes.BOLD })
          ),
          Box({ flexDirection: "column" },
            Text({ content: "TIME", fg: "#666666" }),
            Text({ content: timeLabel, fg: "#00FFFF", attributes: TextAttributes.BOLD })
          ),
          Box({ flexDirection: "column" },
            Text({ content: "BEST DAY", fg: "#666666" }),
            Text({ content: bestDay, fg: "#FFD700", attributes: TextAttributes.BOLD })
          )
        ),
    Text({ content: " " }),
    Text({ content: "LAST 7 DAYS", fg: "#FFFF00", attributes: TextAttributes.BOLD }),
    ...last7.map(d => {
      const barLen = Math.round((d.count / maxDay) * 20);
      const bar = "█".repeat(barLen) + "░".repeat(20 - barLen);
      return Box({ flexDirection: "row", gap: 1 },
        Text({ content: d.label, fg: "#666666" }),
        Text({ content: bar, fg: primaryColor }),
        Text({ content: `${d.count}`, fg: "#FFFFFF" })
      );
    })
  );

  return box;
}
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: zero errors

Run: `npm test -- --run`
Expected: 59 tests pass

- [ ] **Step 3: Commit**

```bash
git add src/App.ts
git commit -m "style: consistent insights panel with empty state"
```

---

### Task 7: Status bar visual consistency

**Files:**
- Modify: `src/App.ts:739-778` (statusBar in buildUI)

**Interfaces:**
- Consumes: `sessionTitle`, `mode`
- Produces: compact status bar

- [ ] **Step 1: Compact status bar**

Find the status bar right section (around line 771). Change the shortcut text to be more compact:

```typescript
statusRight.add(new TextRenderable(renderer, {
  content: "^N new  ^S save  ^E export  ^Q quit",
  fg: "#555555"
}));
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: zero errors

Run: `npm test -- --run`
Expected: 59 tests pass

- [ ] **Step 3: Commit**

```bash
git add src/App.ts
git commit -m "style: compact status bar shortcuts"
```

---

### Task 8: XP feedback & milestone popups

**Files:**
- Modify: `src/App.ts:370-410` (onContentChange callback) and `src/App.ts:525-528` (xpGainText creation)

**Interfaces:**
- Consumes: `calculateXp` return value (includes `popups` array)
- Produces: faster XP fade, milestone popup display

- [ ] **Step 1: Add milestone text variable**

Near the other text variable declarations (around line 356), add:

```typescript
let milestoneText: TextRenderable | null = null;
let milestoneTimeout: NodeJS.Timeout | null = null;
```

- [ ] **Step 2: Create milestoneText in buildMiddleSection**

In the statsRow creation in `buildMiddleSection()`, add milestoneText after xpGainText:

```typescript
milestoneText = new TextRenderable(renderer, {
  content: "",
  fg: "#FF00FF"
});

statsRow.add(wordCountText);
statsRow.add(lineCountText);
statsRow.add(xpGainText);
statsRow.add(milestoneText);
```

- [ ] **Step 3: Update onContentChange for faster fade and milestones**

Replace the XP feedback section in `onContentChange`:

```typescript
if (newWordCount > oldWordCount) {
  const { xp, popups } = calculateXp(newWordCount, oldWordCount, streakInfo.streak);
  stats = {
    ...stats,
    totalXp: stats.totalXp + xp,
    totalWords: stats.totalWords + (newWordCount - oldWordCount),
    currentStreak: streakInfo.streak,
    longestStreak: Math.max(stats.longestStreak, streakInfo.streak),
    lastWriteDate: new Date().toISOString().split("T")[0],
  };
  prevWordCount = newWordCount;
  if (xpGainText) {
    xpGainText.content = `+${xp} XP`;
    xpGainText.fg = streakInfo.streak > 0 ? "#FFD700" : "#00FF00";
    if (xpGainTimeout) clearTimeout(xpGainTimeout);
    xpGainTimeout = setTimeout(() => {
      if (xpGainText) xpGainText.content = "";
    }, 1500);
  }

  const milestonePopup = popups.find(p => p.text.includes("words!"));
  if (milestonePopup && milestoneText) {
    milestoneText.content = `🎉 ${milestonePopup.text}`;
    if (milestoneTimeout) clearTimeout(milestoneTimeout);
    milestoneTimeout = setTimeout(() => {
      if (milestoneText) milestoneText.content = "";
    }, 3000);
  }

  const currentLevel = getLevelInfo(stats.totalXp).level;
  if (currentLevel > previousLevel) {
    const levelInfo = getLevelInfo(stats.totalXp);
    const nextLevel = LEVELS.find(l => l.level === currentLevel + 1);
    const bonusText = nextLevel ? ` → ${2} XP/word bonus` : "";
    showMessageLevelUp(`⬆ LEVEL UP! ${levelInfo.title} (LVL ${levelInfo.level})${bonusText}`);
    stats = { ...stats, level: currentLevel };
    previousLevel = currentLevel;
  }
  sessionXp += xp;
}
```

Note: This requires importing `LEVELS` from `./game/levels.js`. Add to imports at top of file:

```typescript
import { getLevelInfo, LEVELS } from "./game/levels.js";
```

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: zero errors

Run: `npm test -- --run`
Expected: 59 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/App.ts
git commit -m "feat: faster XP fade and milestone popup display"
```

---

### Task 9: Level-up & streak indicator polish

**Files:**
- Modify: `src/App.ts:430-456` (streak display in updateHeaderStats)

**Interfaces:**
- Consumes: `stats.currentStreak`
- Produces: streak label with "streak" text

- [ ] **Step 1: Add "streak" label to fire indicator**

In `updateHeaderStats()`, find the streak content building (around line 438). Change:

```typescript
if (streak === 0) {
  streakContent = "0d";
  streakColor = "#888888";
} else {
  const fireCount = Math.min(Math.floor(streak / 3) + 1, 4);
  const fires = "🔥".repeat(fireCount);
  streakContent = `${fires} ${streak}d streak`;

  if (streak <= 2) {
    streakColor = "#FFD700";
  } else if (streak <= 5) {
    streakColor = "#FF8C00";
  } else if (streak <= 9) {
    streakColor = "#FF4500";
  } else {
    streakColor = "#FF0000";
  }
}
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: zero errors

Run: `npm test -- --run`
Expected: 59 tests pass

- [ ] **Step 3: Commit**

```bash
git add src/App.ts
git commit -m "style: add streak label text to fire indicator"
```

---

### Task 10: Mode switch & color cycling feedback

**Files:**
- Modify: `src/App.ts:133-140` (cycleMode), `src/App.ts:552-559` (cycleColor)

**Interfaces:**
- Consumes: `modeText`, `bannerBox` renderables
- Produces: flash animations on mode change and color cycle

- [ ] **Step 1: Add flash helper function**

Near the other helper functions (around line 60), add:

```typescript
function flashModeLabel(color: string, durationMs: number) {
  if (!modeText) return;
  const originalBg = modeText.fg;
  // We'll use a temporary background change on the modeBox instead
  // Since TextRenderable doesn't have backgroundColor, we'll flash the content
  const originalContent = modeText.content;
  modeText.content = `● ${originalContent}`;
  modeText.fg = color;
  setTimeout(() => {
    modeText.content = originalContent;
    modeText.fg = "#000000";
  }, durationMs);
}
```

Wait — `TextRenderable` doesn't have `backgroundColor`. The mode label is inside `modeBox` which has `backgroundColor: primaryColor`. Let me rethink.

Better approach: flash the modeBox background. But modeBox isn't accessible outside `buildUI`. Let me store it as a module-level variable.

- [ ] **Step 2: Store modeBox and bannerBox as module variables**

Near the other variable declarations (around line 344), add:

```typescript
let modeBoxRef: BoxRenderable | null = null;
let bannerBoxRef: BoxRenderable | null = null;
```

In `buildUI()`, when creating `modeBox` (around line 750), assign it:

```typescript
modeBoxRef = modeBox;
```

When creating `bannerBox` (around line 578), assign it:

```typescript
bannerBoxRef = bannerBox;
```

- [ ] **Step 3: Rewrite flashModeLabel to use modeBox**

```typescript
function flashModeLabel(color: string, durationMs: number) {
  if (!modeBoxRef) return;
  modeBoxRef.backgroundColor = color;
  setTimeout(() => {
    if (modeBoxRef) modeBoxRef.backgroundColor = primaryColor;
  }, durationMs);
}
```

- [ ] **Step 4: Add flash to cycleMode**

```typescript
function cycleMode() {
  const modes: Array<"writing" | "history" | "insights"> = ["writing", "history", "insights"];
  const currentIdx = modes.indexOf(mode as any);
  const nextIdx = (currentIdx + 1) % modes.length;
  mode = modes[nextIdx];
  buildMiddleSection();
  updateModeIndicator();
  flashModeLabel("#FFFFFF", 500);
}
```

- [ ] **Step 5: Add flash to cycleColor**

```typescript
function cycleColor() {
  paletteIndex = (paletteIndex + 1) % palette.length;
  const newColor = palette[paletteIndex];
  primaryColor = newColor;
  stats = { ...stats, primaryColor: newColor };
  exportToBin(stats, SAVE_PATH);
  if (bannerBoxRef) {
    bannerBoxRef.borderColor = newColor;
    setTimeout(() => {
      if (bannerBoxRef) bannerBoxRef.borderColor = newColor;
    }, 300);
  }
  buildUI();
}
```

- [ ] **Step 6: Build and verify**

Run: `npm run build`
Expected: zero errors

Run: `npm test -- --run`
Expected: 59 tests pass

- [ ] **Step 7: Commit**

```bash
git add src/App.ts
git commit -m "feat: flash mode label and banner border on mode/color change"
```

---

### Task 11: Toast consistency & save/resume feedback

**Files:**
- Modify: `src/App.ts:61-79` (showMessage, showMessageLevelUp), `src/App.ts:158-176` (key bindings), `src/App.ts:53-57` (auto-resume)

**Interfaces:**
- Consumes: `messageText`, `showMessage`
- Produces: consistent toast timing, save feedback, resume toast

- [ ] **Step 1: Standardize toast timing**

Both `showMessage` and `showMessageLevelUp` already use consistent timing (2s and 3s). Keep as-is — the spec says "consistent 2s" but level-up is intentionally longer. No change needed here.

- [ ] **Step 2: Add save feedback flash**

In the `Ctrl+S` handler (around line 162), add the flash:

```typescript
if (key.ctrl && key.name === "s") {
  saveSession();
  flashModeLabel("#00FF00", 300);
}
```

- [ ] **Step 3: Add goodbye message to Ctrl+Q**

In the `Ctrl+Q` handler (around line 158), add the message:

```typescript
if (key.ctrl && key.name === "q") {
  saveSession();
  showMessage("Saved. Goodbye!");
  setTimeout(() => renderer.destroy(), 500);
}
```

Remove the existing `setTimeout(() => renderer.destroy(), 100)` and replace with the above.

- [ ] **Step 4: Add resume toast**

After the auto-resume logic (around line 57), add:

```typescript
if (lastSession?.content) {
  currentText = lastSession.content;
  prevWordCount = countWords(currentText);
  // Show resume toast after UI is built
  setTimeout(() => {
    showMessage(`Resumed from last session (${prevWordCount} words)`);
  }, 500);
}
```

- [ ] **Step 5: Build and verify**

Run: `npm run build`
Expected: zero errors

Run: `npm test -- --run`
Expected: 59 tests pass

- [ ] **Step 6: Commit**

```bash
git add src/App.ts
git commit -m "feat: save feedback flash, goodbye message, and resume toast"
```

---

### Task 12: Empty states & editor placeholder

**Files:**
- Modify: `src/App.ts:362-367` (input TextareaRenderable options)

**Interfaces:**
- Consumes: existing `input` TextareaRenderable
- Produces: placeholder text when editor is empty

- [ ] **Step 1: Add placeholder to TextareaRenderable**

Find the `input` TextareaRenderable creation. Add `placeholder`:

```typescript
const input = new TextareaRenderable(renderer, {
  id: "editor-input",
  width: "100%",
  wrapMode: "word",
  placeholder: "Start typing...",
  placeholderColor: "#555555",
  backgroundColor: "transparent",
  textColor: "#FFFFFF",
  cursorColor: primaryColor,
  onContentChange: () => {
    // ... existing handler
  }
});
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: zero errors

Run: `npm test -- --run`
Expected: 59 tests pass

- [ ] **Step 3: Commit**

```bash
git add src/App.ts
git commit -m "feat: editor placeholder text when empty"
```

---

### Task 13: Responsive layout

**Files:**
- Modify: `src/App.ts:501-506` (editorWrapper in buildMiddleSection)

**Interfaces:**
- Consumes: existing `editorWrapper`
- Produces: responsive editor that doesn't overflow

- [ ] **Step 1: Add minWidth to editorWrapper**

Find the `editorWrapper` creation in `buildMiddleSection()`:

```typescript
const editorWrapper = new BoxRenderable(renderer, {
  flexDirection: "column",
  flexGrow: 1,
  maxWidth: 100,
  minWidth: 40,
  alignSelf: "center"
});
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: zero errors

Run: `npm test -- --run`
Expected: 59 tests pass

- [ ] **Step 3: Commit**

```bash
git add src/App.ts
git commit -m "style: add minWidth to editor wrapper for narrow terminals"
```

---

### Task 14: Version bump & AGENTS.md update

**Files:**
- Modify: `package.json` (version)
- Modify: `AGENTS.md` (Current State section)

**Interfaces:**
- Consumes: all previous tasks completed
- Produces: version 1.4.0, updated docs

- [ ] **Step 1: Bump version**

Run: `bun scripts/bump.ts minor`
Expected: package.json version changes from 1.3.1 to 1.4.0

- [ ] **Step 2: Update AGENTS.md Current State**

Replace the "Current State" section in AGENTS.md with:

```markdown
## Current State

**Version:** 1.4.0

### Features Implemented
- Full OpenTUI imperative UI (no React/Ink)
- Gamification: XP (2/word base + streak multiplier + milestone bonuses), 12 levels, daily streaks
- Banner scoreboard: full-width bordered box with 5 stat blocks (XP, WORDS, STREAK, SESSIONS, LONGEST)
- Level progress bar with XP progress text
- Multiline editor via `TextareaRenderable` (Enter inserts newlines, no 1000-char limit)
- Auto-resume: last session content loaded on startup with toast notification
- Session save / new session / export to .wbin
- Session history view (Ctrl+H or mode cycle), shows last 15 sessions
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
- Responsive layout: editor wrapper has minWidth for narrow terminals
- MessagePack binary storage (`writestreak.bin`)
- 59 unit tests (scoring, levels, msgpack) — all passing
- Global CLI: `writestreak` / `ws`

### Known Issues
- Text wrapping may not work perfectly on first render (workaround: type and text wraps correctly after first resize)

### Keyboard Shortcuts
- `Ctrl+N` — new session (saves current)
- `Ctrl+S` — save session (green flash feedback)
- `Ctrl+H` — toggle history
- `Ctrl+I` — toggle insights
- `Ctrl+E` — export to .wbin
- `Ctrl+Q` — save and quit (shows goodbye message)
- `Ctrl+C` — exit (via OpenTUI exitOnCtrlC)
- Mouse: click mode label to cycle modes, click color button to cycle colors
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: zero errors

Run: `npm test -- --run`
Expected: 59 tests pass

- [ ] **Step 4: Commit**

```bash
git add package.json AGENTS.md
git commit -m "chore: bump to v1.4.0 and update AGENTS.md"
```

---

## Verification Checklist

After all tasks, run:

```bash
npm run build && npm test -- --run
```

Expected: zero build errors, 59 tests pass.

Manual test: `bun src/index.ts` — verify all visual and interaction changes work correctly.

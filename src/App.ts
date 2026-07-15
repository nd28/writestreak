import { createCliRenderer, Box, Text, TextAttributes, TextareaRenderable, BoxRenderable, TextRenderable } from "@opentui/core";
import { existsSync, statSync } from "fs";
import { countWords, calculateXp, updateStreak } from "./game/scoring.js";
import { getLevelInfo, LEVELS } from "./game/levels.js";
import { exportToBin, importFromBin, getDefaultStats } from "./storage/msgpack.js";
import type { PlayerStats, WritingSession } from "./types.js";
import pkg from "../package.json" with { type: "json" };

const VERSION = pkg.version;
const SAVE_PATH = "./writestreak.bin";
const DEFAULT_PRIMARY_COLOR = "#E8A0BF";

function parseColorArg(): string | null {
  const args = process.argv.slice(2);
  const colorIdx = args.indexOf("--color");
  if (colorIdx !== -1 && args[colorIdx + 1]) {
    const val = args[colorIdx + 1];
    if (/^#[0-9a-fA-F]{6}$/.test(val)) return val;
  }
  return null;
}

function parseSkipGuide(): boolean {
  return process.argv.includes("--skip-guide");
}

async function main() {
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    useMouse: true,
  });

  let stats = importFromBin(SAVE_PATH) || getDefaultStats();
  const cliColor = parseColorArg();
  const skipGuide = parseSkipGuide();

  if (cliColor && cliColor !== stats.primaryColor) {
    stats = { ...stats, primaryColor: cliColor };
    exportToBin(stats, SAVE_PATH);
  }

  let primaryColor = stats.primaryColor || DEFAULT_PRIMARY_COLOR;
  let mode: "writing" | "history" | "guide" | "insights" = skipGuide || stats.guideSeen ? "writing" : "guide";
  let currentText = "";
  let prevWordCount = 0;
  let sessionXp = 0;
  let message = "";
  let messageTimeout: NodeJS.Timeout | null = null;
  let previousLevel = getLevelInfo(stats.totalXp).level;
  const sessionStart = Date.now();
  const sessionTitle = `Session ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;

  const lastSession = stats.sessions.length > 0 ? stats.sessions[stats.sessions.length - 1] : null;
  if (lastSession?.content) {
    currentText = lastSession.content;
    prevWordCount = countWords(currentText);
    setTimeout(() => {
      showMessage(`Resumed from last session (${prevWordCount} words)`);
    }, 500);
  }

  const streakInfo = updateStreak(stats);

  function flashModeLabel(color: string, durationMs: number) {
    if (!modeBoxRef) return;
    modeBoxRef.backgroundColor = color;
    setTimeout(() => {
      if (modeBoxRef) modeBoxRef.backgroundColor = primaryColor;
    }, durationMs);
  }

  function showMessage(msg: string) {
    message = msg;
    updateMessage();
    if (messageTimeout) clearTimeout(messageTimeout);
    messageTimeout = setTimeout(() => {
      message = "";
      updateMessage();
    }, 2000);
  }

  function showMessageLevelUp(msg: string) {
    message = msg;
    updateMessage();
    if (messageTimeout) clearTimeout(messageTimeout);
    messageTimeout = setTimeout(() => {
      message = "";
      updateMessage();
    }, 3000);
  }

  function saveSession() {
    if (currentText.trim().length === 0) return;

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

    stats = {
      ...stats,
      totalSessions: stats.totalSessions + 1,
      sessions: [...stats.sessions, session],
    };
    exportToBin(stats, SAVE_PATH);
    showMessage("Session saved!");
  }

  function newSession() {
    saveSession();
    currentText = "";
    prevWordCount = 0;
    sessionXp = 0;
    input.setText("");
    showMessage("New session started");
    updateEditor();
    updateHeaderStats();
  }

  function exportBin() {
    const exportPath = `./writestreak-export-${Date.now()}.wbin`;
    exportToBin(stats, exportPath);
    showMessage(`Exported to ${exportPath}`);
  }

  function toggleHistory() {
    mode = mode === "history" ? "writing" : "history";
    buildMiddleSection();
    updateModeIndicator();
  }

  function toggleInsights() {
    mode = mode === "insights" ? "writing" : "insights";
    buildMiddleSection();
    updateModeIndicator();
  }

  function cycleMode() {
    const modes: Array<"writing" | "history" | "insights"> = ["writing", "history", "insights"];
    const currentIdx = modes.indexOf(mode as any);
    const nextIdx = (currentIdx + 1) % modes.length;
    mode = modes[nextIdx];
    buildMiddleSection();
    updateModeIndicator();
    flashModeLabel("#FFFFFF", 500);
  }

  function closeGuide() {
    stats = { ...stats, guideSeen: true };
    exportToBin(stats, SAVE_PATH);
    mode = "writing";
    buildMiddleSection();
    updateModeIndicator();
  }

  renderer.keyInput.on("keypress", (key) => {
    if (mode === "guide") {
      if (key.name === "return" || key.name === "escape") {
        closeGuide();
      }
      return;
    }

    if (key.ctrl && key.name === "q") {
      saveSession();
      showMessage("Saved. Goodbye!");
      setTimeout(() => renderer.destroy(), 500);
    }
    if (key.ctrl && key.name === "s") {
      saveSession();
      flashModeLabel("#00FF00", 300);
    }
    if (key.ctrl && key.name === "e") {
      exportBin();
    }
    if (key.ctrl && key.name === "h") {
      toggleHistory();
    }
    if (key.ctrl && key.name === "i") {
      toggleInsights();
    }
    if (key.ctrl && key.name === "n") {
      newSession();
    }
  });

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

  let levelText: TextRenderable | null = null;
  let levelTitleText: TextRenderable | null = null;
  let progressBarText: TextRenderable | null = null;
  let xpProgressText: TextRenderable | null = null;
  let wordsText: TextRenderable | null = null;
  let totalXpText: TextRenderable | null = null;
  let streakText: TextRenderable | null = null;
  let sessionsText: TextRenderable | null = null;
  let longestStreakText: TextRenderable | null = null;
  let wordCountText: TextRenderable | null = null;
  let lineCountText: TextRenderable | null = null;
  let xpGainText: TextRenderable | null = null;
  let xpGainTimeout: NodeJS.Timeout | null = null;
  let milestoneText: TextRenderable | null = null;
  let milestoneTimeout: NodeJS.Timeout | null = null;
  let modeText: TextRenderable | null = null;
  let modeBoxRef: BoxRenderable | null = null;
  let bannerBoxRef: BoxRenderable | null = null;
  let messageText: TextRenderable | null = null;
  let middleContainer: BoxRenderable | null = null;
  let mainContainer: BoxRenderable | null = null;

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
      if (mode !== "writing") return;

      const value = input.plainText;
      const oldWordCount = countWords(currentText);
      currentText = value;
      const newWordCount = countWords(currentText);

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
          const bonusText = nextLevel ? ` → 2 XP/word bonus` : "";
          showMessageLevelUp(`⬆ LEVEL UP! ${levelInfo.title} (LVL ${levelInfo.level})${bonusText}`);
          stats = { ...stats, level: currentLevel };
          previousLevel = currentLevel;
        }
        sessionXp += xp;
      }

      updateEditor();
      updateHeaderStats();
    }
  });

  input.setText(currentText);
  input.focus();

  function updateHeaderStats() {
    const levelInfo = getLevelInfo(stats.totalXp);
    const barWidth = 30;
    const filled = Math.floor(levelInfo.progress * barWidth);
    const empty = barWidth - filled;
    const bar = "█".repeat(filled) + "░".repeat(empty);

    if (levelText) levelText.content = `LVL ${levelInfo.level}`;
    if (levelTitleText) levelTitleText.content = levelInfo.title;
    if (progressBarText) progressBarText.content = bar;
    if (xpProgressText) xpProgressText.content = `${levelInfo.currentLevelXp}/${levelInfo.nextLevelXp}`;
    if (wordsText) wordsText.content = `${prevWordCount}`;
    if (totalXpText) totalXpText.content = `${stats.totalXp}`;

    const streak = stats.currentStreak;
    let streakContent: string;
    let streakColor: string;

    if (streak === 0) {
      streakContent = "0d";
      streakColor = "#888888";
    } else {
      const fireCount = Math.min(Math.floor(streak / 3) + 1, 4);
      const fires = "🔥".repeat(fireCount);
      streakContent = `${fires} ${streak}d streak`;

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

    if (sessionsText) sessionsText.content = `${stats.totalSessions}`;
    if (longestStreakText) longestStreakText.content = `${stats.longestStreak}d`;
  }

  function updateEditor() {
    const wordCount = countWords(currentText);
    const lines = currentText.split("\n");

    if (wordCountText) wordCountText.content = `${wordCount} words · ${currentText.length} chars`;
    if (lineCountText) lineCountText.content = `Ln ${lines.length}`;
  }

  function updateModeIndicator() {
    if (modeText) modeText.content = mode.toUpperCase();
  }

  function updateMessage() {
    if (messageText) {
      messageText.content = message;
      messageText.visible = message.length > 0;
    }
  }

  function buildMiddleSection() {
    if (middleContainer) {
      middleContainer.getChildren().forEach(child => {
        middleContainer!.remove(child.id);
      });
    } else {
      middleContainer = new BoxRenderable(renderer, {
        flexDirection: "column",
        flexGrow: 1,
        paddingX: 1
      });
    }

    if (mode === "guide") {
      middleContainer.add(buildGuide());
    } else if (mode === "history") {
      middleContainer.add(buildHistory());
    } else if (mode === "insights") {
      middleContainer.add(buildInsights());
    } else {
      const editorWrapper = new BoxRenderable(renderer, {
        flexDirection: "column",
        flexGrow: 1,
        maxWidth: 100,
        minWidth: 40,
        alignSelf: "center"
      });

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

      milestoneText = new TextRenderable(renderer, {
        content: "",
        fg: "#FF00FF"
      });

      statsRow.add(wordCountText);
      statsRow.add(lineCountText);
      statsRow.add(xpGainText);
      statsRow.add(milestoneText);
      editorWrapper.add(input);
      editorWrapper.add(statsRow);
      middleContainer.add(editorWrapper);

      updateEditor();
    }

    return middleContainer;
  }

  const palette = ["#E8A0BF", "#A8D8EA", "#C8C8C8"];
  const colorNames: Record<string, string> = {
    "#E8A0BF": "Rose",
    "#A8D8EA": "Sky",
    "#C8C8C8": "Dim"
  };
  let paletteIndex = palette.indexOf(primaryColor);
  if (paletteIndex === -1) paletteIndex = 0;

  function cycleColor() {
    paletteIndex = (paletteIndex + 1) % palette.length;
    const newColor = palette[paletteIndex];
    primaryColor = newColor;
    stats = { ...stats, primaryColor: newColor };
    exportToBin(stats, SAVE_PATH);
    buildUI();
    if (bannerBoxRef) {
      bannerBoxRef.borderColor = "#FFFFFF";
      setTimeout(() => {
        if (bannerBoxRef) bannerBoxRef.borderColor = newColor;
      }, 300);
    }
  }

  function buildUI() {
    if (mainContainer) {
      renderer.root.remove(mainContainer.id);
    }

    mainContainer = new BoxRenderable(renderer, {
      flexDirection: "column",
      width: "100%",
      height: "100%"
    });

    const headerBox = new BoxRenderable(renderer, {
      flexDirection: "column",
      paddingX: 1,
      paddingBottom: 1
    });

    const bannerBox = new BoxRenderable(renderer, {
      flexDirection: "column",
      border: true,
      borderColor: primaryColor,
      paddingX: 2,
      paddingY: 1
    });
    bannerBoxRef = bannerBox;

    const titleRow = new BoxRenderable(renderer, {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      width: "100%"
    });

    titleRow.add(new TextRenderable(renderer, {
      content: "WRITESTREAK",
      fg: primaryColor,
      attributes: TextAttributes.BOLD
    }));

    titleRow.add(new TextRenderable(renderer, {
      content: `v${VERSION}`,
      fg: "#888888",
      attributes: TextAttributes.DIM
    }));

    const levelBar = new BoxRenderable(renderer, {
      flexDirection: "row",
      alignItems: "center",
      gap: 1
    });

    levelText = new TextRenderable(renderer, {
      content: "",
      fg: primaryColor,
      attributes: TextAttributes.BOLD
    });

    levelTitleText = new TextRenderable(renderer, {
      content: "",
      fg: "#AAAAAA"
    });

    levelBar.add(levelText);
    levelBar.add(levelTitleText);
    titleRow.add(levelBar);

    const colorButton = new BoxRenderable(renderer, {
      backgroundColor: primaryColor,
      paddingX: 2,
      onMouseDown: () => cycleColor()
    });
    colorButton.add(new TextRenderable(renderer, {
      content: colorNames[primaryColor] || "Color",
      fg: "#000000",
      attributes: TextAttributes.BOLD
    }));
    titleRow.add(colorButton);

    bannerBox.add(titleRow);

    const progressRow = new BoxRenderable(renderer, {
      flexDirection: "row",
      alignItems: "center",
      gap: 1,
      marginTop: 1
    });

    progressBarText = new TextRenderable(renderer, {
      content: "",
      fg: primaryColor
    });

    xpProgressText = new TextRenderable(renderer, {
      content: "",
      fg: "#888888"
    });

    progressRow.add(progressBarText);
    progressRow.add(xpProgressText);
    bannerBox.add(progressRow);

    const statsRow = new BoxRenderable(renderer, {
      flexDirection: "row",
      justifyContent: "space-between",
      width: "100%",
      marginTop: 1,
      gap: 2
    });

    const xpBlock = new BoxRenderable(renderer, { flexDirection: "column", alignItems: "center" });
    xpBlock.add(new TextRenderable(renderer, { content: "XP", fg: "#888888" }));
    totalXpText = new TextRenderable(renderer, {
      content: "",
      fg: primaryColor,
      attributes: TextAttributes.BOLD
    });
    xpBlock.add(totalXpText);

    const wordsBlock = new BoxRenderable(renderer, { flexDirection: "column", alignItems: "center" });
    wordsBlock.add(new TextRenderable(renderer, { content: "WORDS", fg: "#888888" }));
    wordsText = new TextRenderable(renderer, {
      content: "",
      fg: "#FFFFFF",
      attributes: TextAttributes.BOLD
    });
    wordsBlock.add(wordsText);

    const streakBlock = new BoxRenderable(renderer, { flexDirection: "column", alignItems: "center" });
    streakBlock.add(new TextRenderable(renderer, { content: "STREAK", fg: "#888888" }));
    streakText = new TextRenderable(renderer, {
      content: "",
      fg: "#888888",
      attributes: TextAttributes.BOLD
    });
    streakBlock.add(streakText);

    const sessionsBlock = new BoxRenderable(renderer, { flexDirection: "column", alignItems: "center" });
    sessionsBlock.add(new TextRenderable(renderer, { content: "SESSIONS", fg: "#888888" }));
    sessionsText = new TextRenderable(renderer, {
      content: "",
      fg: "#FFFFFF",
      attributes: TextAttributes.BOLD
    });
    sessionsBlock.add(sessionsText);

    const longestStreakBlock = new BoxRenderable(renderer, { flexDirection: "column", alignItems: "center" });
    longestStreakBlock.add(new TextRenderable(renderer, { content: "LONGEST", fg: "#888888" }));
    longestStreakText = new TextRenderable(renderer, {
      content: "",
      fg: "#FFD700",
      attributes: TextAttributes.BOLD
    });
    longestStreakBlock.add(longestStreakText);

    statsRow.add(xpBlock);
    statsRow.add(wordsBlock);
    statsRow.add(streakBlock);
    statsRow.add(sessionsBlock);
    statsRow.add(longestStreakBlock);
    bannerBox.add(statsRow);

    headerBox.add(bannerBox);

    mainContainer.add(headerBox);
    mainContainer.add(buildMiddleSection());

    const footerBox = new BoxRenderable(renderer, {
      flexDirection: "column",
      paddingX: 1
    });

    messageText = new TextRenderable(renderer, {
      content: "",
      fg: primaryColor,
      attributes: TextAttributes.BOLD,
      visible: false
    });

    footerBox.add(messageText);

    const statusBar = new BoxRenderable(renderer, {
      flexDirection: "row",
      justifyContent: "space-between",
      width: "100%"
    });

    const statusLeft = new BoxRenderable(renderer, {
      flexDirection: "row",
      gap: 1
    });

    const modeBox = new BoxRenderable(renderer, {
      backgroundColor: primaryColor,
      paddingX: 1,
      onMouseDown: () => cycleMode()
    });

    modeText = new TextRenderable(renderer, {
      content: mode.toUpperCase(),
      fg: "#000000",
      attributes: TextAttributes.BOLD
    });

    modeBox.add(modeText);
    modeBoxRef = modeBox;
    statusLeft.add(modeBox);
    statusLeft.add(new TextRenderable(renderer, { content: sessionTitle }));

    const statusRight = new BoxRenderable(renderer, {
      flexDirection: "row",
      gap: 1
    });

    statusRight.add(new TextRenderable(renderer, {
      content: "^N new  ^S save  ^E export  ^Q quit",
      fg: "#555555"
    }));

    statusBar.add(statusLeft);
    statusBar.add(statusRight);
    footerBox.add(statusBar);

    mainContainer.add(footerBox);
    renderer.root.add(mainContainer);

    updateHeaderStats();
  }

  buildUI();
}

main().catch(console.error);

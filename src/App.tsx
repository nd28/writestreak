import React, { useState, useCallback, useRef, useEffect } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { Editor } from "./components/Editor.js";
import { LevelBar } from "./components/LevelBar.js";
import { ScoreBar } from "./components/ScoreBar.js";
import { ScorePopups } from "./components/ScorePopup.js";
import { StatusBar } from "./components/StatusBar.js";
import { countWords, calculateXp, updateStreak } from "./game/scoring.js";
import { getLevelInfo } from "./game/levels.js";
import { exportToBin, importFromBin, getDefaultStats } from "./storage/msgpack.js";
import type { PlayerStats, ScorePopup, WritingSession } from "./types.js";

const SAVE_PATH = "./writestreak.bin";

export function App() {
  const { exit } = useApp();
  const [stats, setStats] = useState<PlayerStats>(() => {
    const loaded = importFromBin(SAVE_PATH);
    return loaded || getDefaultStats();
  });
  const [popups, setPopups] = useState<ScorePopup[]>([]);
  const [mode, setMode] = useState<"writing" | "menu" | "exported">("writing");
  const [sessionTitle] = useState(() => {
    const now = new Date();
    return `Session ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
  });
  const [message, setMessage] = useState<string | null>(null);
  const prevWordCount = useRef(stats.totalWords);

  const streakInfo = updateStreak(stats);

  const showPopup = useCallback((popup: Omit<ScorePopup, "id" | "timestamp">) => {
    const newPopup: ScorePopup = {
      ...popup,
      id: Math.random().toString(36).slice(2),
      timestamp: Date.now(),
    };
    setPopups(prev => [...prev.slice(-10), newPopup]);
  }, []);

  const showTemporaryMessage = useCallback((msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 2000);
  }, []);

  const handleTextChange = useCallback((text: string) => {
    const wordCount = countWords(text);
    const prev = prevWordCount.current;
    prevWordCount.current = wordCount;

    if (wordCount > prev) {
      const { xp, popups: newPopups } = calculateXp(wordCount, prev, streakInfo.streak);

      newPopups.forEach(p => showPopup(p));

      setStats(s => ({
        ...s,
        totalXp: s.totalXp + xp,
        totalWords: s.totalWords + (wordCount - prev),
        currentStreak: streakInfo.streak,
        longestStreak: Math.max(s.longestStreak, streakInfo.streak),
        lastWriteDate: new Date().toISOString().split("T")[0],
      }));
    }
  }, [streakInfo.streak, showPopup]);

  const saveSession = useCallback(() => {
    const session: WritingSession = {
      id: Math.random().toString(36).slice(2),
      title: sessionTitle,
      content: "",
      wordCount: prevWordCount.current,
      charCount: 0,
      startedAt: Date.now(),
      endedAt: Date.now(),
      xpEarned: 0,
    };

    setStats(s => {
      const updated = {
        ...s,
        totalSessions: s.totalSessions + 1,
        sessions: [...s.sessions, session],
      };
      exportToBin(updated, SAVE_PATH);
      return updated;
    });

    showTemporaryMessage("Session saved!");
  }, [sessionTitle, showTemporaryMessage]);

  const exportBin = useCallback(() => {
    const exportPath = `./writestreak-export-${Date.now()}.wbin`;
    exportToBin(stats, exportPath);
    setMode("exported");
    showTemporaryMessage(`Exported to ${exportPath}`);
    setTimeout(() => setMode("writing"), 2000);
  }, [stats, showTemporaryMessage]);

  useInput((input, key) => {
    if (key.ctrl && input === "q") {
      saveSession();
      setTimeout(() => exit(), 100);
    }
    if (key.ctrl && input === "s") {
      saveSession();
    }
    if (key.ctrl && input === "e") {
      exportBin();
    }
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setPopups(prev => prev.filter(p => Date.now() - p.timestamp < 3000));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const levelInfo = getLevelInfo(stats.totalXp);

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Box flexDirection="column" paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Text color="magenta" bold>WRITESTREAK</Text>
          <Text dimColor>v1.0</Text>
        </Box>

        <LevelBar
          level={levelInfo.level}
          title={levelInfo.title}
          progress={levelInfo.progress}
          currentXp={levelInfo.currentLevelXp}
          nextXp={levelInfo.nextLevelXp}
        />

        <ScoreBar
          wordCount={prevWordCount.current}
          totalXp={stats.totalXp}
          streak={stats.currentStreak}
        />
      </Box>

      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        <ScorePopups popups={popups} />
        <Editor onTextChange={handleTextChange} />
      </Box>

      <Box flexDirection="column" paddingX={1}>
        {message && (
          <Text color="green" bold>{message}</Text>
        )}
        <StatusBar mode={mode} sessionTitle={sessionTitle} />
      </Box>
    </Box>
  );
}

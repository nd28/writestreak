import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, unlinkSync } from "node:fs";
import { exportToBin, importFromBin, getDefaultStats } from "./msgpack.js";
import type { PlayerStats, WritingSession } from "../types.js";

describe("msgpack storage", () => {
  const testFile = "./test-writestreak.bin";

  beforeEach(() => {
    if (existsSync(testFile)) {
      unlinkSync(testFile);
    }
  });

  afterEach(() => {
    if (existsSync(testFile)) {
      unlinkSync(testFile);
    }
  });

  describe("getDefaultStats", () => {
    it("returns default player stats", () => {
      const stats = getDefaultStats();
      expect(stats.totalXp).toBe(0);
      expect(stats.level).toBe(1);
      expect(stats.currentStreak).toBe(0);
      expect(stats.longestStreak).toBe(0);
      expect(stats.totalWords).toBe(0);
      expect(stats.totalSessions).toBe(0);
      expect(stats.sessions).toEqual([]);
      expect(stats.lastWriteDate).toBeNull();
      expect(stats.primaryColor).toBe("#00FF00");
    });
  });

  describe("exportToBin and importFromBin", () => {
    it("exports and imports default stats", () => {
      const stats = getDefaultStats();
      exportToBin(stats, testFile);

      const imported = importFromBin(testFile);
      expect(imported).toEqual(stats);
    });

    it("exports and imports stats with XP", () => {
      const stats: PlayerStats = {
        ...getDefaultStats(),
        totalXp: 1500,
        level: 5,
        currentStreak: 7,
        longestStreak: 12,
        totalWords: 500,
        totalSessions: 10,
      };

      exportToBin(stats, testFile);
      const imported = importFromBin(testFile);
      expect(imported).toEqual(stats);
    });

    it("exports and imports stats with sessions", () => {
      const session: WritingSession = {
        id: "test-session-1",
        title: "Test Session",
        content: "Hello world",
        wordCount: 2,
        charCount: 11,
        startedAt: 1000000,
        endedAt: 1001000,
        xpEarned: 10,
      };

      const stats: PlayerStats = {
        ...getDefaultStats(),
        sessions: [session],
        totalSessions: 1,
      };

      exportToBin(stats, testFile);
      const imported = importFromBin(testFile);
      expect(imported).toEqual(stats);
      expect(imported?.sessions).toHaveLength(1);
      expect(imported?.sessions[0].id).toBe("test-session-1");
    });

    it("exports and imports stats with multiple sessions", () => {
      const sessions: WritingSession[] = [
        {
          id: "session-1",
          title: "Session 1",
          content: "First",
          wordCount: 1,
          charCount: 5,
          startedAt: 1000,
          endedAt: 2000,
          xpEarned: 5,
        },
        {
          id: "session-2",
          title: "Session 2",
          content: "Second session",
          wordCount: 2,
          charCount: 14,
          startedAt: 3000,
          endedAt: 4000,
          xpEarned: 10,
        },
      ];

      const stats: PlayerStats = {
        ...getDefaultStats(),
        sessions,
        totalSessions: 2,
      };

      exportToBin(stats, testFile);
      const imported = importFromBin(testFile);
      expect(imported?.sessions).toHaveLength(2);
      expect(imported?.sessions[0].id).toBe("session-1");
      expect(imported?.sessions[1].id).toBe("session-2");
    });

    it("exports and imports stats with lastWriteDate", () => {
      const stats: PlayerStats = {
        ...getDefaultStats(),
        lastWriteDate: "2026-07-14",
      };

      exportToBin(stats, testFile);
      const imported = importFromBin(testFile);
      expect(imported?.lastWriteDate).toBe("2026-07-14");
    });

    it("returns null when file does not exist", () => {
      const imported = importFromBin("./nonexistent.bin");
      expect(imported).toBeNull();
    });

    it("creates file on export", () => {
      const stats = getDefaultStats();
      expect(existsSync(testFile)).toBe(false);

      exportToBin(stats, testFile);
      expect(existsSync(testFile)).toBe(true);
    });

    it("overwrites existing file on export", () => {
      const stats1: PlayerStats = {
        ...getDefaultStats(),
        totalXp: 100,
      };

      const stats2: PlayerStats = {
        ...getDefaultStats(),
        totalXp: 200,
      };

      exportToBin(stats1, testFile);
      exportToBin(stats2, testFile);

      const imported = importFromBin(testFile);
      expect(imported?.totalXp).toBe(200);
    });

    it("preserves large numbers", () => {
      const stats: PlayerStats = {
        ...getDefaultStats(),
        totalXp: 999999,
        totalWords: 1000000,
      };

      exportToBin(stats, testFile);
      const imported = importFromBin(testFile);
      expect(imported?.totalXp).toBe(999999);
      expect(imported?.totalWords).toBe(1000000);
    });

    it("preserves empty strings", () => {
      const session: WritingSession = {
        id: "test",
        title: "",
        content: "",
        wordCount: 0,
        charCount: 0,
        startedAt: 0,
        endedAt: null,
        xpEarned: 0,
      };

      const stats: PlayerStats = {
        ...getDefaultStats(),
        sessions: [session],
      };

      exportToBin(stats, testFile);
      const imported = importFromBin(testFile);
      expect(imported?.sessions[0].title).toBe("");
      expect(imported?.sessions[0].content).toBe("");
    });

    it("preserves null endedAt", () => {
      const session: WritingSession = {
        id: "test",
        title: "Test",
        content: "Test",
        wordCount: 1,
        charCount: 4,
        startedAt: 1000,
        endedAt: null,
        xpEarned: 0,
      };

      const stats: PlayerStats = {
        ...getDefaultStats(),
        sessions: [session],
      };

      exportToBin(stats, testFile);
      const imported = importFromBin(testFile);
      expect(imported?.sessions[0].endedAt).toBeNull();
    });
  });
});

describe("draft persistence (autosave)", () => {
  const draftPath = "./test-writestreak-draft.bin";

  afterEach(() => {
    if (existsSync(draftPath)) unlinkSync(draftPath);
  });

  it("defaults to no draft", () => {
    expect(getDefaultStats().draft).toBeNull();
  });

  it("round-trips a draft through the binary format", () => {
    const stats = {
      ...getDefaultStats(),
      draft: { content: "half a thought", startedAt: 1000, xpEarned: 42, updatedAt: 2000 },
    };
    exportToBin(stats, draftPath);
    const loaded = importFromBin(draftPath);
    expect(loaded?.draft).toEqual({
      content: "half a thought",
      startedAt: 1000,
      xpEarned: 42,
      updatedAt: 2000,
    });
  });

  it("round-trips a cleared draft", () => {
    exportToBin({ ...getDefaultStats(), draft: null }, draftPath);
    expect(importFromBin(draftPath)?.draft).toBeNull();
  });

  it("preserves multi-line drafts exactly", () => {
    const content = "line one\n\nline three\twith tab";
    exportToBin({ ...getDefaultStats(), draft: { content, startedAt: 1, xpEarned: 0, updatedAt: 2 } }, draftPath);
    expect(importFromBin(draftPath)?.draft?.content).toBe(content);
  });

  it("loads a pre-autosave save file, leaving draft undefined rather than throwing", () => {
    // Simulates a file written before the draft field existed.
    const legacy: any = { ...getDefaultStats() };
    delete legacy.draft;
    exportToBin(legacy, draftPath);
    const loaded = importFromBin(draftPath);
    expect(loaded).not.toBeNull();
    expect(loaded?.draft ?? null).toBeNull();
    expect(loaded?.sessions).toEqual([]);
  });

  it("keeps a draft alongside saved sessions", () => {
    const stats = {
      ...getDefaultStats(),
      totalSessions: 1,
      sessions: [{
        id: "x1", title: "t", content: "saved", wordCount: 1, charCount: 5,
        startedAt: 1, endedAt: 2, xpEarned: 3,
      }],
      draft: { content: "unsaved", startedAt: 9, xpEarned: 1, updatedAt: 10 },
    };
    exportToBin(stats, draftPath);
    const loaded = importFromBin(draftPath);
    expect(loaded?.sessions).toHaveLength(1);
    expect(loaded?.draft?.content).toBe("unsaved");
  });
});

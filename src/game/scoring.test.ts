import { describe, it, expect } from "vitest";
import { countWords, calculateXp, updateStreak } from "./scoring.js";
import type { PlayerStats } from "../types.js";

describe("scoring", () => {
  describe("countWords", () => {
    it("counts simple words", () => {
      expect(countWords("hello world")).toBe(2);
    });

    it("handles empty string", () => {
      expect(countWords("")).toBe(0);
    });

    it("handles whitespace only", () => {
      expect(countWords("   ")).toBe(0);
    });

    it("handles multiple spaces between words", () => {
      expect(countWords("hello    world")).toBe(2);
    });

    it("handles leading and trailing whitespace", () => {
      expect(countWords("  hello world  ")).toBe(2);
    });

    it("counts newlines as word separators", () => {
      expect(countWords("hello\nworld")).toBe(2);
    });

    it("counts tabs as word separators", () => {
      expect(countWords("hello\tworld")).toBe(2);
    });

    it("handles punctuation attached to words", () => {
      expect(countWords("hello, world!")).toBe(2);
    });

    it("counts numbers as words", () => {
      expect(countWords("test 123 numbers")).toBe(3);
    });

    it("handles very long text", () => {
      const text = "word ".repeat(1000);
      expect(countWords(text)).toBe(1000);
    });
  });

  describe("calculateXp", () => {
    it("awards 2 XP per word with no streak", () => {
      const { xp } = calculateXp(10, 0, 0);
      expect(xp).toBe(20);
    });

    it("returns 0 XP when no new words", () => {
      const { xp, popups } = calculateXp(10, 10, 0);
      expect(xp).toBe(0);
      expect(popups).toHaveLength(0);
    });

    it("returns 0 XP when word count decreased", () => {
      const { xp, popups } = calculateXp(5, 10, 0);
      expect(xp).toBe(0);
      expect(popups).toHaveLength(0);
    });

    it("applies streak multiplier (1 day streak = 1.1x)", () => {
      const { xp } = calculateXp(10, 0, 1);
      expect(xp).toBe(22);
    });

    it("applies streak multiplier (5 day streak = 1.5x)", () => {
      const { xp } = calculateXp(10, 0, 5);
      expect(xp).toBe(30);
    });

    it("applies streak multiplier (10 day streak = 2.0x)", () => {
      const { xp } = calculateXp(10, 0, 10);
      expect(xp).toBe(40);
    });

    it("generates XP popup", () => {
      const { popups } = calculateXp(10, 0, 0);
      expect(popups).toHaveLength(1);
      expect(popups[0].text).toBe("+20 XP");
      expect(popups[0].xp).toBe(20);
      expect(popups[0].color).toBe("#00FF00");
    });

    it("generates streak popup when streak > 0", () => {
      const { popups } = calculateXp(10, 0, 3);
      expect(popups).toHaveLength(2);
      expect(popups[1].text).toBe("3x streak!");
      expect(popups[1].xp).toBe(0);
      expect(popups[1].color).toBe("#FF6B35");
    });

    it("awards milestone bonus at 50 words", () => {
      const { xp, popups } = calculateXp(50, 40, 0);
      expect(xp).toBe(70);
      expect(popups.some(p => p.text.includes("50 words!"))).toBe(true);
    });

    it("awards milestone bonus at 100 words", () => {
      const { xp, popups } = calculateXp(100, 90, 0);
      expect(xp).toBe(120);
      expect(popups.some(p => p.text.includes("100 words!"))).toBe(true);
    });

    it("awards milestone bonus at 250 words", () => {
      const { xp, popups } = calculateXp(250, 240, 0);
      expect(xp).toBe(270);
      expect(popups.some(p => p.text.includes("250 words!"))).toBe(true);
    });

    it("awards milestone bonus at 500 words", () => {
      const { xp, popups } = calculateXp(500, 490, 0);
      expect(xp).toBe(520);
      expect(popups.some(p => p.text.includes("500 words!"))).toBe(true);
    });

    it("awards milestone bonus at 1000 words", () => {
      const { xp, popups } = calculateXp(1000, 990, 0);
      expect(xp).toBe(1020);
      expect(popups.some(p => p.text.includes("1000 words!"))).toBe(true);
    });

    it("does not award milestone if already passed", () => {
      const { xp, popups } = calculateXp(60, 55, 0);
      expect(xp).toBe(10);
      expect(popups.some(p => p.text.includes("words!"))).toBe(false);
    });

    it("awards multiple milestones if crossed", () => {
      const { xp, popups } = calculateXp(100, 40, 0);
      expect(xp).toBe(270);
      expect(popups.filter(p => p.text.includes("words!"))).toHaveLength(2);
    });

    it("uses gold color for streak XP popup", () => {
      const { popups } = calculateXp(10, 0, 1);
      expect(popups[0].color).toBe("#FFD700");
    });
  });

  describe("updateStreak", () => {
    const makeStats = (lastWriteDate: string | null, currentStreak: number): PlayerStats => ({
      totalXp: 0,
      level: 1,
      currentStreak,
      longestStreak: currentStreak,
      totalWords: 0,
      totalSessions: 0,
      sessions: [],
      lastWriteDate,
      primaryColor: "#00FF00",
      guideSeen: false,
    });

    it("returns streak 1 when first write", () => {
      const stats = makeStats(null, 0);
      const result = updateStreak(stats);
      expect(result.streak).toBe(1);
      expect(result.streakBonus).toBe(false);
    });

    it("maintains streak when writing same day", () => {
      const today = new Date().toISOString().split("T")[0];
      const stats = makeStats(today, 5);
      const result = updateStreak(stats);
      expect(result.streak).toBe(5);
      expect(result.streakBonus).toBe(false);
    });

    it("increments streak when writing consecutive day", () => {
      const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
      const stats = makeStats(yesterday, 5);
      const result = updateStreak(stats);
      expect(result.streak).toBe(6);
      expect(result.streakBonus).toBe(true);
    });

    it("resets streak when gap > 1 day", () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().split("T")[0];
      const stats = makeStats(twoDaysAgo, 5);
      const result = updateStreak(stats);
      expect(result.streak).toBe(1);
      expect(result.streakBonus).toBe(true);
    });

    it("resets streak when gap is many days", () => {
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
      const stats = makeStats(weekAgo, 10);
      const result = updateStreak(stats);
      expect(result.streak).toBe(1);
      expect(result.streakBonus).toBe(true);
    });
  });
});

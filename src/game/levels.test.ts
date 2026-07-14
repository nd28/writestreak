import { describe, it, expect } from "vitest";
import { getLevelInfo, LEVELS } from "./levels.js";

describe("levels", () => {
  describe("LEVELS", () => {
    it("has 12 levels", () => {
      expect(LEVELS).toHaveLength(12);
    });

    it("starts at level 1 with 0 XP", () => {
      expect(LEVELS[0].level).toBe(1);
      expect(LEVELS[0].xpRequired).toBe(0);
    });

    it("ends at level 12", () => {
      expect(LEVELS[11].level).toBe(12);
    });

    it("has increasing XP requirements", () => {
      for (let i = 1; i < LEVELS.length; i++) {
        expect(LEVELS[i].xpRequired).toBeGreaterThan(LEVELS[i - 1].xpRequired);
      }
    });

    it("has unique titles", () => {
      const titles = LEVELS.map(l => l.title);
      expect(new Set(titles).size).toBe(titles.length);
    });
  });

  describe("getLevelInfo", () => {
    it("returns level 1 at 0 XP", () => {
      const info = getLevelInfo(0);
      expect(info.level).toBe(1);
      expect(info.title).toBe("Novice Scribe");
      expect(info.currentLevelXp).toBe(0);
      expect(info.nextLevelXp).toBe(100);
      expect(info.progress).toBe(0);
    });

    it("returns level 1 at 50 XP", () => {
      const info = getLevelInfo(50);
      expect(info.level).toBe(1);
      expect(info.currentLevelXp).toBe(50);
      expect(info.progress).toBe(0.5);
    });

    it("returns level 2 at 100 XP", () => {
      const info = getLevelInfo(100);
      expect(info.level).toBe(2);
      expect(info.title).toBe("Apprentice Writer");
      expect(info.currentLevelXp).toBe(0);
      expect(info.nextLevelXp).toBe(200);
    });

    it("returns level 2 at 200 XP", () => {
      const info = getLevelInfo(200);
      expect(info.level).toBe(2);
      expect(info.currentLevelXp).toBe(100);
      expect(info.progress).toBe(0.5);
    });

    it("returns level 3 at 300 XP", () => {
      const info = getLevelInfo(300);
      expect(info.level).toBe(3);
      expect(info.title).toBe("Journeyman Author");
    });

    it("returns level 5 at 1000 XP", () => {
      const info = getLevelInfo(1000);
      expect(info.level).toBe(5);
      expect(info.title).toBe("Veteran Storyteller");
    });

    it("returns level 10 at 5500 XP", () => {
      const info = getLevelInfo(5500);
      expect(info.level).toBe(10);
      expect(info.title).toBe("Mythic Wordsmith");
    });

    it("returns level 12 at 10000 XP", () => {
      const info = getLevelInfo(10000);
      expect(info.level).toBe(12);
      expect(info.title).toBe("God of Words");
    });

    it("returns level 12 at max level with progress 1", () => {
      const info = getLevelInfo(15000);
      expect(info.level).toBe(12);
      expect(info.progress).toBe(1);
      expect(info.nextLevelXp).toBe(0);
    });

    it("calculates progress correctly mid-level", () => {
      const info = getLevelInfo(150);
      expect(info.level).toBe(2);
      expect(info.currentLevelXp).toBe(50);
      expect(info.nextLevelXp).toBe(200);
      expect(info.progress).toBe(0.25);
    });

    it("handles XP between levels correctly", () => {
      const info = getLevelInfo(750);
      expect(info.level).toBe(4);
      expect(info.currentLevelXp).toBe(150);
      expect(info.nextLevelXp).toBe(400);
    });
  });
});

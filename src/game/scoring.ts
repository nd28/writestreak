import type { PlayerStats, ScorePopup } from "../types.js";

const XP_PER_WORD = 2;
const STREAK_MULTIPLIER = 0.1;
const MILESTONE_BONUSES = [50, 100, 250, 500, 1000];

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

export function calculateXp(
  wordCount: number,
  previousWordCount: number,
  streak: number
): { xp: number; popups: Omit<ScorePopup, "id" | "timestamp">[] } {
  const newWords = wordCount - previousWordCount;
  if (newWords <= 0) return { xp: 0, popups: [] };

  const popups: Omit<ScorePopup, "id" | "timestamp">[] = [];
  const multiplier = 1 + streak * STREAK_MULTIPLIER;
  const baseXp = Math.floor(newWords * XP_PER_WORD * multiplier);

  popups.push({
    text: `+${baseXp} XP`,
    xp: baseXp,
    color: streak > 0 ? "#FFD700" : "#00FF00",
  });

  if (streak > 0) {
    popups.push({
      text: `${streak}x streak!`,
      xp: 0,
      color: "#FF6B35",
    });
  }

  for (const milestone of MILESTONE_BONUSES) {
    if (previousWordCount < milestone && wordCount >= milestone) {
      const bonus = milestone;
      popups.push({
        text: `${milestone} words! +${bonus} XP`,
        xp: bonus,
        color: "#FF00FF",
      });
    }
  }

  const milestoneXp = popups
    .filter(p => p.xp > 0 && p.text.includes("words!"))
    .reduce((sum, p) => sum + p.xp, 0);

  return { xp: baseXp + milestoneXp, popups };
}

export function updateStreak(stats: PlayerStats): {
  streak: number;
  streakBonus: boolean;
} {
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

  if (stats.lastWriteDate === today) {
    return { streak: stats.currentStreak, streakBonus: false };
  }

  if (stats.lastWriteDate === yesterday) {
    return { streak: stats.currentStreak + 1, streakBonus: true };
  }

  return { streak: 1, streakBonus: stats.lastWriteDate !== null };
}

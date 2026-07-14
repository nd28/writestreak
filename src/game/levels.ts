import type { LevelThreshold } from "../types.js";

export const LEVELS: LevelThreshold[] = [
  { level: 1, xpRequired: 0, title: "Novice Scribe" },
  { level: 2, xpRequired: 100, title: "Apprentice Writer" },
  { level: 3, xpRequired: 300, title: "Journeyman Author" },
  { level: 4, xpRequired: 600, title: "Skilled Wordsmith" },
  { level: 5, xpRequired: 1000, title: "Veteran Storyteller" },
  { level: 6, xpRequired: 1500, title: "Master Penman" },
  { level: 7, xpRequired: 2200, title: "Elite Novelist" },
  { level: 8, xpRequired: 3000, title: "Grand Author" },
  { level: 9, xpRequired: 4000, title: "Legendary Writer" },
  { level: 10, xpRequired: 5500, title: "Mythic Wordsmith" },
  { level: 11, xpRequired: 7500, title: "Transcendent Scribe" },
  { level: 12, xpRequired: 10000, title: "God of Words" },
];

export function getLevelInfo(totalXp: number): {
  level: number;
  title: string;
  currentLevelXp: number;
  nextLevelXp: number;
  progress: number;
} {
  let current = LEVELS[0];
  let next = LEVELS[1];

  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (totalXp >= LEVELS[i].xpRequired) {
      current = LEVELS[i];
      next = LEVELS[i + 1] || null as any;
      break;
    }
  }

  if (!next) {
    return {
      level: current.level,
      title: current.title,
      currentLevelXp: totalXp - current.xpRequired,
      nextLevelXp: 0,
      progress: 1,
    };
  }

  const xpInLevel = totalXp - current.xpRequired;
  const xpNeeded = next.xpRequired - current.xpRequired;

  return {
    level: current.level,
    title: current.title,
    currentLevelXp: xpInLevel,
    nextLevelXp: xpNeeded,
    progress: xpInLevel / xpNeeded,
  };
}

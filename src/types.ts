export interface WritingSession {
  id: string;
  title: string;
  content: string;
  wordCount: number;
  charCount: number;
  startedAt: number;
  endedAt: number | null;
  xpEarned: number;
}

export interface PlayerStats {
  totalXp: number;
  level: number;
  currentStreak: number;
  longestStreak: number;
  totalWords: number;
  totalSessions: number;
  sessions: WritingSession[];
  lastWriteDate: string | null;
}

export interface ScorePopup {
  id: string;
  text: string;
  xp: number;
  timestamp: number;
  color: string;
}

export interface LevelThreshold {
  level: number;
  xpRequired: number;
  title: string;
}

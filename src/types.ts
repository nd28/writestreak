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

/** Unsaved editor content, persisted so a crash or Ctrl+C cannot lose it. */
export interface DraftSession {
  content: string;
  startedAt: number;
  xpEarned: number;
  updatedAt: number;
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
  primaryColor: string;
  guideSeen: boolean;
  /** Optional: absent in save files written before autosave existed. */
  draft?: DraftSession | null;
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

import { encode, decode } from "@msgpack/msgpack";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import type { PlayerStats, WritingSession } from "../types.js";

const MAGIC = new Uint8Array([0x57, 0x52, 0x54, 0x53]);
const VERSION = 1;

export interface WriteStreakBin {
  magic: Uint8Array;
  version: number;
  exportedAt: number;
  stats: PlayerStats;
}

export function exportToBin(stats: PlayerStats, filepath: string): void {
  const payload: WriteStreakBin = {
    magic: MAGIC,
    version: VERSION,
    exportedAt: Date.now(),
    stats,
  };

  const encoded = encode(payload);
  writeFileSync(filepath, encoded);
}

export function importFromBin(filepath: string): PlayerStats | null {
  if (!existsSync(filepath)) return null;

  const data = readFileSync(filepath);
  const decoded = decode(data) as WriteStreakBin;

  if (
    !decoded.magic ||
    decoded.magic[0] !== MAGIC[0] ||
    decoded.magic[1] !== MAGIC[1] ||
    decoded.magic[2] !== MAGIC[2] ||
    decoded.magic[3] !== MAGIC[3]
  ) {
    return null;
  }

  return decoded.stats;
}

export function getDefaultStats(): PlayerStats {
  return {
    totalXp: 0,
    level: 1,
    currentStreak: 0,
    longestStreak: 0,
    totalWords: 0,
    totalSessions: 0,
    sessions: [],
    lastWriteDate: null,
    primaryColor: "#00FF00",
    guideSeen: false,
  };
}

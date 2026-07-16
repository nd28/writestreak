import type { WritingSession } from "../types.js";

export type FilterKind = "all" | "date" | "words" | "xp";

export interface FilterInput {
  query: string;
  filter: FilterKind;
  page: number;
  pageSize: number;
}

export interface FilterResult {
  pageItems: WritingSession[];
  total: number;
  totalPages: number;
  page: number;
}

export const PAGE_SIZE = 20;
export const FILTER_ORDER: FilterKind[] = ["all", "date", "words", "xp"];

const DAY_MS = 24 * 60 * 60 * 1000;

export function filterSessions(
  sessions: WritingSession[],
  input: FilterInput
): FilterResult {
  const { query, filter, pageSize } = input;
  const q = query.trim().toLowerCase();

  const filtered = sessions.filter((s) => {
    if (q.length > 0) {
      const hay = (s.title + " " + s.content).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (filter === "date") {
      const cutoff = Date.now() - 7 * DAY_MS;
      if (s.startedAt < cutoff) return false;
    } else if (filter === "words") {
      if (s.wordCount < 50) return false;
    } else if (filter === "xp") {
      if (s.xpEarned < 50) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    const diff = (b.startedAt || 0) - (a.startedAt || 0);
    if (diff !== 0) return diff;
    return 0;
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  let page = input.page;
  if (page < 0) page = 0;
  if (page > totalPages - 1) page = totalPages - 1;

  const start = page * pageSize;
  const pageItems = filtered.slice(start, start + pageSize);

  return { pageItems, total, totalPages, page };
}
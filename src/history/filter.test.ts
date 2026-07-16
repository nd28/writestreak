import { describe, it, expect } from "vitest";
import { filterSessions, PAGE_SIZE, FILTER_ORDER } from "./filter.js";
import type { WritingSession } from "../types.js";

function makeSession(over: Partial<WritingSession> = {}): WritingSession {
  return {
    id: "id-" + Math.random().toString(36).slice(2),
    title: "Session",
    content: "default content",
    wordCount: 1,
    charCount: 1,
    startedAt: Date.now(),
    endedAt: null,
    xpEarned: 10,
    ...over,
  };
}

describe("filterSessions", () => {
  it("returns empty result for empty sessions", () => {
    const r = filterSessions([], { query: "", filter: "all", page: 0, pageSize: PAGE_SIZE });
    expect(r.total).toBe(0);
    expect(r.totalPages).toBe(1);
    expect(r.page).toBe(0);
    expect(r.pageItems).toEqual([]);
  });

  it("returns all sessions newest-first when no query/filter", () => {
    const a = makeSession({ id: "a", startedAt: 1000 });
    const b = makeSession({ id: "b", startedAt: 2000 });
    const r = filterSessions([a, b], { query: "", filter: "all", page: 0, pageSize: PAGE_SIZE });
    expect(r.pageItems.map(s => s.id)).toEqual(["b", "a"]);
    expect(r.total).toBe(2);
  });

  it("matches query case-insensitively against content", () => {
    const a = makeSession({ id: "a", content: "Hello WORLD" });
    const b = makeSession({ id: "b", content: "nothing here" });
    const r = filterSessions([a, b], { query: "world", filter: "all", page: 0, pageSize: PAGE_SIZE });
    expect(r.pageItems.map(s => s.id)).toEqual(["a"]);
  });

  it("matches query case-insensitively against title", () => {
    const a = makeSession({ id: "a", title: "Morning Pages" });
    const b = makeSession({ id: "b", title: "Other" });
    const r = filterSessions([a, b], { query: "MORNING", filter: "all", page: 0, pageSize: PAGE_SIZE });
    expect(r.pageItems.map(s => s.id)).toEqual(["a"]);
  });

  it("empty query matches all", () => {
    const a = makeSession({ id: "a", content: "x" });
    const r = filterSessions([a], { query: "", filter: "all", page: 0, pageSize: PAGE_SIZE });
    expect(r.total).toBe(1);
  });

  it("date filter keeps only sessions within last 7 days", () => {
    const now = Date.now();
    const recent = makeSession({ id: "r", startedAt: now - 1000 * 60 * 60 * 24 });
    const old = makeSession({ id: "o", startedAt: now - 1000 * 60 * 60 * 24 * 30 });
    const r = filterSessions([recent, old], { query: "", filter: "date", page: 0, pageSize: PAGE_SIZE });
    expect(r.pageItems.map(s => s.id)).toEqual(["r"]);
  });

  it("words filter keeps only wordCount >= 50", () => {
    const big = makeSession({ id: "big", wordCount: 100 });
    const small = makeSession({ id: "small", wordCount: 10 });
    const r = filterSessions([big, small], { query: "", filter: "words", page: 0, pageSize: PAGE_SIZE });
    expect(r.pageItems.map(s => s.id)).toEqual(["big"]);
  });

  it("xp filter keeps only xpEarned >= 50", () => {
    const high = makeSession({ id: "high", xpEarned: 200 });
    const low = makeSession({ id: "low", xpEarned: 5 });
    const r = filterSessions([high, low], { query: "", filter: "xp", page: 0, pageSize: PAGE_SIZE });
    expect(r.pageItems.map(s => s.id)).toEqual(["high"]);
  });

  it("query and filter combine (AND)", () => {
    const a = makeSession({ id: "a", content: "world", wordCount: 100 });
    const b = makeSession({ id: "b", content: "world", wordCount: 5 });
    const c = makeSession({ id: "c", content: "other", wordCount: 100 });
    const r = filterSessions([a, b, c], { query: "world", filter: "words", page: 0, pageSize: PAGE_SIZE });
    expect(r.pageItems.map(s => s.id)).toEqual(["a"]);
  });

  it("paginates with pageSize and returns totalPages", () => {
    const sessions: WritingSession[] = Array.from({ length: 55 }, (_, i) =>
      makeSession({ id: "s" + i, startedAt: i })
    );
    const r = filterSessions(sessions, { query: "", filter: "all", page: 0, pageSize: 20 });
    expect(r.total).toBe(55);
    expect(r.totalPages).toBe(3);
    expect(r.pageItems).toHaveLength(20);
  });

  it("page 2 contains the last 15 of 55", () => {
    const sessions: WritingSession[] = Array.from({ length: 55 }, (_, i) =>
      makeSession({ id: "s" + i, startedAt: i })
    );
    const r = filterSessions(sessions, { query: "", filter: "all", page: 2, pageSize: 20 });
    expect(r.pageItems).toHaveLength(15);
  });

  it("out-of-range page clamps to last page", () => {
    const sessions: WritingSession[] = Array.from({ length: 55 }, (_, i) =>
      makeSession({ id: "s" + i, startedAt: i })
    );
    const r = filterSessions(sessions, { query: "", filter: "all", page: 99, pageSize: 20 });
    expect(r.page).toBe(2);
    expect(r.pageItems).toHaveLength(15);
  });

  it("stable sort on equal startedAt", () => {
    const a = makeSession({ id: "a", startedAt: 1000 });
    const b = makeSession({ id: "b", startedAt: 1000 });
    const r = filterSessions([a, b], { query: "", filter: "all", page: 0, pageSize: 20 });
    expect(r.pageItems.map(s => s.id)).toEqual(["a", "b"]);
  });

  it("PAGE_SIZE is 20", () => {
    expect(PAGE_SIZE).toBe(20);
  });

  it("FILTER_ORDER is all/date/words/xp", () => {
    expect(FILTER_ORDER).toEqual(["all", "date", "words", "xp"]);
  });
});
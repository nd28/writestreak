import { describe, it, expect } from "vitest";
import { renderList, renderShow, renderStats, resolveTarget, newestFirst, stamp, summarise, helpText } from "./render.js";
import { resolveSavePath, runCli, DEFAULT_SAVE_PATH } from "./run.js";
import { getDefaultStats } from "../storage/msgpack.js";
import type { ListCommand } from "./args.js";
import type { PlayerStats, WritingSession } from "../types.js";

const T = (y: number, mo: number, d: number, h = 12, mi = 0) => new Date(y, mo, d, h, mi).getTime();

function session(over: Partial<WritingSession> & { id: string }): WritingSession {
  return {
    title: `Session ${over.id}`,
    content: "some words here",
    wordCount: 3,
    charCount: 15,
    startedAt: T(2026, 7, 20),
    endedAt: T(2026, 7, 20, 12, 30),
    xpEarned: 10,
    ...over,
  } as WritingSession;
}

function statsWith(sessions: WritingSession[]): PlayerStats {
  return { ...getDefaultStats(), sessions, totalSessions: sessions.length, totalXp: 300 };
}

const OLD = session({ id: "aaa111", startedAt: T(2026, 6, 1), title: "Oldest" });
const MID = session({ id: "bbb222", startedAt: T(2026, 6, 15), title: "Middle", wordCount: 120, xpEarned: 400 });
const NEW = session({ id: "ccc333", startedAt: T(2026, 7, 1), title: "Newest", content: "fog on the water" });
const STATS = statsWith([OLD, NEW, MID]);

const listCmd = (over: Partial<ListCommand> = {}): ListCommand => ({
  kind: "list", json: false, limit: 20, page: 0,
  query: "", filter: "all", content: false, file: null, ...over,
});

describe("newestFirst", () => {
  it("orders by start time descending without mutating the input", () => {
    const input = [OLD, NEW, MID];
    expect(newestFirst(input).map(s => s.id)).toEqual(["ccc333", "bbb222", "aaa111"]);
    expect(input.map(s => s.id)).toEqual(["aaa111", "ccc333", "bbb222"]);
  });
});

describe("stamp", () => {
  it("formats a sortable local timestamp", () => {
    expect(stamp(T(2026, 7, 5, 9, 7))).toBe("2026-08-05 09:07");
  });

  it("does not throw on an invalid timestamp", () => {
    expect(stamp(NaN).trim()).toBe("unknown");
  });
});

describe("resolveTarget", () => {
  it("resolves latest, index and full id", () => {
    expect(resolveTarget(STATS.sessions, "latest")).toMatchObject({ index: 1 });
    expect(resolveTarget(STATS.sessions, "2")).toMatchObject({ index: 2 });
    expect(resolveTarget(STATS.sessions, "aaa111")).toMatchObject({ index: 3 });
  });

  it("resolves a unique id prefix", () => {
    expect(resolveTarget(STATS.sessions, "ccc")).toMatchObject({ index: 1 });
  });

  it("reports an ambiguous prefix rather than guessing", () => {
    const dupes = [session({ id: "dup111" }), session({ id: "dup222", startedAt: T(2026, 7, 2) })];
    expect(resolveTarget(dupes, "dup")).toEqual({ error: 'id prefix "dup" matches 2 sessions' });
  });

  it("reports out-of-range indexes and unknown ids", () => {
    expect(resolveTarget(STATS.sessions, "0")).toEqual({ error: "index 0 out of range (1-3)" });
    expect(resolveTarget(STATS.sessions, "9")).toEqual({ error: "index 9 out of range (1-3)" });
    expect(resolveTarget(STATS.sessions, "zzz")).toEqual({ error: 'no session matching "zzz"' });
  });

  it("reports an empty history", () => {
    expect(resolveTarget([], "latest")).toEqual({ error: "no sessions recorded yet" });
  });
});

describe("renderList", () => {
  it("prints a header, one row per session and a count footer", () => {
    const out = renderList(STATS, listCmd());
    expect(out).toContain("ID");
    expect(out).toContain("WORDS");
    expect(out.split("\n").filter(l => /^\s+\d+\s+\w/.test(l))).toHaveLength(3);
    expect(out).toContain("3 sessions matched · page 1/1");
  });

  it("numbers rows newest-first", () => {
    const lines = renderList(STATS, listCmd()).split("\n");
    expect(lines[1]).toContain("ccc333");
    expect(lines[3]).toContain("aaa111");
  });

  it("keeps indexes stable under a filter so they stay valid show targets", () => {
    const out = renderList(STATS, listCmd({ query: "fog" }));
    // Only the newest matches, and it must still be index 1.
    expect(out).toContain("ccc333");
    expect(out).not.toContain("aaa111");
    expect(out).toContain("1 session matched");
  });

  it("paginates", () => {
    const page2 = renderList(STATS, listCmd({ limit: 2, page: 1 }));
    expect(page2).toContain("aaa111");
    expect(page2).toContain("page 2/2");
  });

  it("says so when nothing matches", () => {
    expect(renderList(STATS, listCmd({ query: "nothing-matches-this" }))).toBe("No sessions match.");
  });

  it("emits parseable JSON without content by default", () => {
    const parsed = JSON.parse(renderList(STATS, listCmd({ json: true })));
    expect(parsed).toMatchObject({ total: 3, page: 1, totalPages: 1, count: 3 });
    expect(parsed.sessions[0].id).toBe("ccc333");
    expect(parsed.sessions[0].content).toBeUndefined();
  });

  it("includes content only when asked", () => {
    const parsed = JSON.parse(renderList(STATS, listCmd({ json: true, content: true })));
    expect(parsed.sessions[0].content).toBe("fog on the water");
  });

  it("emits valid JSON for an empty match", () => {
    const parsed = JSON.parse(renderList(STATS, listCmd({ json: true, query: "zzz" })));
    expect(parsed.count).toBe(0);
    expect(parsed.sessions).toEqual([]);
  });
});

describe("renderShow", () => {
  it("raw prints only the session text", () => {
    expect(renderShow(NEW, 1, STATS, "9.9.9", "raw")).toBe("fog on the water");
  });

  it("json round-trips the session fields", () => {
    const parsed = JSON.parse(renderShow(NEW, 1, STATS, "9.9.9", "json"));
    expect(parsed).toMatchObject({ index: 1, id: "ccc333", content: "fog on the water", wordCount: 3 });
    expect(parsed.when).toMatch(/\d{2} \w{3} \d{4}/);
  });

  it("delegates md, txt and html to the share formatter", () => {
    expect(renderShow(NEW, 1, STATS, "9.9.9", "md")).toContain("# Newest");
    expect(renderShow(NEW, 1, STATS, "9.9.9", "html")).toContain("<!doctype html>");
    expect(renderShow(NEW, 1, STATS, "9.9.9", "txt")).toContain("fog on the water");
  });
});

describe("renderStats", () => {
  it("describes level progress as progress within the level", () => {
    const out = renderStats(STATS, "9.9.9", false);
    expect(out).toContain("into this level");
    expect(out).not.toMatch(/next level at \d/);
  });

  it("emits JSON with unambiguous progress fields", () => {
    const parsed = JSON.parse(renderStats(STATS, "9.9.9", true));
    expect(parsed).toHaveProperty("levelProgressXp");
    expect(parsed).toHaveProperty("levelSpanXp");
    expect(parsed).toHaveProperty("atMaxLevel");
    expect(parsed.totalSessions).toBe(3);
  });

  it("reports never for a profile that has not written", () => {
    expect(renderStats(getDefaultStats(), "9.9.9", false)).toContain("never");
  });
});

describe("summarise", () => {
  it("defaults a missing xpEarned to 0", () => {
    const legacy = { ...NEW, xpEarned: undefined } as unknown as WritingSession;
    expect(summarise(legacy, 1, false).xpEarned).toBe(0);
  });
});

describe("helpText", () => {
  it("documents each subcommand and the exit codes", () => {
    const help = helpText("9.9.9");
    for (const token of ["list", "show", "stats", "--json", "--format", "--file", "Exit codes"]) {
      expect(help).toContain(token);
    }
  });
});

describe("runCli", () => {
  it("returns help and version without touching the filesystem", () => {
    expect(runCli({ kind: "version" }, "9.9.9")).toEqual({ stdout: "9.9.9", stderr: "", code: 0 });
    expect(runCli({ kind: "help" }, "9.9.9").code).toBe(0);
  });

  it("reports parse errors on stderr with exit 1", () => {
    const result = runCli({ kind: "error", message: "bad flag" }, "9.9.9");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("bad flag");
    expect(result.stdout).toBe("");
  });

  it("fails cleanly when the save file is missing", () => {
    const result = runCli({ kind: "stats", json: false, file: "/definitely/not/here.bin" }, "9.9.9");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("no save file");
  });

  it("is a no-op for the tui command", () => {
    expect(runCli({ kind: "tui" }, "9.9.9")).toEqual({ stdout: "", stderr: "", code: 0 });
  });
});

describe("resolveSavePath", () => {
  it("prefers the flag, then the env var, then the default", () => {
    expect(resolveSavePath("/flag.bin", { WRITESTREAK_FILE: "/env.bin" } as NodeJS.ProcessEnv)).toBe("/flag.bin");
    expect(resolveSavePath(null, { WRITESTREAK_FILE: "/env.bin" } as NodeJS.ProcessEnv)).toBe("/env.bin");
    expect(resolveSavePath(null, {} as NodeJS.ProcessEnv)).toBe(DEFAULT_SAVE_PATH);
  });
});

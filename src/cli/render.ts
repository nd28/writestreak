import { filterSessions } from "../history/filter.js";
import { getLevelInfo } from "../game/levels.js";
import { formatSession, formatDateTime } from "../share/format.js";
import type { ListCommand, ShowCommand, ShowFormat } from "./args.js";
import type { PlayerStats, WritingSession } from "../types.js";

/** Sessions newest-first — the order every command reports in. */
export function newestFirst(sessions: WritingSession[]): WritingSession[] {
  return [...sessions].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
}

/** Short, stable stamp for table output: 2026-08-25 14:32 */
export function stamp(ts: number): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "unknown         ";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function oneLine(text: string, width: number): string {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  if (flat.length <= width) return flat;
  return flat.slice(0, Math.max(0, width - 1)) + "…";
}

export interface SessionSummary {
  index: number;
  id: string;
  title: string;
  startedAt: number;
  endedAt: number | null;
  wordCount: number;
  charCount: number;
  xpEarned: number;
  content?: string;
}

export function summarise(session: WritingSession, index: number, withContent: boolean): SessionSummary {
  const summary: SessionSummary = {
    index,
    id: session.id,
    title: session.title,
    startedAt: session.startedAt,
    endedAt: session.endedAt ?? null,
    wordCount: session.wordCount ?? 0,
    charCount: session.charCount ?? 0,
    xpEarned: session.xpEarned || 0,
  };
  if (withContent) summary.content = session.content ?? "";
  return summary;
}

/** Resolves `latest`, a 1-based index, or an id (full or unique prefix). */
export function resolveTarget(
  sessions: WritingSession[],
  target: string
): { session: WritingSession; index: number } | { error: string } {
  const ordered = newestFirst(sessions);
  if (ordered.length === 0) return { error: "no sessions recorded yet" };

  if (target === "latest") return { session: ordered[0], index: 1 };

  if (/^\d+$/.test(target)) {
    const index = Number(target);
    if (index < 1 || index > ordered.length) {
      return { error: `index ${index} out of range (1-${ordered.length})` };
    }
    return { session: ordered[index - 1], index };
  }

  const exact = ordered.findIndex(s => s.id === target);
  if (exact !== -1) return { session: ordered[exact], index: exact + 1 };

  const prefixed = ordered
    .map((session, i) => ({ session, index: i + 1 }))
    .filter(({ session }) => session.id.startsWith(target));
  if (prefixed.length === 1) return prefixed[0];
  if (prefixed.length > 1) return { error: `id prefix "${target}" matches ${prefixed.length} sessions` };

  return { error: `no session matching "${target}"` };
}

export function renderList(stats: PlayerStats, args: ListCommand): string {
  const ordered = newestFirst(stats.sessions);
  const pageSize = Number.isFinite(args.limit) ? args.limit : Math.max(1, ordered.length);
  const { pageItems, total, totalPages, page } = filterSessions(ordered, {
    query: args.query,
    filter: args.filter,
    page: args.page,
    pageSize,
  });

  // Index is the session's position in the whole newest-first list, so it stays
  // valid as a `show` target regardless of the filter or page in use.
  const indexOf = new Map(ordered.map((s, i) => [s.id, i + 1]));
  const rows = pageItems.map(s => summarise(s, indexOf.get(s.id) ?? 0, args.content));

  if (args.json) {
    return JSON.stringify(
      { total, page: page + 1, totalPages, count: rows.length, sessions: rows },
      null,
      2
    );
  }

  if (rows.length === 0) return "No sessions match.";

  const idWidth = Math.max(2, ...rows.map(r => r.id.length));
  const header = `${"#".padStart(4)}  ${"ID".padEnd(idWidth)}  ${"DATE".padEnd(16)}  ${"WORDS".padStart(6)}  ${"XP".padStart(6)}  TITLE`;
  const body = rows.map(r =>
    `${String(r.index).padStart(4)}  ${r.id.padEnd(idWidth)}  ${stamp(r.startedAt)}  ${String(r.wordCount).padStart(6)}  ${String(r.xpEarned).padStart(6)}  ${oneLine(r.title, 40)}`
  );
  const footer = `\n${total} session${total === 1 ? "" : "s"} matched · page ${page + 1}/${totalPages}`;
  return [header, ...body].join("\n") + footer;
}

export function renderShow(
  session: WritingSession,
  index: number,
  stats: PlayerStats,
  version: string,
  format: ShowFormat
): string {
  if (format === "raw") return session.content ?? "";

  if (format === "json") {
    return JSON.stringify({ ...summarise(session, index, true), when: formatDateTime(session.startedAt) }, null, 2);
  }

  const levelInfo = getLevelInfo(stats.totalXp);
  return formatSession(
    session,
    {
      level: levelInfo.level,
      levelTitle: levelInfo.title,
      streak: stats.currentStreak,
      version,
    },
    format
  );
}

export function renderStats(stats: PlayerStats, version: string, json: boolean): string {
  const levelInfo = getLevelInfo(stats.totalXp);
  // getLevelInfo reports progress *within* the level: currentLevelXp of
  // nextLevelXp, with nextLevelXp === 0 at the final level.
  const atMaxLevel = levelInfo.nextLevelXp === 0;
  const payload = {
    version,
    totalXp: stats.totalXp,
    level: levelInfo.level,
    levelTitle: levelInfo.title,
    levelProgressXp: levelInfo.currentLevelXp,
    levelSpanXp: levelInfo.nextLevelXp,
    atMaxLevel,
    currentStreak: stats.currentStreak,
    longestStreak: stats.longestStreak,
    totalWords: stats.totalWords,
    totalSessions: stats.sessions.length,
    lastWriteDate: stats.lastWriteDate,
  };

  if (json) return JSON.stringify(payload, null, 2);

  return [
    `Level      ${payload.level} · ${payload.levelTitle}`,
    `XP         ${payload.totalXp} total` + (atMaxLevel
      ? " · max level"
      : ` · ${payload.levelProgressXp}/${payload.levelSpanXp} into this level`),
    `Streak     ${payload.currentStreak} day(s), longest ${payload.longestStreak}`,
    `Words      ${payload.totalWords}`,
    `Sessions   ${payload.totalSessions}`,
    `Last wrote ${payload.lastWriteDate ?? "never"}`,
  ].join("\n");
}

export function helpText(version: string): string {
  return `writestreak v${version} — gamified terminal writing

USAGE
  writestreak                     Launch the TUI
  writestreak list [options]      List sessions, newest first
  writestreak show <target>       Print one session
  writestreak stats [--json]      Print player stats
  writestreak help | version

SHOW TARGET
  latest            The most recent session
  <n>               1-based index from \`list\` (1 = newest)
  <id>              Full session id, or a unique prefix

OPTIONS
  --json            Machine-readable output (list, show, stats)
  --format <fmt>    show: md | txt | html | json | raw   (default txt)
                    raw prints only the session text, nothing else
  --limit <n>       list: sessions per page (default 20)
  --all             list: no limit
  --page <n>        list: 1-based page number
  --query <text>    list: match title and content, case-insensitive
  --filter <kind>   list: all | date | words | xp
  --content         list --json: include full session text
  --file <path>     Save file to read (default ./writestreak.bin,
                    or \$WRITESTREAK_FILE)

EXAMPLES
  writestreak list --json --limit 5
  writestreak show latest --format raw
  writestreak show 3 --json
  writestreak list --query "fog" --json --content

Exit codes: 0 success · 1 error (bad args, missing file, no match)`;
}

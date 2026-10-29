import type { WritingSession } from "../types.js";

export type ShareFormat = "md" | "txt" | "html";

export interface ShareMeta {
  level: number;
  levelTitle: string;
  streak: number;
  version: string;
}

export const SHARE_FORMATS: ShareFormat[] = ["md", "txt", "html"];

export const SHARE_FORMAT_LABELS: Record<ShareFormat, string> = {
  md: "Markdown",
  txt: "Text",
  html: "HTML",
};

/** Key each format is bound to in the share prompt. */
export const SHARE_FORMAT_KEYS: Record<string, ShareFormat> = {
  m: "md",
  t: "txt",
  h: "html",
};

export const SHARE_FILE_PREFIX = "writestreak-session";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Thousands separator without toLocaleString (locale-independent output). */
export function groupNumber(n: number): string {
  const safe = Number.isFinite(n) ? n : 0;
  const digits = Math.trunc(Math.abs(safe)).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return safe < 0 ? `-${grouped}` : grouped;
}

/** "25 Aug 2026, 2:32 PM" — built from local date parts, no locale lookup. */
export function formatDateTime(ts: number): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "unknown date";
  let hour = d.getHours();
  const meridiem = hour < 12 ? "AM" : "PM";
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return `${pad2(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${hour}:${pad2(d.getMinutes())} ${meridiem}`;
}

/** null when the span is zero, negative, or not a number — caller omits the field. */
export function formatDuration(ms: number): string | null {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 1) return "<1 min";
  if (totalMin < 60) return `${totalMin} min`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
}

/** writestreak-session-2026-08-25-143210.{md,txt,html} */
export function shareFilename(ts: number, format: ShareFormat): string {
  const d = new Date(ts);
  const stamp = Number.isNaN(d.getTime())
    ? "unknown"
    : `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
  return `${SHARE_FILE_PREFIX}-${stamp}.${format}`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface SessionParts {
  title: string;
  content: string;
  stats: string[];
  when: string;
  footer: string[];
}

/** Everything the three renderers agree on, computed once. */
function sessionParts(session: WritingSession, meta: ShareMeta): SessionParts {
  const words = Number.isFinite(session.wordCount) ? session.wordCount : 0;
  const chars = Number.isFinite(session.charCount) ? session.charCount : 0;
  const xp = session.xpEarned || 0;

  const stats = [
    `${groupNumber(words)} ${words === 1 ? "word" : "words"}`,
    `${groupNumber(chars)} chars`,
    `${groupNumber(xp)} XP`,
  ];
  const duration = formatDuration((session.endedAt ?? 0) - (session.startedAt ?? 0));
  if (duration) stats.push(duration);

  const footer = [`LVL ${meta.level} ${meta.levelTitle}`];
  if (meta.streak > 0) footer.push(`\u{1F525} ${meta.streak}-day streak`);

  return {
    title: (session.title ?? "").trim() || "Untitled session",
    content: (session.content ?? "")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+$/gm, "")
      .trim(),
    stats,
    when: formatDateTime(session.startedAt),
    footer,
  };
}

/** Blank-line-separated blocks; single newlines stay as line breaks. */
function paragraphs(content: string): string[] {
  return content.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 0);
}

function renderMarkdown(p: SessionParts, meta: ShareMeta): string {
  const stats = p.stats.map((s, i) => (i === 0 || i === 2 ? `**${s}**` : s));
  return [
    `# ${p.title}`,
    "",
    `> ${stats.join(" · ")}`,
    ">",
    `> ${p.when}`,
    "",
    p.content.length > 0 ? p.content : "_(empty session)_",
    "",
    "---",
    "",
    `*Written with WriteStreak v${meta.version} — ${p.footer.join(" · ")}*`,
    "",
  ].join("\n");
}

function renderText(p: SessionParts, meta: ShareMeta): string {
  const rule = "-".repeat(60);
  return [
    p.title,
    "=".repeat(Math.max(3, Math.min(60, p.title.length))),
    "",
    p.stats.join("  ·  "),
    p.when,
    "",
    rule,
    "",
    p.content.length > 0 ? p.content : "(empty session)",
    "",
    rule,
    `Written with WriteStreak v${meta.version} — ${p.footer.join(" · ")}`,
    "",
  ].join("\n");
}

function renderHtml(p: SessionParts, meta: ShareMeta): string {
  const body = p.content.length > 0
    ? paragraphs(p.content)
        .map(par => `      <p>${escapeHtml(par).replace(/\n/g, "<br>")}</p>`)
        .join("\n")
    : `      <p class="empty">(empty session)</p>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(p.title)}</title>
<style>
  :root {
    --bg: #faf9f7; --card: #ffffff; --ink: #1f2328;
    --muted: #6b7280; --rule: #e5e3df; --accent: #b4508a;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #16181d; --card: #1c1f26; --ink: #e6e6e6;
      --muted: #9aa1ad; --rule: #2c313a; --accent: #E8A0BF;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 2.5rem 1.25rem; background: var(--bg); color: var(--ink);
    font-family: Georgia, "Iowan Old Style", "Times New Roman", serif;
    line-height: 1.7; -webkit-text-size-adjust: 100%;
  }
  article {
    max-width: 42rem; margin: 0 auto; background: var(--card);
    padding: clamp(1.5rem, 5vw, 3rem); border-radius: 10px;
    border: 1px solid var(--rule);
  }
  h1 {
    margin: 0 0 .75rem; font-size: clamp(1.35rem, 4vw, 1.9rem);
    line-height: 1.25; font-weight: 600; letter-spacing: -0.01em;
  }
  .stats {
    margin: 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap;
    gap: .4rem .9rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: .8rem; color: var(--muted);
  }
  .stats .key { color: var(--accent); font-weight: 700; }
  .when { margin: .5rem 0 0; font-size: .8rem; color: var(--muted); }
  .body { margin-top: 1.75rem; border-top: 1px solid var(--rule); padding-top: 1.75rem; }
  .body p { margin: 0 0 1.15rem; white-space: pre-wrap; overflow-wrap: break-word; }
  .body p:last-child { margin-bottom: 0; }
  .empty { color: var(--muted); font-style: italic; }
  footer {
    margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--rule);
    font-size: .78rem; color: var(--muted);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
</style>
</head>
<body>
  <article>
    <header>
      <h1>${escapeHtml(p.title)}</h1>
      <ul class="stats">
${p.stats.map((s, i) => `        <li${i === 0 || i === 2 ? ' class="key"' : ""}>${escapeHtml(s)}</li>`).join("\n")}
      </ul>
      <p class="when">${escapeHtml(p.when)}</p>
    </header>
    <div class="body">
${body}
    </div>
    <footer>Written with WriteStreak v${escapeHtml(meta.version)} — ${escapeHtml(p.footer.join(" · "))}</footer>
  </article>
</body>
</html>
`;
}

/** Self-contained shareable document for one session, in the requested format. */
export function formatSession(
  session: WritingSession,
  meta: ShareMeta,
  format: ShareFormat
): string {
  const parts = sessionParts(session, meta);
  if (format === "txt") return renderText(parts, meta);
  if (format === "html") return renderHtml(parts, meta);
  return renderMarkdown(parts, meta);
}

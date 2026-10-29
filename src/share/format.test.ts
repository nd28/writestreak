import { describe, it, expect } from "vitest";
import {
  formatSession,
  formatDateTime,
  formatDuration,
  shareFilename,
  groupNumber,
  escapeHtml,
  SHARE_FORMATS,
  SHARE_FILE_PREFIX,
  SHARE_FORMAT_KEYS,
  type ShareMeta,
  type ShareFormat,
} from "./format.js";
import type { WritingSession } from "../types.js";

const META: ShareMeta = { level: 6, levelTitle: "Wordsmith", streak: 7, version: "1.7.0" };

// Local-time construction, so assertions hold in any timezone.
const START = new Date(2026, 7, 25, 14, 32, 10).getTime();

function makeSession(over: Partial<WritingSession> = {}): WritingSession {
  return {
    id: "abc123",
    title: "Session 8/25/2026 2:32:10 PM",
    content: "The morning fog had not yet lifted.",
    wordCount: 7,
    charCount: 35,
    startedAt: START,
    endedAt: START + 47 * 60_000,
    xpEarned: 968,
    ...over,
  };
}

describe("groupNumber", () => {
  it("inserts thousands separators", () => {
    expect(groupNumber(0)).toBe("0");
    expect(groupNumber(999)).toBe("999");
    expect(groupNumber(1000)).toBe("1,000");
    expect(groupNumber(1234567)).toBe("1,234,567");
  });

  it("handles negatives and non-finite input", () => {
    expect(groupNumber(-4200)).toBe("-4,200");
    expect(groupNumber(NaN)).toBe("0");
  });
});

describe("formatDateTime", () => {
  it("formats afternoon times in 12-hour form", () => {
    expect(formatDateTime(START)).toBe("25 Aug 2026, 2:32 PM");
  });

  it("renders midnight as 12 AM and noon as 12 PM", () => {
    expect(formatDateTime(new Date(2026, 0, 1, 0, 5).getTime())).toBe("01 Jan 2026, 12:05 AM");
    expect(formatDateTime(new Date(2026, 0, 1, 12, 0).getTime())).toBe("01 Jan 2026, 12:00 PM");
  });

  it("does not throw on an invalid timestamp", () => {
    expect(formatDateTime(NaN)).toBe("unknown date");
  });
});

describe("formatDuration", () => {
  it("returns null for a zero or negative span", () => {
    expect(formatDuration(0)).toBeNull();
    expect(formatDuration(-5000)).toBeNull();
    expect(formatDuration(NaN)).toBeNull();
  });

  it("formats sub-minute, minute and hour spans", () => {
    expect(formatDuration(20_000)).toBe("<1 min");
    expect(formatDuration(47 * 60_000)).toBe("47 min");
    expect(formatDuration(60 * 60_000)).toBe("1h");
    expect(formatDuration(72 * 60_000)).toBe("1h 12m");
  });
});

describe("shareFilename", () => {
  it("uses the extension of the chosen format", () => {
    expect(shareFilename(START, "md")).toBe(`${SHARE_FILE_PREFIX}-2026-08-25-143210.md`);
    expect(shareFilename(START, "txt")).toBe(`${SHARE_FILE_PREFIX}-2026-08-25-143210.txt`);
    expect(shareFilename(START, "html")).toBe(`${SHARE_FILE_PREFIX}-2026-08-25-143210.html`);
  });

  it("stays a valid name for an invalid timestamp", () => {
    expect(shareFilename(NaN, "md")).toBe(`${SHARE_FILE_PREFIX}-unknown.md`);
  });

  it("differs across seconds so rapid shares do not collide", () => {
    expect(shareFilename(START, "md")).not.toBe(shareFilename(START + 1000, "md"));
  });

  it("gives each format a distinct name for the same instant", () => {
    const names = SHARE_FORMATS.map(f => shareFilename(START, f));
    expect(new Set(names).size).toBe(SHARE_FORMATS.length);
  });
});

describe("escapeHtml", () => {
  it("neutralises markup characters", () => {
    expect(escapeHtml(`<script>alert("x" & 'y')</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot; &amp; &#39;y&#39;)&lt;/script&gt;"
    );
  });

  it("escapes ampersands before other entities", () => {
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });
});

describe("formatSession — shared behaviour across formats", () => {
  const CASES: ShareFormat[] = ["md", "txt", "html"];

  it.each(CASES)("%s includes title, counts, date and prose", (format) => {
    const out = formatSession(makeSession(), META, format);
    expect(out).toContain("Session 8/25/2026 2:32:10 PM");
    expect(out).toContain("7 words");
    expect(out).toContain("35 chars");
    expect(out).toContain("968 XP");
    expect(out).toContain("47 min");
    expect(out).toContain("25 Aug 2026, 2:32 PM");
    expect(out).toContain("The morning fog had not yet lifted.");
    expect(out).toContain("1.7.0");
  });

  it.each(CASES)("%s omits the streak when there is none", (format) => {
    const out = formatSession(makeSession(), { ...META, streak: 0 }, format);
    expect(out).not.toContain("streak");
    expect(out).toContain("LVL 6 Wordsmith");
  });

  it.each(CASES)("%s omits duration when the session never ended", (format) => {
    const out = formatSession(makeSession({ endedAt: null }), META, format);
    expect(out).not.toContain("47 min");
  });

  it.each(CASES)("%s singularises a one-word session", (format) => {
    const out = formatSession(makeSession({ wordCount: 1 }), META, format);
    expect(out).toContain("1 word");
    expect(out).not.toContain("1 words");
  });

  it.each(CASES)("%s groups large counts", (format) => {
    const out = formatSession(makeSession({ wordCount: 12345, xpEarned: 24690 }), META, format);
    expect(out).toContain("12,345 words");
    expect(out).toContain("24,690 XP");
  });

  it.each(CASES)("%s falls back to a title for an untitled session", (format) => {
    expect(formatSession(makeSession({ title: "   " }), META, format)).toContain("Untitled session");
  });

  it.each(CASES)("%s marks an empty session instead of emitting a blank body", (format) => {
    expect(formatSession(makeSession({ content: "   \n  " }), META, format)).toContain("empty session");
  });

  it.each(CASES)("%s normalises CRLF and ends with a newline", (format) => {
    const out = formatSession(makeSession({ content: "line one   \r\nline two\r\n\r\n" }), META, format);
    expect(out).not.toContain("\r");
    expect(out.endsWith("\n")).toBe(true);
  });

  it.each(CASES)("%s tolerates legacy sessions with no xpEarned", (format) => {
    const legacy = { ...makeSession(), xpEarned: undefined } as unknown as WritingSession;
    expect(formatSession(legacy, META, format)).toContain("0 XP");
  });
});

describe("formatSession — Markdown", () => {
  it("uses a heading, a stat blockquote and a rule", () => {
    const md = formatSession(makeSession(), META, "md");
    expect(md).toContain("# Session 8/25/2026 2:32:10 PM");
    expect(md).toContain("> **7 words** · 35 chars · **968 XP** · 47 min");
    expect(md).toContain("\n---\n");
    expect(md).toContain("*Written with WriteStreak v1.7.0 — LVL 6 Wordsmith · 🔥 7-day streak*");
  });

  it("preserves multi-paragraph prose verbatim", () => {
    const body = "First paragraph.\n\nSecond paragraph with *emphasis*.";
    expect(formatSession(makeSession({ content: body }), META, "md")).toContain(body);
  });
});

describe("formatSession — plain text", () => {
  it("underlines the title and uses no Markdown syntax", () => {
    const txt = formatSession(makeSession(), META, "txt");
    const lines = txt.split("\n");
    expect(lines[0]).toBe("Session 8/25/2026 2:32:10 PM");
    expect(lines[1]).toBe("=".repeat(lines[0].length));
    expect(txt).not.toContain("**");
    expect(txt).not.toContain("# ");
    expect(txt).toContain("7 words  ·  35 chars  ·  968 XP  ·  47 min");
  });

  it("caps the underline for a very long title", () => {
    const txt = formatSession(makeSession({ title: "T".repeat(200) }), META, "txt");
    expect(txt.split("\n")[1]).toBe("=".repeat(60));
  });

  it("keeps prose unwrapped so the reader controls wrapping", () => {
    const body = "First paragraph.\n\nSecond paragraph.";
    expect(formatSession(makeSession({ content: body }), META, "txt")).toContain(body);
  });
});

describe("formatSession — HTML", () => {
  it("emits a self-contained document with inline styles", () => {
    const html = formatSession(makeSession(), META, "html");
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>Session 8/25/2026 2:32:10 PM</title>");
    expect(html).toContain("<style>");
    expect(html).toContain("prefers-color-scheme: dark");
    expect(html).toContain("</html>");
    // Nothing loaded from the network — the file must open standalone.
    expect(html).not.toMatch(/<script|src=|href=/);
  });

  it("escapes markup in session content", () => {
    const html = formatSession(makeSession({ content: "<script>alert(1)</script>" }), META, "html");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("escapes markup in the title, including the document title", () => {
    const html = formatSession(makeSession({ title: `Draft <b>"one"</b>` }), META, "html");
    expect(html).toContain("<title>Draft &lt;b&gt;&quot;one&quot;&lt;/b&gt;</title>");
    expect(html).not.toContain("<b>");
  });

  it("splits blank-line blocks into paragraphs and keeps single breaks", () => {
    const html = formatSession(makeSession({ content: "One.\nStill one.\n\nTwo." }), META, "html");
    expect(html).toContain("<p>One.<br>Still one.</p>");
    expect(html).toContain("<p>Two.</p>");
  });
});

describe("share format keys", () => {
  it("maps one prompt key to each supported format", () => {
    expect(Object.keys(SHARE_FORMAT_KEYS).sort()).toEqual(["h", "m", "t"]);
    expect(Object.values(SHARE_FORMAT_KEYS).sort()).toEqual([...SHARE_FORMATS].sort());
  });
});

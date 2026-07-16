# History Search & Session Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make WriteStreak's session history searchable (content+title + metadata filters), paginated across all sessions, and add a scrollable full-text reader with a "resume into editor" action.

**Architecture:** Pure filtering/pagination logic lives in a new `src/history/filter.ts` (unit-tested, no UI deps). The existing `buildHistory()` in `src/App.ts` becomes a dispatcher between two sub-views (`list`, `reader`) rendered inside the current `mode === "history"` flow. Native OpenTUI components handle the heavy lifting: `SelectRenderable` for the list (nav/selection/scroll indicator), `ScrollBoxRenderable` for the reader (scrolling wrapped text), `InputRenderable` for the search box. Save data is never mutated except by an explicit `r` resume that only touches the editor buffer.

**Tech Stack:** TypeScript (ESNext), Bun runtime, `@opentui/core` (imperative), `@msgpack/msgpack`, Vitest.

## Global Constraints

- Follow AGENTS.md mandatory rules: bump version (`bun scripts/bump.ts minor`, 1.4.0 → 1.5.0), update AGENTS.md "Current State"/"Features Implemented", run `npm run build` (zero errors) and `npm test -- --run` (all pass) before finishing. Do NOT commit unless the user explicitly asks.
- ESNext modules, `.js` extensions in imports, no JSX. Imperative `BoxRenderable`/`TextRenderable`/`TextareaRenderable` (NOT React).
- Existing keybindings (`Ctrl+S/N/E/Q/H/I`, mode cycle) keep working EXCEPT when the search input is focused (then printable + `Ctrl+H` go to the input; `Ctrl+H` is terminal backspace and must NOT toggle history while search is focused).
- History navigation NEVER calls `saveSession()`, `newSession()`, or `exportToBin()` — only the `r` resume action mutates editor buffer state (and even then only the in-memory buffer, not the save file).
- Spec: `docs/superpowers/specs/2026-07-15-history-search-reader-design.md` (read it for full context).

## File Structure

- **Create:** `src/history/filter.ts` — pure filtering + pagination logic. Exports `filterSessions`, `PAGE_SIZE`, `FILTER_ORDER`, and types `FilterKind`, `FilterInput`, `FilterResult`.
- **Create:** `src/history/filter.test.ts` — Vitest unit tests for `filter.ts`.
- **Modify:** `src/App.ts` — add history sub-view state, replace `buildHistory()` with dispatcher `buildHistoryList()` / `buildHistoryReader()`, extend keypress handler for list/reader routing + search-focus interception, add resume action.
- **Modify:** `src/types.ts` — no changes (sessions already have everything; `id`, `title`, `content`, `wordCount`, `xpEarned`, `startedAt`).
- **Modify:** `AGENTS.md` — bump version state, add feature bullets, note new `src/history/filter.ts` module, add history keyboard shortcuts to the shortcuts section.

---

### Task 1: Pure filter + pagination module (TDD)

**Files:**
- Create: `src/history/filter.ts`
- Test: `src/history/filter.test.ts`

**Interfaces:**
- Produces (consumed by Task 2/4):
  - `export type FilterKind = "all" | "date" | "words" | "xp";`
  - `export interface FilterInput { query: string; filter: FilterKind; page: number; pageSize: number; }`
  - `export interface FilterResult { pageItems: WritingSession[]; total: number; totalPages: number; page: number; }`
  - `export const PAGE_SIZE: number;` (= 20)
  - `export const FILTER_ORDER: FilterKind[];` (= `["all", "date", "words", "xp"]`)
  - `export function filterSessions(sessions: WritingSession[], input: FilterInput): FilterResult;`
- Consumes: `WritingSession` from `../types.js`

- [ ] **Step 1: Write the failing test file**

Create `src/history/filter.test.ts` with all assertions below. Import from `./filter.js`.

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/history/filter.test.ts`
Expected: FAIL — "Cannot find module './filter.js'".

- [ ] **Step 3: Write minimal implementation**

Create `src/history/filter.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/history/filter.test.ts`
Expected: PASS (16 tests).

- [ ] **Step 5: Run full suite + build to confirm nothing broke**

Run: `npm test -- --run && npm run build`
Expected: all tests pass, build compiles clean.

- [ ] **Step 6: Commit**

```bash
git add src/history/filter.ts src/history/filter.test.ts
git commit -m "feat: add pure session filter/pagination module"
```

---

### Task 2: History sub-view state + reader UI skeleton (no wiring yet)

**Files:**
- Modify: `src/App.ts`

**Interfaces:**
- Consumes (from Task 1): `filterSessions`, `PAGE_SIZE`, `FILTER_ORDER`, `FilterKind`, and the `SelectRenderable`/`ScrollBoxRenderable`/`InputRenderable` exports from `@opentui/core`.
- Produces (for Task 3): renders a placeholder `buildHistoryList()` (select-only, no search yet) and a working `buildHistoryReader()`; the keypress handler gains reader escape/resume routing only. Task 3 will add search input wiring + filter/page routing.

- [ ] **Step 1: Add imports + history sub-view closure state**

In `src/App.ts` at the top, update the `@opentui/core` import to include `ScrollBoxRenderable`, `InputRenderable`, and `SelectRenderable`:

```ts
import { createCliRenderer, Box, Text, TextAttributes, TextareaRenderable, BoxRenderable, TextRenderable, ScrollBoxRenderable, InputRenderable, SelectRenderable } from "@opentui/core";
```

Add after the `import pkg ...` line:

```ts
import { filterSessions, PAGE_SIZE, FILTER_ORDER } from "./history/filter.js";
import type { FilterKind } from "./history/filter.js";
```

Inside `main()`, after the `let sessionTitle = ...` line (around line 51), add the history sub-view state:

```ts
let historyView: "list" | "reader" = "list";
let historyQuery = "";
let historyPage = 0;
let historySelectedId: string | null = null;
let historyReaderId: string | null = null;
let historyFilter: FilterKind = "all";
let searchFocused = false;
let searchInput: InputRenderable | null = null;
let historySelect: SelectRenderable | null = null;
let historyScroll: ScrollBoxRenderable | null = null;
```

- [ ] **Step 2: Replace `buildHistory()` with a dispatcher + `buildHistoryList()` + `buildHistoryReader()`**

Replace the entire existing `buildHistory()` function (App.ts:193-227) with:

```ts
function buildHistory() {
  return historyView === "reader" ? buildHistoryReader() : buildHistoryList();
}

function buildHistoryList() {
  const { pageItems, total, totalPages, page } = filterSessions(stats.sessions, {
    query: historyQuery,
    filter: historyFilter,
    page: historyPage,
    pageSize: PAGE_SIZE,
  });
  historyPage = page;

  const historyBox = new BoxRenderable(renderer, {
    flexDirection: "column",
    flexGrow: 1,
    paddingX: 1,
    gap: 1,
  });

  const headerRow = new BoxRenderable(renderer, { flexDirection: "row", justifyContent: "space-between", width: "100%" });
  headerRow.add(new TextRenderable(renderer, { content: "SESSION HISTORY", fg: "#FFFF00", attributes: TextAttributes.BOLD }));
  headerRow.add(new TextRenderable(renderer, { content: `${total} sessions · Pg [${page + 1}/${totalPages}]`, fg: "#888888" }));
  historyBox.add(headerRow);

  if (total === 0) {
    historyBox.add(new TextRenderable(renderer, { content: "No sessions match — start writing!", fg: "#666666" }));
    historyBox.add(new TextRenderable(renderer, { content: "Press Esc to clear filters.", fg: "#666666" }));
    return historyBox;
  }

  historySelect = new SelectRenderable(renderer, {
    options: pageItems.map((s, i) => {
      const d = new Date(s.startedAt);
      const dateStr = d.toLocaleDateString();
      const timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const preview = s.content ? s.content.replace(/\n/g, " ").slice(0, 40) : "(empty)";
      const name = `${String(i + 1).padStart(2)}. ${dateStr} ${timeStr}  ${s.wordCount}w ${s.xpEarned || 0}xp  ${preview}`;
      return { name, description: "", value: s.id };
    }),
    selectedIndex: historySelectedId
      ? Math.max(0, pageItems.findIndex(s => s.id === historySelectedId))
      : 0,
    showScrollIndicator: true,
    wrapSelection: false,
    focusedBackgroundColor: primaryColor,
    focusedTextColor: "#000000",
    selectedBackgroundColor: "#333333",
  });

  historySelect.on("selectionChanged", (opt) => {
    if (opt && opt.value) historySelectedId = opt.value as string;
  });
  historySelect.on("itemSelected", (opt) => {
    if (opt && opt.value) openReader(opt.value as string);
  });

  historyBox.add(historySelect);

  const hintRow = new BoxRenderable(renderer, { flexDirection: "row", width: "100%" });
  hintRow.add(new TextRenderable(renderer, {
    content: `Enter open · / search · f filter:${historyFilter} · [/] page · Esc close`,
    fg: "#555555",
  }));
  historyBox.add(hintRow);

  return historyBox;
}

function buildHistoryReader() {
  const session = historyReaderId
    ? stats.sessions.find(s => s.id === historyReaderId) ?? null
    : null;

  const readerBox = new BoxRenderable(renderer, { flexDirection: "column", flexGrow: 1, paddingX: 1, gap: 1 });

  if (!session) {
    readerBox.add(new TextRenderable(renderer, { content: "Session not found — press Esc to go back.", fg: "#FF6666" }));
    return readerBox;
  }

  const d = new Date(session.startedAt);
  const header = new BoxRenderable(renderer, { flexDirection: "row", justifyContent: "space-between", width: "100%" });
  header.add(new TextRenderable(renderer, {
    content: `READING · ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
    fg: "#FFFF00", attributes: TextAttributes.BOLD,
  }));
  header.add(new TextRenderable(renderer, { content: `${session.wordCount}w · ${session.xpEarned || 0}xp`, fg: "#00FF00" }));
  readerBox.add(header);

  if (!session.content) {
    readerBox.add(new TextRenderable(renderer, { content: "(empty session)", fg: "#666666" }));
  } else {
    historyScroll = new ScrollBoxRenderable(renderer, { flexGrow: 1, scrollY: true, stickyStart: "top", paddingX: 1 });
    historyScroll.content.add(new TextRenderable(renderer, {
      content: wrapText(session.content, Math.max(20, process.stdout.columns - 6)),
      fg: "#DDDDDD",
    }));
    readerBox.add(historyScroll);
  }

  const hint = new TextRenderable(renderer, { content: "r resume · ↑↓ scroll · Esc back", fg: "#555555" });
  readerBox.add(hint);

  return readerBox;
}

function wrapText(text: string, width: number): string {
  return text.split("\n").map(line => {
    if (line.length <= width) return line;
    const words = line.split(" ");
    const out: string[] = [];
    let cur = "";
    for (const w of words) {
      if (cur.length === 0) cur = w;
      else if ((cur + " " + w).length <= width) cur += " " + w;
      else { out.push(cur); cur = w; }
    }
    if (cur.length > 0) out.push(cur);
    return out.join(" ");
  }).join("\n");
}

function openReader(id: string) {
  historyReaderId = id;
  historyView = "reader";
  buildMiddleSection();
}
```

Notes for the implementer:
- `SelectRenderable.on(...)` uses the event enum names from `SelectRenderableEvents` ("selectionChanged" / "itemSelected"). Use the string forms as shown; OpenTUI binds these by name.
- `ScrollBoxRenderable.content` is the inner container to add children to (per `ScrollBox.d.ts`).
- `wrapText` is a module-level helper (place it OUTSIDE `main`, near the other top helpers like `parseColorArg`).

Move `wrapText` to module scope (outside `main`). Place it just before `async function main()`.

- [ ] **Step 3: Wire the reader escape + resume in the keypress handler**

In the keypress handler (around App.ts:162), locate the `if (mode === "guide") { ... return; }` block. Immediately AFTER it, add a history-routing block:

```ts
if (mode === "history" && historyView === "reader") {
  if (key.name === "r" && !key.ctrl) {
    resumeSessionIntoEditor();
    return;
  }
  if (key.name === "escape") {
    historyView = "list";
    buildMiddleSection();
    return;
  }
  if (key.name === "backspace") {
    historyView = "list";
    buildMiddleSection();
    return;
  }
  if (key.ctrl && key.name === "h") {
    historyView = "list";
    buildMiddleSection();
    return;
  }
  if (historyScroll && (key.name === "up" || key.name === "down" || key.name === "pageup" || key.name === "pagedown" || key.name === "home" || key.name === "end")) {
    historyScroll.handleKeyPress(key);
    return;
  }
}
```

Add the resume helper near `saveSession()`:

```ts
function resumeSessionIntoEditor() {
  if (!historyReaderId) return;
  const session = stats.sessions.find(s => s.id === historyReaderId);
  if (!session) {
    showMessage("Session not found");
    return;
  }
  currentText = session.content;
  input.setText(session.content);
  prevWordCount = countWords(currentText);
  sessionXp = 0;
  historyView = "list";
  mode = "writing";
  buildMiddleSection();
  updateEditor();
  updateHeaderStats();
  showMessage(`Resumed session (${prevWordCount} words)`);
}
```

Note: `input` is the `TextareaRenderable` defined later in `main()`. `updateEditor()` and `updateHeaderStats()` are existing helpers. These are referenced before their definition in source order, but since they're all function declarations in the same closure, hoisting makes this safe — verify by building in Step 5.

- [ ] **Step 4: Build + run full test suite**

Run: `npm run build && npm test -- --run`
Expected: build compiles, all tests pass (no new tests in this task — UI wiring is exercised manually).

- [ ] **Step 5: Manual smoke test**

Run: `bun src/index.ts --skip-guide`
- Ctrl+H opens history list (you should see your sessions rendered via Select).
- Use ↑/↓ to highlight, press Enter → reader opens showing full content.
- Press Esc → back to list.
- Press `r` in reader → editor loads content, toast "Resumed session (N words)" appears, mode is WRITING.
- Ctrl+S saves it as a new session (sessions count increments, original still in history).

- [ ] **Step 6: Commit**

```bash
git add src/App.ts
git commit -m "feat: add session reader sub-view with resume action"
```

---

### Task 3: Search input + filter + pagination routing in list view

**Files:**
- Modify: `src/App.ts`

**Interfaces:**
- Consumes: `buildHistoryList()` skeleton from Task 2, `searchFocused`/`searchInput`/`historySelect` refs from Task 2, `filterSessions`/`FILTER_ORDER` from Task 1.
- Produces: full list-view interactions — search filter, metadata filter cycle, pagination, search-focus interception of global keys.

**Design note (important):** The existing editor uses the `onContentChange` constructor option (NOT an `.on("change")` event) — verify at `src/App.ts:395`. Use the same `onContentChange` option for the search input. Create the `searchInput` instance ONCE (alongside `input` at App.ts:385) so focus and cursor survive re-renders. `buildHistoryList()` re-adds the SAME instance and updates the Select's `.options` setter in place when only the query/filter/page changed — do NOT call full `buildMiddleSection()` on every keystroke (that would recreate the input and lose focus/cursor).

- [ ] **Step 1: Create the persistent `searchInput` instance once**

Near where `input` is created (App.ts:385), add the search input creation immediately after the `input = new TextareaRenderable(...)` block closes (after its `onContentChange` handler and any closing `});`). Use `onContentChange`:

```ts
searchInput = new InputRenderable(renderer, {
  value: historyQuery,
  placeholder: "content / title…  (/ focus · Esc clears)",
  maxLength: 200,
  backgroundColor: "transparent",
  textColor: "#FFFFFF",
  cursorColor: primaryColor,
  placeholderColor: "#555555",
  onContentChange: () => {
    if (!searchInput) return;
    historyQuery = searchInput.value;
    historyPage = 0;
    historySelectedId = null;
    refreshHistoryList();
  },
});
```

Add a new helper `refreshHistoryList()` near `buildMiddleSection()` (it updates ONLY the Select's options + header counts in place, without rebuilding the input):

```ts
function refreshHistoryList() {
  if (!historySelect) return;
  const { pageItems, total, totalPages, page } = filterSessions(stats.sessions, {
    query: historyQuery,
    filter: historyFilter,
    page: historyPage,
    pageSize: PAGE_SIZE,
  });
  historyPage = page;
  historySelect.options = pageItems.map((s, i) => {
    const d = new Date(s.startedAt);
    const dateStr = d.toLocaleDateString();
    const timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const preview = s.content ? s.content.replace(/\n/g, " ").slice(0, 40) : "(empty)";
    return {
      name: `${String(i + 1).padStart(2)}. ${dateStr} ${timeStr}  ${s.wordCount}w ${s.xpEarned || 0}xp  ${preview}`,
      description: "",
      value: s.id,
    };
  });
  if (historySelect) historySelect.setSelectedIndex(0);
  historySelectedId = pageItems[0]?.id ?? null;
  if (historyHeaderRightRef) {
    historyHeaderRightRef.content = `${total} sessions · Pg [${page + 1}/${totalPages}]`;
  }
}
```

This requires a new ref `let historyHeaderRightRef: TextRenderable | null = null;` — add it to the closure state from Task 2 (add the line next to the other history refs).

- [ ] **Step 2: Add the search row + Select into `buildHistoryList()` (re-add the persistent input)**

In `buildHistoryList()` (from Task 2), insert AFTER the `headerRow` construction (before the `if (total === 0)` empty-state block). Capture the header right text into `historyHeaderRightRef`, add the search row re-using the persistent `searchInput`, add the Select as before. Replace the Task 2 header-row code so the right-side text is captured:

Replace the `headerRow` construction in `buildHistoryList()`:
```ts
const headerRow = new BoxRenderable(renderer, { flexDirection: "row", justifyContent: "space-between", width: "100%" });
headerRow.add(new TextRenderable(renderer, { content: "SESSION HISTORY", fg: "#FFFF00", attributes: TextAttributes.BOLD }));
historyHeaderRightRef = new TextRenderable(renderer, { content: `${total} sessions · Pg [${page + 1}/${totalPages}]`, fg: "#888888" });
headerRow.add(historyHeaderRightRef);
historyBox.add(headerRow);
```

Then insert the search row (re-using the persistent instance, NOT creating a new one):
```ts
const searchRow = new BoxRenderable(renderer, { flexDirection: "row", width: "100%", gap: 1 });
searchRow.add(new TextRenderable(renderer, { content: "Search:", fg: "#888888" }));
if (searchInput) searchRow.add(searchInput);
historyBox.add(searchRow);
```

The empty-state check (`if (total === 0)`) and Select creation stay as in Task 2, but the empty state must still show the search row above it. Move the empty-state check to AFTER the search row is added so the search input is always visible:

```ts
if (total === 0) {
  historyBox.add(new TextRenderable(renderer, { content: "No sessions match — start writing!", fg: "#666666" }));
  historyBox.add(new TextRenderable(renderer, { content: "Press Esc to clear filters.", fg: "#666666" }));
  return historyBox;
}
```

At the very end of `buildHistoryList()`, restore focus if search was focused:
```ts
if (searchFocused && searchInput) searchInput.focus();
```

Note: because `searchInput` is the SAME instance across rebuilds (created once in Step 1), re-adding it to the container does NOT reset its value or cursor. Only when `f`/`[`/`]`/`Esc` triggers a full `buildMiddleSection()` is `buildHistoryList()` re-run — and even then the same `searchInput` instance is re-added, preserving text + cursor; `searchFocused` re-focuses it.

- [ ] **Step 3: Extend the keypress handler with list routing + search-focus interception**

In the keypress handler, AFTER the `guide` block and AFTER the reader-routing block (added in Task 2), add the list-routing block:

```ts
if (mode === "history" && historyView === "list" && searchFocused) {
  if (key.name === "escape") {
    searchFocused = false;
    historyQuery = "";
    historyPage = 0;
    historySelectedId = null;
    if (searchInput) searchInput.blur();
    buildMiddleSection();
    return;
  }
  if (key.name === "return") {
    if (searchInput) searchInput.blur();
    return;
  }
  return;
}

if (mode === "history" && historyView === "list" && !searchFocused) {
  if (key.ctrl && key.name === "h") {
    toggleHistory();
    return;
  }
  if (key.name === "escape") {
    if (historyQuery || historyFilter !== "all") {
      historyQuery = "";
      historyFilter = "all";
      historyPage = 0;
      historySelectedId = null;
      buildMiddleSection();
    } else {
      toggleHistory();
    }
    return;
  }
  if (key.name === "slash") {
    searchFocused = true;
    if (searchInput) searchInput.focus();
    return;
  }
  if (key.name === "f" && !key.ctrl) {
    const idx = FILTER_ORDER.indexOf(historyFilter);
    historyFilter = FILTER_ORDER[(idx + 1) % FILTER_ORDER.length];
    historyPage = 0;
    historySelectedId = null;
    buildMiddleSection();
    return;
  }
  if (key.name === "[") {
    if (historyPage > 0) {
      historyPage--;
      historySelectedId = null;
      buildMiddleSection();
    }
    return;
  }
  if (key.name === "]") {
    historyPage++;
    historySelectedId = null;
    buildMiddleSection();
    return;
  }
  if (historySelect && (key.name === "up" || key.name === "down" || key.name === "pageup" || key.name === "pagedown" || key.name === "home" || key.name === "end")) {
    historySelect.handleKeyPress(key);
    return;
  }
  if (key.name === "return") {
    const sel = historySelect?.getSelectedOption();
    if (sel && sel.value) openReader(sel.value as string);
    return;
  }
}
```

Notes:
- We intentionally route `Ctrl+H` to `toggleHistory()` here (history close) only when NOT focused — when focused, the earlier `searchFocused` block returns early and the InputRenderable handles `Ctrl+H` as backspace.
- `filterSessions` clamps `historyPage` on the next `buildHistoryList()` call, so unbounded `]` increment is safe.
- The existing global `Ctrl+H` binding at App.ts:182 (in the lower section of the keypress handler) will ALSO fire for non-history modes — that's fine. But we must ensure our history-routing blocks run BEFORE the global Ctrl+S/N/E/H/I block. So place BOTH history blocks (reader from Task 2 and list from Task 3) immediately after the `guide` block and BEFORE the existing global `Ctrl+...` block. Move/verify ordering accordingly.

- [ ] **Step 4: Build + full test suite**

Run: `npm run build && npm test -- --run`
Expected: compiles, tests pass.

- [ ] **Step 5: Manual smoke test**

Run: `bun src/index.ts --skip-guide`
- Ctrl+H → history list.
- Press `/` → search input focused (cursor visible).
- Type a word that's in an old session → list filters live.
- Press Esc → search clears, back to full list.
- Press `f` → filter label cycles all→date→words→xp→all with visible list updates.
- Press `]` then `[` → page moves, selection resets to row 1.
- Press Enter → reader opens.
- Press `r` → resume into editor; Ctrl+S; verify new session added, original still in history.
- With search focused, press Ctrl+H → it deletes a char (backspace), does NOT toggle history out.

- [ ] **Step 6: Commit**

```bash
git add src/App.ts
git commit -m "feat: add history search input, filter cycle, and pagination"
```

---

### Task 4: Bump version + AGENTS.md update

**Files:**
- Modify: `package.json` (via bump script)
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: version 1.5.0, updated agent docs.

- [ ] **Step 1: Bump the version**

Run: `bun scripts/bump.ts minor`
Expected: `package.json` version becomes `1.5.0`.

Verify: `node -p "require('./package.json').version"` → `1.5.0`.

- [ ] **Step 2: Update AGENTS.md "Current State" version + bullets**

In `AGENTS.md`, change line 62:
```
**Version:** 1.4.0
```
to:
```
**Version:** 1.5.0
```

Replace the existing history bullet:
```
- Session history view (Ctrl+H or mode cycle): searchable (content+title, case-insensitive), paginated (20 per page), metadata filters (all/date/words/xp)
- Session history view (Ctrl+H or mode cycle), shows last 15 sessions
```
with these three bullets (remove the old "last 15 sessions" bullet, add the new three):
```
- Session history: searchable (content+title, case-insensitive), paginated (20 per page), metadata filters (all/date/words/xp)
- Session reader: scrollable word-wrapped full-text view for any past session (Enter to open, ↑↓ to scroll, Esc to close)
- Resume into editor: press `r` in reader to load a past session's content into the editor as a new session (original preserved)
- Pure filter module: `src/history/filter.ts` (no UI deps; unit-tested in `src/history/filter.test.ts`)
```

- [ ] **Step 3: Update AGENTS.md Architecture block**

In the Architecture section, after:
```
  storage/
    msgpack.ts      exportToBin / importFromBin / getDefaultStats (MessagePack binary)
```
add:
```
  history/
    filter.ts       filterSessions + FilterInput/FilterResult/PAGE_SIZE/FILTER_ORDER (pure, no UI)
    filter.test.ts  Vitest unit tests
```

- [ ] **Step 4: Update AGENTS.md Keyboard Shortcuts**

Replace the existing history line:
```
- `Ctrl+H` — toggle history
```
with the history sub-view shortcuts:
```
- `Ctrl+H` — toggle history / exit reader
- (history list) `/` — focus search · `f` — cycle filter · `[`/`]` — prev/next page · `Enter` — open reader · `Esc` — clear search/filter or close
- (history reader) `r` — resume into editor · `↑/↓` — scroll · `Esc` — back to list
```

- [ ] **Step 5: Final verification**

Run: `npm run build && npm test -- --run`
Expected: build compiles zero errors, all tests pass (59 prior + 16 new = 75).

- [ ] **Step 6: Commit (do NOT commit unless user has asked)**

Skip the commit in this task — the AGENTS.md rules forbid committing unless the user explicitly asks. Leave changes staged for the user to review.

```bash
git add AGENTS.md package.json
```
(Await user instruction to commit.)

---

## Self-Review (run after writing; fix inline)

**1. Spec coverage:**
- Search content/title + metadata filters → Task 3 (`/` search, `f` filter cycle). ✓
- Reader w/ scroll wrapped text → Task 2 (`buildHistoryReader`, `ScrollBoxRenderable`, `wrapText`). ✓
- Resume into editor → Task 2 (`resumeSessionIntoEditor`). ✓
- Pagination all sessions → Tasks 1+3 (`filterSessions` PAGE_SIZE 20, `[`/`]`). ✓
- Safety (no save mutation) → Task 2 resume only mutates buffer; keypress routing never calls save/storage. Spec section "Safety guarantee" reflected in Global Constraints. ✓
- Tests → Task 1 (16 unit tests) + manual smoke steps in Tasks 2/3. ✓
- Version bump + AGENTS.md → Task 4. ✓

**2. Placeholder scan:** None. All code blocks complete. "..." appears only in UI mockups (not requirements).

**3. Type consistency:**
- `filterSessions(sessions, {query, filter, page, pageSize}) → {pageItems, total, totalPages, page}` — used identically in Task 2 and Task 3.
- `FilterKind` enum `"all"|"date"|"words"|"xp"` and `FILTER_ORDER` used in Task 2 state and Task 3 cycle. Match.
- `SelectOption` `{name, description, value}` and event names `"selectionChanged"`/`"itemSelected"` from the d.ts.
- Event name check: `InputRenderable` emits `"change"`, `"enter"`, `"focus"`, `"blur"` per Input.d.ts (`InputRenderableEvents.INPUT`, `CHANGE`, `ENTER`). Input also inherits Textarea events; "change" is the supported payload event for `onContentChange`-style updates. Use `"change"`.
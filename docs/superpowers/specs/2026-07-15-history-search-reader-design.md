# History Search & Session Reader — Design

**Date:** 2026-07-15
**Project:** WriteStreak
**Status:** Approved
**Version target:** minor bump (1.4.0 → 1.5.0)

## Problem

The current history view (`buildHistory()` in `src/App.ts:193`) shows only the
last 15 sessions as terse one-line rows (date, time, word count, XP, 40-char
preview). There is no way to:

1. Search across sessions by content or metadata.
2. Read the full text of a past session.
3. See more than the most recent 15 sessions.

## Goals

- Search sessions by free-text content/title plus quick metadata filters.
- Read a past session's full text in a scrollable, word-wrapped reader.
- Optionally resume a past session into the editor.
- Show all sessions with pagination.
- History navigation must never mutate save data except an explicit resume action.

## Non-Goals

- Editing a past session in place (resume loads content into the editor as a
  new session; the original stays intact in history).
- Deleting sessions from history.
- Tagging / favorites / reordering.

## Architecture

History stays inside the existing `mode = "history"` flow. It gains an internal
sub-state machine with two sub-views, all rendered through the existing
`buildMiddleSection() → buildHistory()` plumbing:

```
mode = "history"
  └─ historyView: "list" | "reader"
       ├─ list:   search box + filter row + page row + SelectRenderable
       └─ reader: header + ScrollBoxRenderable of wrapped text + footer hints
```

### New state (closure-held in `main()`, same pattern as `mode`/`currentText`)

| Variable | Type | Default | Purpose |
|---|---|---|---|
| `historyView` | `"list" \| "reader"` | `"list"` | Active sub-view |
| `historyQuery` | `string` | `""` | Search text; persists across reader round-trips |
| `historyPage` | `number` | `0` | Current page (0-based) |
| `historySelectedId` | `string \| null` | `null` | Session id under cursor in list |
| `historyReaderId` | `string \| null` | `null` | Session id shown in reader |
| `historyFilter` | `FilterKind` | `"all"` | Active metadata filter bucket |

### New module: `src/history/filter.ts`

Pure, no UI dependencies — unit-testable in isolation.

```ts
export type FilterKind = "all" | "date" | "words" | "xp";

export interface FilterInput {
  query: string;        // case-insensitive substring over title + content
  filter: FilterKind;
  page: number;         // 0-based
  pageSize: number;     // default 20
}

export interface FilterResult {
  pageItems: WritingSession[];   // sessions for the current page
  total: number;                 // total matching sessions
  totalPages: number;            // ceil(total / pageSize), min 1
  page: number;                  // clamped to [0, totalPages-1]
}
```

#### Filter semantics

- **Sort:** newest-first by `startedAt` (descending), stable on tie.
- **Query:** empty query matches all; otherwise case-insensitive substring of
  `session.title` OR `session.content`.
- **Filter buckets** (applied in addition to query):
  - `all` — no metadata restriction.
  - `date` — sessions from the last 7 days (`startedAt >= now - 7*24h`).
  - `words` — sessions with `wordCount >= 50`.
  - `xp` — sessions with `xpEarned >= 50`.
- **Pagination:** slice `[page*pageSize, page*pageSize + pageSize]` of the
  filtered+scombined array. `page` is clamped to `[0, totalPages-1]` before
  slicing. `totalPages = max(1, ceil(total/pageSize))`.

#### Exports

- `filterSessions(sessions: WritingSession[], input: FilterInput): FilterResult`
- `PAGE_SIZE` constant = `20`
- `FILTER_ORDER: FilterKind[]` = `["all", "date", "words", "xp"]` (for cycling)

### `App.ts` changes

1. Import `filterSessions`, `PAGE_SIZE`, `FILTER_ORDER`, types from
   `src/history/filter.ts`.
2. Import `SelectRenderable`, `ScrollBoxRenderable`, `InputRenderable` from
   `@opentui/core`.
3. Add the closure state variables from the table above.
4. Replace `buildHistory()` with a dispatcher: `historyView === "list"` →
   `buildHistoryList()`; `=== "reader"` → `buildHistoryReader()`.
5. Extend the `keypress` handler with history-routing (see Interactions).
6. Keep all existing global `Ctrl+*` shortcuts intact **only when search input
   is not focused**; when focused, printable keys go to the input.

## Interactions

### Global vs. history routing

The existing top-of-handler block runs for `Ctrl+S/N/E/Q/H/I` and mode cycling.
Add: while in `mode === "history"` and the search `InputRenderable` is focused,
**intercept printable keys and intercept `Ctrl+H`** so they go to the input and
do NOT trigger the global `Ctrl+H` toggle (note: `Ctrl+H` is the terminal
backspace keycode — the InputRenderable expects it for deletion). `Esc`/`Enter`
blur the input. Concretely: when `searchInput.isFocused()` (tracked via a
boolean `searchFocused` set on focus/blur), the very first check in the
keypress handler returns early after letting the input handle the key (or
handles `Esc`/`Enter`/`Ctrl+C` only).

### List sub-view

| Key | Action |
|---|---|
| `/` | Focus the search `InputRenderable` |
| `↑` / `k`, `↓` / `j` | SelectRenderable nav (native `moveUp/moveDown`) |
| `PgUp` / `PgDn` | Fast scroll in Select |
| `Home` / `End` | First / last item in current page |
| `Enter` | Open reader: `historyReaderId = selected.id`; `historyView = "reader"`; rebuild |
| `[` | Previous page (`historyPage--`, clamped); reset selection to first item |
| `]` | Next page (`historyPage++`, clamped); reset selection to first item |
| `f` | Cycle metadata filter via `FILTER_ORDER` |
| `Esc` | If query or filter active → clear them; else `toggleHistory()` (back to writing) |
| Mouse click on a row | Select it (native Select behavior) |
| Mouse click on a row (double) | Open reader for that row |

While search focused: printable keys + `Ctrl+H` (backspace) → input;
`Esc`/`Enter` → blur. Global `Ctrl+S/N/E/Q/H/I` are suppressed while focused.

### Reader sub-view

| Key | Action |
|---|---|
| `↑` / `k` / `PgUp` | `scrollBox.scrollBy(-1)` etc. |
| `↓` / `j` / `PgDn` | `scrollBox.scrollBy(+1)` etc. |
| `Home` / `End` | Scroll to top / bottom (`scrollTo`) |
| `r` | **Resume** — see Resume action |
| `Esc` / `Backspace` | `historyView = "list"`; rebuild (preserves query/page/selection) |
| `Ctrl+H` | Exit reader then history |

### Resume action (the only history→editor mutation)

When `r` is pressed in the reader:

1. Look up session by `historyReaderId` in `stats.sessions`.
2. Set `currentText = session.content`.
3. `input.setText(session.content)`.
4. `prevWordCount = countWords(session.content)`.
5. `sessionXp = 0`.
6. `mode = "writing"`.
7. `historyView = "list"`.
8. `buildMiddleSection()` + `updateEditor()` + `updateHeaderStats()`.
9. Show toast `Resumed "session (N words)"`.
10. **Do NOT** call `saveSession()`, `newSession()`, or `exportToBin()`. The user
    can `Ctrl+S` when ready; the resumed content becomes a new session on save.

### Safety guarantee

- Search, pagination, filter-cycling, selection, reader-scroll touch only
  history-local closure variables and never call save/storage functions.
- The only writer from history mode is the `r` resume action, which mutates only
  the in-memory editor buffer state — never `stats.sessions`, `stats.totalXp`,
  or the `.bin` file.
- Existing `Ctrl+S/N/E/Q` global saves remain deliberate user actions; they are
  not remapped by history mode.

## UI Layout

### List sub-view

```
┌─ SESSION HISTORY ─────────────────────── 42 sessions · Pg [1/3] ─┐
│ Search: [_____________________]      Filter: all · /search Esc   │
│                                                                    │
│   #  DATE        TIME    WORDS  XP   PREVIEW                       │
│ > 1  2026-07-15  14:02   220  440  Today I started writing...      │
│   2  2026-07-14  09:11    85  170  Morning pages...                │
│   ...                                                              │
│                                                                    │
│ Enter open · / search · f filter · [/] page · Esc close            │
└────────────────────────────────────────────────────────────────────┘
```

- `SelectRenderable.options`: one `SelectOption` per `pageItem`, `name` =
  `"  N  DATE  TIME  WORDSw XPX  PREVIEW"` (monospace-aligned via padStart),
  `description` = `""`.
  - `selectedIndex` initialized to the index of `historySelectedId` within the
    page (0 if none).
  - `showScrollIndicator: true`, `wrapSelection: false` (page boundary handled
    by `[`/`]`).
  - `focusedBackgroundColor: primaryColor`, `focusedTextColor: "#000000"`,
    `selectedBackgroundColor: "#333333"`.
- `SELECTION_CHANGED` listener updates `historySelectedId`.
- `ITEM_SELECTED` listener (Enter) opens the reader.
- Search `InputRenderable` above the Select, single-line, `placeholder: "search content…"`, `maxLength: 200`. `onContentChange` → update `historyQuery`, reset `historyPage=0`, rebuild list.
- Preview truncation: `content.replace(/\n/g," ").slice(0, 40)` (unchanged from current).

### Reader sub-view

```
┌─ READING SESSION ─ 2026-07-15 14:02 · 220 words · 440 XP ────────┐
│  Today I started writing about the history feature. I want to    │
│  search old sessions because sometimes I forget what I wrote... │
│  ...                                                              │
│  (scrollable, word-wrapped)                                       │
└──────────────────────────────────────────────────────────────────┘
  r resume · ↑↓ scroll · Esc back
```

- Header `BoxRenderable` (row): date, time, `WORDSw`, `XPX`, session title
  truncated.
- Body `ScrollBoxRenderable` with `scrollY: true`, `stickyStart: "top"`. Content
  is a single `TextRenderable` with word-wrapped `session.content` (wrap via
  splitting on word boundaries to `Math.max(20, viewportWidth-4)` chars per line,
  joined by `\n`). Rewrap on resize.
- Footer hint row.
- Empty state: if session missing (deleted externally), show
  `"Session not found — press Esc to go back."`.

## Error Handling

- `importFromBin` already returns `null` for missing/corrupt saves; existing
  fallback to `getDefaultStats()` unchanged.
- `filterSessions` clamps page out-of-range; never throws on empty input array
  (returns `pageItems: [], total: 0, totalPages: 1, page: 0`).
- Resume of a missing `historyReaderId` (session not found in `stats.sessions`)
  shows a toast `"Session not found"` and does not mutate the editor.
- Reader for a session with `content === ""` shows `"(empty session)"` in the
  ScrollBox body.

## Testing

### `src/history/filter.ts` — unit tests (Vitest)

New file `src/history/filter.test.ts` covering:

1. Empty sessions array → `total: 0, totalPages: 1, page: 0, pageItems: []`.
2. No query, filter `all` → returns all, newest-first.
3. Query substring matches title OR content case-insensitively.
4. Filter `date` → only sessions within last 7 days.
5. Filter `words` → only `wordCount >= 50`.
6. Filter `xp` → only `xpEarned >= 50`.
7. Query + filter combine (AND).
8. Pagination: pageSize=20, 55 sessions → 3 pages; page 2 returns last 15;
   page 3 clamps to page 2.
9. Out-of-range page (page=99) clamps to last page.
10. Stable sort on equal `startedAt`.

Vitest config already covers `src/**/*.test.ts` (see `vitest.config.ts`).

### App.ts — manual verification checklist

- `/` focuses search, typing filters live, `Esc` clears focus.
- `[`/`]` paginate; selection resets to first item of new page.
- `f` cycles filters.
- `Enter` opens reader showing full wrapped text; `↑↓` scrolls long content.
- `r` loads content into editor with toast; `Ctrl+S` then saves it as a new
  session (total sessions increments, old session remains in history).
- `Esc` from reader returns to list with query/page/selection preserved.
- `Ctrl+H` toggles in/out of history cleanly.
- Search input focused: `Ctrl+H` does NOT toggle (stays in history); `Esc`
  blurs first.

## AGENTS.md Updates (mandatory)

- Bump version via `bun scripts/bump.ts minor` (1.4.0 → 1.5.0): new features
  (search, reader, pagination) warrant minor.
- Update "Features Implemented" bullets:
  - Session history: searchable (content+title, case-insensitive), paginated
    (20 per page), with metadata filters (all / date / words / xp).
  - Session reader: scrollable word-wrapped full-text view for any past session.
  - Resume into editor: `r` in reader loads session content as current editor
    buffer (new session on save; original preserved).
- Update "Architecture" block to mention `src/history/filter.ts`.
- Update "Keyboard Shortcuts" section with the new history-only keys.
- No new known issues expected (text-wrap first-render quirk unchanged).
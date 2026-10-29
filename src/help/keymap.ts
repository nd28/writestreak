export interface HelpRow {
  keys: string;
  description: string;
}

export interface HelpSection {
  title: string;
  rows: HelpRow[];
}

/**
 * The single source of truth for the help panel (Ctrl+K).
 *
 * Kept free of UI imports so `keymap.test.ts` can check it against the
 * bindings actually registered in App.ts — hand-maintained help text goes
 * stale silently otherwise.
 */
export const HELP_SECTIONS: HelpSection[] = [
  {
    title: "GLOBAL",
    rows: [
      { keys: "Ctrl+K", description: "Toggle this help" },
      { keys: "Ctrl+N", description: "New session (saves current)" },
      { keys: "Ctrl+S", description: "Save session to history" },
      { keys: "Ctrl+G", description: "Share as Markdown / Text / HTML" },
      { keys: "Ctrl+E", description: "Export profile to .wbin" },
      { keys: "Ctrl+H", description: "Toggle history" },
      { keys: "Ctrl+L", description: "Toggle insights (or Ctrl+I)" },
      { keys: "Ctrl+Q", description: "Save and quit" },
      { keys: "Ctrl+C", description: "Quit (draft is kept)" },
    ],
  },
  {
    title: "MOUSE",
    rows: [
      { keys: "Click mode", description: "Cycle the three views" },
      { keys: "Click color", description: "Cycle theme colors" },
    ],
  },
  {
    title: "HISTORY LIST",
    rows: [
      { keys: "↑ ↓ / k j", description: "Move selection" },
      { keys: "Enter", description: "Open in reader" },
      { keys: "s", description: "Share selected session" },
      { keys: "/", description: "Focus search" },
      { keys: "f", description: "Cycle filter: all/date/words/xp" },
      { keys: "[ ]", description: "Previous / next page" },
      { keys: "Esc", description: "Clear search/filter, else close" },
    ],
  },
  {
    title: "HISTORY READER",
    rows: [
      { keys: "↑ ↓ / k j", description: "Scroll" },
      { keys: "r", description: "Resume into the editor" },
      { keys: "s", description: "Share this session" },
      { keys: "Esc", description: "Back to the list" },
    ],
  },
];

/**
 * Ctrl-chords the help panel documents, lowercased ("k", "n", ...).
 * Descriptions are scanned too, so an alias mentioned as "(or Ctrl+I)" counts
 * as documented rather than tripping the sync test.
 */
export function documentedCtrlKeys(): Set<string> {
  const keys = new Set<string>();
  const pattern = /Ctrl\+([A-Za-z])\b/g;
  for (const section of HELP_SECTIONS) {
    for (const row of section.rows) {
      for (const match of `${row.keys} ${row.description}`.matchAll(pattern)) {
        keys.add(match[1].toLowerCase());
      }
    }
  }
  return keys;
}

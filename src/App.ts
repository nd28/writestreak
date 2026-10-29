import { createCliRenderer, Box, Text, TextAttributes, TextareaRenderable, BoxRenderable, TextRenderable, ScrollBoxRenderable, InputRenderable, SelectRenderable } from "@opentui/core";
import { existsSync, statSync, writeFileSync } from "fs";
import { countWords, calculateXp, updateStreak } from "./game/scoring.js";
import { getLevelInfo, LEVELS } from "./game/levels.js";
import { exportToBin, importFromBin, getDefaultStats } from "./storage/msgpack.js";
import { filterSessions, PAGE_SIZE, FILTER_ORDER } from "./history/filter.js";
import type { FilterKind } from "./history/filter.js";
import { formatSession, shareFilename, SHARE_FORMAT_KEYS, SHARE_FORMAT_LABELS } from "./share/format.js";
import type { ShareFormat } from "./share/format.js";
import { HELP_SECTIONS } from "./help/keymap.js";
import type { HelpSection } from "./help/keymap.js";
import type { PlayerStats, WritingSession, DraftSession } from "./types.js";
import pkg from "../package.json" with { type: "json" };

const VERSION = pkg.version;
const SAVE_PATH = "./writestreak.bin";
const DEFAULT_PRIMARY_COLOR = "#E8A0BF";

function parseColorArg(): string | null {
  const args = process.argv.slice(2);
  const colorIdx = args.indexOf("--color");
  if (colorIdx !== -1 && args[colorIdx + 1]) {
    const val = args[colorIdx + 1];
    if (/^#[0-9a-fA-F]{6}$/.test(val)) return val;
  }
  return null;
}

function parseSkipGuide(): boolean {
  return process.argv.includes("--skip-guide");
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

async function main() {
  const renderer = await createCliRenderer({
    // Handled below instead, so Ctrl+C can flush the draft before teardown.
    exitOnCtrlC: false,
    useMouse: true,
  });

  // Destroying the renderer frees every renderable's TextBuffer. A timer that
  // fires afterwards (a toast clearing, a flash reverting) would write to freed
  // memory and crash with "TextBuffer is destroyed". Route every deferred UI
  // write through `later()` so shutdown can cancel it, and treat the renderer's
  // own destroy event as shutdown so Ctrl+C is covered too.
  let shuttingDown = false;
  const pendingTimers = new Set<NodeJS.Timeout>();

  function later(fn: () => void, ms: number): NodeJS.Timeout {
    const timer = setTimeout(() => {
      pendingTimers.delete(timer);
      if (shuttingDown || renderer.isDestroyed) return;
      fn();
    }, ms);
    pendingTimers.add(timer);
    return timer;
  }

  function cancel(timer: NodeJS.Timeout | null) {
    if (!timer) return;
    clearTimeout(timer);
    pendingTimers.delete(timer);
  }

  function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    flushDraft();
    for (const timer of pendingTimers) clearTimeout(timer);
    pendingTimers.clear();
  }

  renderer.on("destroy", shutdown);

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      flushDraft();
      shutdown();
      try {
        renderer.destroy();
      } catch {
        // Already torn down; exiting is all that is left.
      }
      process.exit(0);
    });
  }

  let stats = importFromBin(SAVE_PATH) || getDefaultStats();
  const cliColor = parseColorArg();
  const skipGuide = parseSkipGuide();

  if (cliColor && cliColor !== stats.primaryColor) {
    stats = { ...stats, primaryColor: cliColor };
    exportToBin(stats, SAVE_PATH);
  }

  let primaryColor = stats.primaryColor || DEFAULT_PRIMARY_COLOR;
  let mode: "writing" | "history" | "guide" | "insights" | "help" = skipGuide || stats.guideSeen ? "writing" : "guide";
  // Mode to restore when help closes, so Ctrl+K is a true toggle from anywhere.
  let modeBeforeHelp: "writing" | "history" | "insights" = "writing";
  let currentText = "";
  let prevWordCount = 0;
  let sessionXp = 0;
  let message = "";
  let messageTimeout: NodeJS.Timeout | null = null;
  let previousLevel = getLevelInfo(stats.totalXp).level;
  const sessionStart = Date.now();
  const sessionTitle = `Session ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;

  let historyView: "list" | "reader" = "list";
  let historyQuery = "";
  let historyPage = 0;
  let historySelectedId: string | null = null;
  let historyReaderId: string | null = null;
  let historyFilter: FilterKind = "all";
  let searchFocused = false;
  let searchInput: InputRenderable | null = null;
  let historySelect: SelectRenderable | null = null;
  let historyHeaderRightRef: TextRenderable | null = null;
  let historyScroll: ScrollBoxRenderable | null = null;
  let helpScroll: ScrollBoxRenderable | null = null;
  // Session awaiting a format choice from the share prompt.
  let pendingShare: WritingSession | null = null;

  // ---- autosave ---------------------------------------------------------
  // Typing only mutates `stats` in memory; without this a Ctrl+C, a crash or a
  // closed terminal loses both the draft and the XP earned in the session.
  const AUTOSAVE_DELAY_MS = 1500;
  let draftTimer: NodeJS.Timeout | null = null;
  let draftDirty = false;

  function currentDraft(): DraftSession | null {
    if (currentText.trim().length === 0) return null;
    return {
      content: currentText,
      startedAt: sessionStart,
      xpEarned: sessionXp,
      updatedAt: Date.now(),
    };
  }

  /** Writes the draft and the XP/word/streak totals earned so far. */
  function flushDraft() {
    if (draftTimer) {
      clearTimeout(draftTimer);
      draftTimer = null;
    }
    if (!draftDirty) return;
    draftDirty = false;
    stats = { ...stats, draft: currentDraft() };
    try {
      exportToBin(stats, SAVE_PATH);
    } catch {
      // A failed autosave must never take the editor down; the next one retries.
      draftDirty = true;
    }
  }

  function scheduleDraftSave() {
    draftDirty = true;
    if (draftTimer) clearTimeout(draftTimer);
    draftTimer = setTimeout(flushDraft, AUTOSAVE_DELAY_MS);
  }

  function clearDraft() {
    if (draftTimer) {
      clearTimeout(draftTimer);
      draftTimer = null;
    }
    draftDirty = false;
    stats = { ...stats, draft: null };
  }

  const lastSession = stats.sessions.length > 0 ? stats.sessions[stats.sessions.length - 1] : null;
  const recoveredDraft = stats.draft?.content?.trim() ? stats.draft : null;

  if (recoveredDraft) {
    currentText = recoveredDraft.content;
    prevWordCount = countWords(currentText);
    sessionXp = recoveredDraft.xpEarned || 0;
    later(() => {
      showMessage(`Recovered unsaved draft (${prevWordCount} words) — Ctrl+S to save it`);
    }, 500);
  } else if (lastSession?.content) {
    currentText = lastSession.content;
    prevWordCount = countWords(currentText);
    later(() => {
      showMessage(`Resumed from last session (${prevWordCount} words)`);
    }, 500);
  }

  const streakInfo = updateStreak(stats);

  function flashModeLabel(color: string, durationMs: number) {
    if (!modeBoxRef) return;
    modeBoxRef.backgroundColor = color;
    later(() => {
      if (modeBoxRef) modeBoxRef.backgroundColor = primaryColor;
    }, durationMs);
  }

  function showMessage(msg: string) {
    message = msg;
    updateMessage();
    cancel(messageTimeout);
    messageTimeout = later(() => {
      message = "";
      updateMessage();
    }, 2000);
  }

  /** A message that stays until something replaces it (used by the share prompt). */
  function showPrompt(msg: string) {
    cancel(messageTimeout);
    messageTimeout = null;
    message = msg;
    updateMessage();
  }

  function showMessageLevelUp(msg: string) {
    message = msg;
    updateMessage();
    cancel(messageTimeout);
    messageTimeout = later(() => {
      message = "";
      updateMessage();
    }, 3000);
  }

  function saveSession() {
    if (currentText.trim().length === 0) return;

    const session: WritingSession = {
      id: Math.random().toString(36).slice(2),
      title: sessionTitle,
      content: currentText,
      wordCount: countWords(currentText),
      charCount: currentText.length,
      startedAt: sessionStart,
      endedAt: Date.now(),
      xpEarned: sessionXp,
    };

    clearDraft();
    stats = {
      ...stats,
      totalSessions: stats.totalSessions + 1,
      sessions: [...stats.sessions, session],
      draft: null,
    };
    exportToBin(stats, SAVE_PATH);
    showMessage("Session saved!");
  }

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
    historyReaderId = null;
    mode = "writing";
    buildMiddleSection();
    updateEditor();
    updateHeaderStats();
    showMessage(`Resumed session (${prevWordCount} words)`);
  }

  function newSession() {
    saveSession();
    clearDraft();
    currentText = "";
    prevWordCount = 0;
    sessionXp = 0;
    input.setText("");
    showMessage("New session started");
    updateEditor();
    updateHeaderStats();
  }

  function writeShare(session: WritingSession, format: ShareFormat) {
    const levelInfo = getLevelInfo(stats.totalXp);
    const path = `./${shareFilename(Date.now(), format)}`;
    const document = formatSession(
      session,
      {
        level: levelInfo.level,
        levelTitle: levelInfo.title,
        streak: stats.currentStreak,
        version: VERSION,
      },
      format
    );

    try {
      writeFileSync(path, document, "utf-8");
      showMessage(`Shared as ${SHARE_FORMAT_LABELS[format]} → ${path}`);
    } catch (err) {
      showMessage(`Share failed: ${(err as Error).message}`);
    }
  }

  /** Asks which format to write; the next keypress is consumed by resolveShare. */
  function promptShare(session: WritingSession | null) {
    if (!session) {
      showMessage("No session selected to share");
      return;
    }
    if (session.content.trim().length === 0) {
      showMessage("Nothing to share — this session is empty");
      return;
    }
    pendingShare = session;
    // Blur the editor so the format key is not typed into the draft.
    if (mode === "writing") input.blur();
    showPrompt("Share as:  m Markdown  ·  t Text  ·  h HTML  ·  Esc cancel");
  }

  function resolveShare(key: { name?: string }) {
    const session = pendingShare;
    pendingShare = null;
    if (mode === "writing") input.focus();

    const format = SHARE_FORMAT_KEYS[key.name ?? ""];
    if (!session || !format) {
      showMessage("Share cancelled");
      return;
    }
    writeShare(session, format);
  }

  function promptShareById(id: string | null) {
    promptShare(id ? stats.sessions.find(s => s.id === id) ?? null : null);
  }

  /** Shares the in-progress draft without saving it as a session. */
  function promptShareDraft() {
    if (currentText.trim().length === 0) {
      showMessage("Nothing to share — write something first");
      return;
    }
    promptShare({
      id: "draft",
      title: sessionTitle,
      content: currentText,
      wordCount: countWords(currentText),
      charCount: currentText.length,
      startedAt: sessionStart,
      endedAt: Date.now(),
      xpEarned: sessionXp,
    });
  }

  function exportBin() {
    const exportPath = `./writestreak-export-${Date.now()}.wbin`;
    exportToBin(stats, exportPath);
    showMessage(`Exported to ${exportPath}`);
  }

  function toggleHistory() {
    mode = mode === "history" ? "writing" : "history";
    buildMiddleSection();
    updateModeIndicator();
  }

  function toggleHelp() {
    if (mode === "help") {
      mode = modeBeforeHelp;
    } else {
      modeBeforeHelp = mode === "guide" ? "writing" : (mode as "writing" | "history" | "insights");
      mode = "help";
    }
    buildMiddleSection();
    updateModeIndicator();
  }

  function quitWithoutSaving() {
    flushDraft();
    shutdown();
    renderer.destroy();
  }

  function quitApp() {
    saveSession();
    showMessage("Saved. Goodbye!");
    setTimeout(() => {
      shutdown();
      renderer.destroy();
    }, 500);
  }

  function toggleInsights() {
    mode = mode === "insights" ? "writing" : "insights";
    buildMiddleSection();
    updateModeIndicator();
  }

  function cycleMode() {
    const modes: Array<"writing" | "history" | "insights"> = ["writing", "history", "insights"];
    const currentIdx = modes.indexOf(mode as any);
    const nextIdx = (currentIdx + 1) % modes.length;
    mode = modes[nextIdx];
    buildMiddleSection();
    updateModeIndicator();
    flashModeLabel("#FFFFFF", 500);
  }

  function closeGuide() {
    stats = { ...stats, guideSeen: true };
    exportToBin(stats, SAVE_PATH);
    mode = "writing";
    buildMiddleSection();
    updateModeIndicator();
  }

  // Ctrl+H arrives as byte 0x08, which parses as `backspace` with ctrl=false, so
  // `key.ctrl && key.name === "h"` never matched and the documented shortcut was
  // dead. The real Backspace key sends 0x7f, so the raw byte tells them apart.
  function isToggleHistoryKey(key: { ctrl: boolean; name: string; sequence: string }): boolean {
    return (key.ctrl && key.name === "h") || key.sequence === "\b";
  }

  // Ctrl+I is byte 0x09 — indistinguishable from Tab outside the kitty keyboard
  // protocol — so Ctrl+L is offered as an alias that always works.
  function isToggleInsightsKey(key: { ctrl: boolean; name: string }): boolean {
    return (key.ctrl && key.name === "i") || (key.ctrl && key.name === "l");
  }

  renderer.keyInput.on("keypress", (key) => {
    // Checked first: Ctrl+C must work from every mode, including the guide,
    // the help panel and the share prompt.
    if (key.ctrl && key.name === "c") {
      quitWithoutSaving();
      return;
    }

    // The share prompt owns the very next keypress.
    if (pendingShare) {
      resolveShare(key);
      return;
    }

    if (mode === "help") {
      if (key.ctrl && key.name === "q") {
        quitApp();
        return;
      }
      if (
        key.name === "escape" ||
        key.name === "return" ||
        key.sequence === "?" ||
        (key.ctrl && key.name === "k")
      ) {
        toggleHelp();
        return;
      }
      if (helpScroll && (key.name === "up" || key.name === "down" || key.name === "pageup" || key.name === "pagedown" || key.name === "home" || key.name === "end" || key.name === "k" || key.name === "j")) {
        helpScroll.handleKeyPress(key);
      }
      return;
    }

    if (mode === "guide") {
      if (key.name === "return" || key.name === "escape") {
        closeGuide();
      }
      return;
    }

    if (mode === "history" && historyView === "reader") {
      if (key.name === "r" && !key.ctrl) {
        resumeSessionIntoEditor();
        return;
      }
      if (key.name === "s" && !key.ctrl) {
        promptShareById(historyReaderId);
        return;
      }
      if (key.name === "escape") {
        historyView = "list";
        buildMiddleSection();
        return;
      }
      if (isToggleHistoryKey(key)) {
        toggleHistory();
        return;
      }
      if (key.name === "backspace") {
        historyView = "list";
        buildMiddleSection();
        return;
      }
      if (key.sequence === "?" || (key.ctrl && key.name === "k")) {
        toggleHelp();
        return;
      }
      if (historyScroll && (key.name === "up" || key.name === "down" || key.name === "pageup" || key.name === "pagedown" || key.name === "home" || key.name === "end" || key.name === "k" || key.name === "j")) {
        historyScroll.handleKeyPress(key);
        return;
      }
    }

    if (mode === "history" && historyView === "list" && searchFocused) {
      if (key.name === "escape") {
        searchFocused = false;
        historyQuery = "";
        if (searchInput) searchInput.value = historyQuery;
        historyPage = 0;
        historySelectedId = null;
        if (searchInput) searchInput.blur();
        buildMiddleSection();
        return;
      }
      if (key.name === "return") {
        searchFocused = false;
        if (searchInput) searchInput.blur();
        // Rebuild so the list is recreated and takes focus back.
        buildMiddleSection();
        return;
      }
      if (searchInput) searchInput.handleKeyPress(key);
      return;
    }

    if (mode === "history" && historyView === "list" && !searchFocused) {
      if (isToggleHistoryKey(key)) {
        toggleHistory();
        return;
      }
      if (key.name === "escape") {
        if (historyQuery || historyFilter !== "all") {
          historyQuery = "";
          if (searchInput) searchInput.value = historyQuery;
          historyFilter = "all";
          historyPage = 0;
          historySelectedId = null;
          buildMiddleSection();
        } else {
          toggleHistory();
        }
        return;
      }
      if (key.sequence === "?" || (key.ctrl && key.name === "k")) {
        toggleHelp();
        return;
      }
      if (key.name === "slash" && !key.shift) {
        searchFocused = true;
        if (searchInput) searchInput.focus();
        return;
      }
      if (key.name === "s" && !key.ctrl) {
        promptShareById(historySelectedId);
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
      if (historySelect && (key.name === "up" || key.name === "down" || key.name === "pageup" || key.name === "pagedown" || key.name === "home" || key.name === "end" || key.name === "k" || key.name === "j")) {
        historySelect.handleKeyPress(key);
        return;
      }
    }

    if (key.ctrl && key.name === "q") {
      quitApp();
    }
    if (key.ctrl && key.name === "k") {
      toggleHelp();
    }
    if (key.ctrl && key.name === "s") {
      saveSession();
      flashModeLabel("#00FF00", 300);
    }
    if (key.ctrl && key.name === "g") {
      promptShareDraft();
    }
    if (key.ctrl && key.name === "e") {
      exportBin();
    }
    if (isToggleHistoryKey(key)) {
      toggleHistory();
    }
    if (isToggleInsightsKey(key)) {
      toggleInsights();
    }
    if (key.ctrl && key.name === "n") {
      newSession();
    }
  });

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
    historyHeaderRightRef = new TextRenderable(renderer, { content: `${total} sessions · ${historyFilter} · Pg [${page + 1}/${totalPages}]`, fg: "#888888" });
    headerRow.add(historyHeaderRightRef);
    historyBox.add(headerRow);

    const searchRow = new BoxRenderable(renderer, { flexDirection: "row", width: "100%", gap: 1 });
    searchRow.add(new TextRenderable(renderer, { content: "Search:", fg: "#888888" }));
    if (searchInput) searchRow.add(searchInput);
    historyBox.add(searchRow);

    if (total === 0) {
      historySelectedId = null;
      historySelect = null;
      historyBox.add(new TextRenderable(renderer, { content: "No sessions match — start writing!", fg: "#666666" }));
      historyBox.add(new TextRenderable(renderer, { content: "Press Esc to clear filters.", fg: "#666666" }));
      return historyBox;
    }

    const initialIndex = historySelectedId
      ? Math.max(0, pageItems.findIndex(s => s.id === historySelectedId))
      : 0;
    // Seed the selection so `s` (share) and `Enter` act on the highlighted row
    // even before the user has pressed an arrow key.
    historySelectedId = pageItems[initialIndex]?.id ?? null;

    historySelect = new SelectRenderable(renderer, {
      options: pageItems.map((s, i) => {
        const d = new Date(s.startedAt);
        const dateStr = d.toLocaleDateString();
        const timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const preview = s.content ? s.content.replace(/\n/g, " ").slice(0, 40) : "(empty)";
        const name = `${String(i + 1).padStart(2)}. ${dateStr} ${timeStr}  ${s.wordCount}w ${s.xpEarned || 0}xp  ${preview}`;
        return { name, description: "", value: s.id };
      }),
      selectedIndex: initialIndex,
      flexGrow: 1,
      showDescription: false,
      showScrollIndicator: true,
      wrapSelection: false,
      focusedBackgroundColor: "#333333",
      focusedTextColor: "#FFFFFF",
      selectedBackgroundColor: "#333333",
    });

    historySelect.on("selectionChanged", (_idx: number, opt: { value?: any } | null) => {
      if (opt && opt.value) historySelectedId = opt.value as string;
    });
    historySelect.on("itemSelected", (_idx: number, opt: { value?: any } | null) => {
      if (opt && opt.value) openReader(opt.value as string);
    });

    historyBox.add(historySelect);
    historySelect.focus();

    const hintRow = new BoxRenderable(renderer, { flexDirection: "row", width: "100%" });
    hintRow.add(new TextRenderable(renderer, {
      content: "? help",
      fg: "#555555",
    }));
    historyBox.add(hintRow);

    if (searchFocused && searchInput) searchInput.focus();

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
        content: wrapText(session.content, Math.max(20, (process.stdout.columns ?? 86) - 6)),
        fg: "#DDDDDD",
      }));
      readerBox.add(historyScroll);
      historyScroll.focus();
    }

    const hint = new TextRenderable(renderer, { content: "? help", fg: "#555555" });
    readerBox.add(hint);

    return readerBox;
  }

  function openReader(id: string) {
    historyReaderId = id;
    historyView = "reader";
    buildMiddleSection();
  }

  function buildHelpSection(section: HelpSection) {
    const box = new BoxRenderable(renderer, { flexDirection: "column" });
    box.add(new TextRenderable(renderer, {
      content: section.title,
      fg: "#FFFF00",
      attributes: TextAttributes.BOLD,
    }));

    const keyWidth = Math.max(...section.rows.map(r => r.keys.length));
    for (const { keys, description } of section.rows) {
      const row = new BoxRenderable(renderer, { flexDirection: "row", flexWrap: "wrap" });
      row.add(new TextRenderable(renderer, {
        content: keys.padEnd(keyWidth + 1),
        fg: primaryColor,
        attributes: TextAttributes.BOLD,
      }));
      row.add(new TextRenderable(renderer, { content: description, fg: "#888888" }));
      box.add(row);
    }
    return box;
  }

  function buildHelp() {
    const helpBox = new BoxRenderable(renderer, {
      flexDirection: "column",
      flexGrow: 1,
      paddingX: 1,
      gap: 1,
    });

    const header = new BoxRenderable(renderer, {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      width: "100%",
    });
    header.add(new TextRenderable(renderer, {
      content: "KEYBOARD SHORTCUTS",
      fg: "#FFFF00",
      attributes: TextAttributes.BOLD,
    }));
    header.add(new TextRenderable(renderer, { content: "Ctrl+K or Esc to close", fg: "#888888" }));
    helpBox.add(header);

    // Two columns so the list stays short; they stack on narrow terminals and
    // the whole panel scrolls when the terminal is too short to hold it.
    helpScroll = new ScrollBoxRenderable(renderer, {
      flexGrow: 1,
      scrollY: true,
      stickyStart: "top",
    });

    const columns = new BoxRenderable(renderer, {
      flexDirection: "row",
      flexWrap: "wrap",
      width: "100%",
      gap: 3,
    });
    const leftColumn = new BoxRenderable(renderer, { flexDirection: "column", flexGrow: 1, minWidth: 30, gap: 1 });
    const rightColumn = new BoxRenderable(renderer, { flexDirection: "column", flexGrow: 1, minWidth: 30, gap: 1 });

    const split = Math.ceil(HELP_SECTIONS.length / 2);
    HELP_SECTIONS.forEach((section, i) => {
      (i < split ? leftColumn : rightColumn).add(buildHelpSection(section));
    });

    columns.add(leftColumn);
    columns.add(rightColumn);
    helpScroll.content.add(columns);
    helpBox.add(helpScroll);
    helpScroll.focus();

    return helpBox;
  }

  function buildGuide() {
    return Box(
      { flexDirection: "column", flexGrow: 1, paddingX: 2, paddingY: 1 },
      Text({ content: "Welcome to WriteStreak!", fg: primaryColor, attributes: TextAttributes.BOLD }),
      Text({ content: " " }),
      Text({ content: "HOW TO WRITE", fg: "#FFFF00", attributes: TextAttributes.BOLD }),
      Text({ content: "Just start typing. Every word earns you XP.", fg: "#888888" }),
      Text({ content: " " }),
      Text({ content: "SCORING", fg: "#FFFF00", attributes: TextAttributes.BOLD }),
      Text({ content: "• 2 XP per word (base)", fg: "#888888" }),
      Text({ content: "• Streak multiplier: +10% per consecutive day", fg: "#888888" }),
      Text({ content: "• Milestone bonuses at 50, 100, 250, 500, 1000 words", fg: "#888888" }),
      Text({ content: "• 12 levels from \"Novice Scribe\" to \"God of Words\"", fg: "#888888" }),
      Text({ content: " " }),
      Text({ content: "CONTROLS", fg: "#FFFF00", attributes: TextAttributes.BOLD }),
      Text({ content: "• Ctrl+K  Show every shortcut (press it any time)", fg: "#888888" }),
      Text({ content: "• Ctrl+S  Save session", fg: "#888888" }),
      Text({ content: "• Ctrl+H  Toggle history", fg: "#888888" }),
      Text({ content: "• Ctrl+G  Share a session as Markdown / Text / HTML", fg: "#888888" }),
      Text({ content: "• Ctrl+Q  Save and quit", fg: "#888888" }),
      Text({ content: " " }),
      Text({ content: "MOUSE", fg: "#FFFF00", attributes: TextAttributes.BOLD }),
      Text({ content: "• Click mode label to cycle views", fg: "#888888" }),
      Text({ content: "• Click color button to cycle themes", fg: "#888888" }),
      Text({ content: " " }),
      Text({ content: "THEMING", fg: "#FFFF00", attributes: TextAttributes.BOLD }),
      Text({ content: "• writestreak --color #efee23", fg: "#888888" }),
      Text({ content: "  Sets your primary color (saved to profile)", fg: "#888888" }),
      Text({ content: " " }),
      Text({ content: "TIPS", fg: "#FFFF00", attributes: TextAttributes.BOLD }),
      Text({ content: "• Write daily to build your streak", fg: "#888888" }),
      Text({ content: "• Sessions auto-resume from last save", fg: "#888888" }),
      Text({ content: "• Export .wbin files to backup your whole profile", fg: "#888888" }),
      Text({ content: "• Ctrl+G writes one session to a shareable file", fg: "#888888" }),
      Text({ content: " " }),
      Text({ content: "Press Enter or Esc to start writing...", fg: primaryColor, attributes: TextAttributes.BOLD })
    );
  }

  function buildInsights() {
    const sessions = stats.sessions;
    const totalSessions = sessions.length;

    const diskBytes = existsSync(SAVE_PATH) ? statSync(SAVE_PATH).size : 0;
    const diskLabel = diskBytes < 1024
      ? `${diskBytes} B`
      : diskBytes < 1048576
        ? `${(diskBytes / 1024).toFixed(1)} KB`
        : `${(diskBytes / 1048576).toFixed(2)} MB`;

    const avgWords = totalSessions > 0
      ? Math.round(sessions.reduce((s, x) => s + x.wordCount, 0) / totalSessions)
      : 0;

    const bestSession = totalSessions > 0
      ? sessions.reduce((best, s) => s.wordCount > best.wordCount ? s : best, sessions[0])
      : null;

    const totalMinutes = sessions.reduce((sum, s) => {
      if (s.startedAt && s.endedAt) return sum + Math.round((s.endedAt - s.startedAt) / 60000);
      return sum;
    }, 0);
    const timeLabel = totalMinutes < 60
      ? `${totalMinutes}m`
      : `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dayCounts = new Array(7).fill(0);
    sessions.forEach(s => {
      if (s.startedAt) dayCounts[new Date(s.startedAt).getDay()]++;
    });
    const bestDayIdx = dayCounts.indexOf(Math.max(...dayCounts));
    const bestDay = totalSessions > 0 ? dayNames[bestDayIdx] : "N/A";

    const now = Date.now();
    const last7: { label: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * 86400000);
      const key = d.toISOString().split("T")[0];
      const dayLabel = dayNames[d.getDay()];
      const count = sessions.filter(s => {
        const sd = new Date(s.startedAt).toISOString().split("T")[0];
        return sd === key;
      }).length;
      last7.push({ label: dayLabel, count });
    }
    const maxDay = Math.max(...last7.map(d => d.count), 1);

    const box = Box(
      { flexDirection: "column", flexGrow: 1, paddingX: 1, gap: 1 },
      Box({ flexDirection: "row", justifyContent: "space-between" },
        Text({ content: "INSIGHTS", fg: "#FFFF00", attributes: TextAttributes.BOLD }),
        Text({ content: "Click mode label to close", fg: "#888888" })
      ),
      totalSessions === 0
        ? Text({ content: "Write a few sessions to see insights", fg: "#666666" })
        : Box({ flexDirection: "row", gap: 3 },
            Box({ flexDirection: "column" },
              Text({ content: "DISK", fg: "#666666" }),
              Text({ content: diskLabel, fg: primaryColor, attributes: TextAttributes.BOLD })
            ),
            Box({ flexDirection: "column" },
              Text({ content: "AVG WORDS", fg: "#666666" }),
              Text({ content: `${avgWords}`, fg: "#FFFFFF", attributes: TextAttributes.BOLD })
            ),
            Box({ flexDirection: "column" },
              Text({ content: "BEST SESSION", fg: "#666666" }),
              Text({ content: bestSession ? `${bestSession.wordCount}w · ${bestSession.xpEarned || 0} XP` : "N/A", fg: "#00FF00", attributes: TextAttributes.BOLD })
            ),
            Box({ flexDirection: "column" },
              Text({ content: "TIME", fg: "#666666" }),
              Text({ content: timeLabel, fg: "#00FFFF", attributes: TextAttributes.BOLD })
            ),
            Box({ flexDirection: "column" },
              Text({ content: "BEST DAY", fg: "#666666" }),
              Text({ content: bestDay, fg: "#FFD700", attributes: TextAttributes.BOLD })
            )
          ),
      Text({ content: " " }),
      Text({ content: "LAST 7 DAYS", fg: "#FFFF00", attributes: TextAttributes.BOLD }),
      ...last7.map(d => {
        const barLen = Math.round((d.count / maxDay) * 20);
        const bar = "█".repeat(barLen) + "░".repeat(20 - barLen);
        return Box({ flexDirection: "row", gap: 1 },
          Text({ content: d.label, fg: "#666666" }),
          Text({ content: bar, fg: primaryColor }),
          Text({ content: `${d.count}`, fg: "#FFFFFF" })
        );
      })
    );

    return box;
  }

  let levelText: TextRenderable | null = null;
  let levelTitleText: TextRenderable | null = null;
  let progressBarText: TextRenderable | null = null;
  let xpProgressText: TextRenderable | null = null;
  let wordsText: TextRenderable | null = null;
  let totalXpText: TextRenderable | null = null;
  let streakText: TextRenderable | null = null;
  let sessionsText: TextRenderable | null = null;
  let longestStreakText: TextRenderable | null = null;
  let wordCountText: TextRenderable | null = null;
  let lineCountText: TextRenderable | null = null;
  let xpGainText: TextRenderable | null = null;
  let xpGainTimeout: NodeJS.Timeout | null = null;
  let milestoneText: TextRenderable | null = null;
  let milestoneTimeout: NodeJS.Timeout | null = null;
  let modeText: TextRenderable | null = null;
  let modeBoxRef: BoxRenderable | null = null;
  let bannerBoxRef: BoxRenderable | null = null;
  let messageText: TextRenderable | null = null;
  let middleContainer: BoxRenderable | null = null;
  let mainContainer: BoxRenderable | null = null;

  const input = new TextareaRenderable(renderer, {
    id: "editor-input",
    width: "100%",
    flexGrow: 1,
    wrapMode: "word",
    placeholder: "Start typing...",
    placeholderColor: "#555555",
    backgroundColor: "transparent",
    textColor: "#FFFFFF",
    cursorColor: primaryColor,
    onContentChange: () => {
      if (mode !== "writing") return;

      const value = input.plainText;
      const oldWordCount = countWords(currentText);
      currentText = value;
      const newWordCount = countWords(currentText);

      if (newWordCount > oldWordCount) {
        const { xp, popups } = calculateXp(newWordCount, oldWordCount, streakInfo.streak);
        stats = {
          ...stats,
          totalXp: stats.totalXp + xp,
          totalWords: stats.totalWords + (newWordCount - oldWordCount),
          currentStreak: streakInfo.streak,
          longestStreak: Math.max(stats.longestStreak, streakInfo.streak),
          lastWriteDate: new Date().toISOString().split("T")[0],
        };
        prevWordCount = newWordCount;
        if (xpGainText) {
          xpGainText.content = `+${xp} XP`;
          xpGainText.fg = streakInfo.streak > 0 ? "#FFD700" : "#00FF00";
          cancel(xpGainTimeout);
          xpGainTimeout = later(() => {
            if (xpGainText) xpGainText.content = "";
          }, 1500);
        }

        const milestonePopup = popups.find(p => p.text.includes("words!"));
        if (milestonePopup && milestoneText) {
          milestoneText.content = `🎉 ${milestonePopup.text}`;
          cancel(milestoneTimeout);
          milestoneTimeout = later(() => {
            if (milestoneText) milestoneText.content = "";
          }, 3000);
        }

        const currentLevel = getLevelInfo(stats.totalXp).level;
        if (currentLevel > previousLevel) {
          const levelInfo = getLevelInfo(stats.totalXp);
          const nextLevel = LEVELS.find(l => l.level === currentLevel + 1);
          const bonusText = nextLevel ? ` → 2 XP/word bonus` : "";
          showMessageLevelUp(`⬆ LEVEL UP! ${levelInfo.title} (LVL ${levelInfo.level})${bonusText}`);
          stats = { ...stats, level: currentLevel };
          previousLevel = currentLevel;
        }
        sessionXp += xp;
      }

      scheduleDraftSave();
      updateEditor();
      updateHeaderStats();
    }
  });

  input.setText(currentText);
  input.focus();

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

  function updateHeaderStats() {
    const levelInfo = getLevelInfo(stats.totalXp);
    const barWidth = 30;
    const filled = Math.floor(levelInfo.progress * barWidth);
    const empty = barWidth - filled;
    const bar = "█".repeat(filled) + "░".repeat(empty);

    if (levelText) levelText.content = `LVL ${levelInfo.level}`;
    if (levelTitleText) levelTitleText.content = levelInfo.title;
    if (progressBarText) progressBarText.content = bar;
    if (xpProgressText) xpProgressText.content = `${levelInfo.currentLevelXp}/${levelInfo.nextLevelXp}`;
    if (wordsText) wordsText.content = `${prevWordCount}`;
    if (totalXpText) totalXpText.content = `${stats.totalXp}`;

    const streak = stats.currentStreak;
    let streakContent: string;
    let streakColor: string;

    if (streak === 0) {
      streakContent = "0d";
      streakColor = "#888888";
    } else {
      const fireCount = Math.min(Math.floor(streak / 3) + 1, 4);
      const fires = "🔥".repeat(fireCount);
      streakContent = `${fires} ${streak}d streak`;

      if (streak <= 2) {
        streakColor = "#FFD700"; // gold
      } else if (streak <= 5) {
        streakColor = "#FF8C00"; // orange
      } else if (streak <= 9) {
        streakColor = "#FF4500"; // red-orange
      } else {
        streakColor = "#FF0000"; // red
      }
    }

    if (streakText) {
      streakText.content = streakContent;
      streakText.fg = streakColor;
    }

    if (sessionsText) sessionsText.content = `${stats.totalSessions}`;
    if (longestStreakText) longestStreakText.content = `${stats.longestStreak}d`;
  }

  function updateEditor() {
    const wordCount = countWords(currentText);
    const lines = currentText.split("\n");

    if (wordCountText) wordCountText.content = `${wordCount} words · ${currentText.length} chars`;
    if (lineCountText) lineCountText.content = `Ln ${lines.length}`;
  }

  function updateModeIndicator() {
    if (modeText) modeText.content = mode.toUpperCase();
  }

  function updateMessage() {
    if (messageText) {
      messageText.content = message;
      messageText.visible = message.length > 0;
    }
  }

  let rebuildingHistory = false;

  function refreshHistoryList() {
    if (rebuildingHistory) return;
    const { pageItems, total, totalPages, page } = filterSessions(stats.sessions, {
      query: historyQuery,
      filter: historyFilter,
      page: historyPage,
      pageSize: PAGE_SIZE,
    });
    historyPage = page;

    if (!historySelect || total === 0) {
      rebuildingHistory = true;
      buildMiddleSection();
      rebuildingHistory = false;
      return;
    }
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
      historyHeaderRightRef.content = `${total} sessions · ${historyFilter} · Pg [${page + 1}/${totalPages}]`;
    }
  }

  function buildMiddleSection() {
    if (middleContainer) {
      middleContainer.getChildren().forEach(child => {
        middleContainer!.remove(child.id);
      });
    } else {
      middleContainer = new BoxRenderable(renderer, {
        flexDirection: "column",
        flexGrow: 1,
        overflow: "hidden",
        paddingX: 1
      });
    }

    if (mode === "guide") {
      middleContainer.add(buildGuide());
    } else if (mode === "history") {
      middleContainer.add(buildHistory());
    } else if (mode === "insights") {
      middleContainer.add(buildInsights());
    } else if (mode === "help") {
      middleContainer.add(buildHelp());
    } else {
      const editorWrapper = new BoxRenderable(renderer, {
        flexDirection: "column",
        flexGrow: 1,
        width: "100%",
        maxWidth: 100,
        alignSelf: "center"
      });

      const statsRow = new BoxRenderable(renderer, {
        flexDirection: "row",
        flexWrap: "wrap",
        flexShrink: 0,
        justifyContent: "space-between",
        gap: 1,
        paddingX: 2
      });

      wordCountText = new TextRenderable(renderer, {
        content: `${countWords(currentText)} words · ${currentText.length} chars`,
        fg: "#666666"
      });

      lineCountText = new TextRenderable(renderer, {
        content: `Ln ${currentText.split("\n").length}`,
        fg: "#666666"
      });

      xpGainText = new TextRenderable(renderer, {
        content: "",
        fg: "#00FF00"
      });

      milestoneText = new TextRenderable(renderer, {
        content: "",
        fg: "#FF00FF"
      });

      statsRow.add(wordCountText);
      statsRow.add(lineCountText);
      statsRow.add(xpGainText);
      statsRow.add(milestoneText);
      editorWrapper.add(input);
      editorWrapper.add(statsRow);
      middleContainer.add(editorWrapper);

      input.focus();
      updateEditor();
    }

    return middleContainer;
  }

  const palette = ["#E8A0BF", "#A8D8EA", "#C8C8C8"];
  const colorNames: Record<string, string> = {
    "#E8A0BF": "Rose",
    "#A8D8EA": "Sky",
    "#C8C8C8": "Dim"
  };
  let paletteIndex = palette.indexOf(primaryColor);
  if (paletteIndex === -1) paletteIndex = 0;

  function cycleColor() {
    paletteIndex = (paletteIndex + 1) % palette.length;
    const newColor = palette[paletteIndex];
    primaryColor = newColor;
    stats = { ...stats, primaryColor: newColor };
    exportToBin(stats, SAVE_PATH);
    buildUI();
    if (bannerBoxRef) {
      bannerBoxRef.borderColor = "#FFFFFF";
      later(() => {
        if (bannerBoxRef) bannerBoxRef.borderColor = newColor;
      }, 300);
    }
  }

  function buildUI() {
    if (mainContainer) {
      renderer.root.remove(mainContainer.id);
    }

    mainContainer = new BoxRenderable(renderer, {
      flexDirection: "column",
      width: "100%",
      height: "100%"
    });

    const headerBox = new BoxRenderable(renderer, {
      flexDirection: "column",
      flexShrink: 0,
      paddingX: 1,
      paddingBottom: 1
    });

    const bannerBox = new BoxRenderable(renderer, {
      flexDirection: "column",
      border: true,
      borderColor: primaryColor,
      paddingX: 2,
      paddingY: 1
    });
    bannerBoxRef = bannerBox;

    const titleRow = new BoxRenderable(renderer, {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      justifyContent: "space-between",
      width: "100%"
    });

    titleRow.add(new TextRenderable(renderer, {
      content: "WRITESTREAK",
      fg: primaryColor,
      attributes: TextAttributes.BOLD
    }));

    titleRow.add(new TextRenderable(renderer, {
      content: `v${VERSION}`,
      fg: "#888888",
      attributes: TextAttributes.DIM
    }));

    const levelBar = new BoxRenderable(renderer, {
      flexDirection: "row",
      alignItems: "center",
      gap: 1
    });

    levelText = new TextRenderable(renderer, {
      content: "",
      fg: primaryColor,
      attributes: TextAttributes.BOLD
    });

    levelTitleText = new TextRenderable(renderer, {
      content: "",
      fg: "#AAAAAA"
    });

    levelBar.add(levelText);
    levelBar.add(levelTitleText);
    titleRow.add(levelBar);

    const colorButton = new BoxRenderable(renderer, {
      backgroundColor: primaryColor,
      paddingX: 2,
      onMouseDown: () => cycleColor()
    });
    colorButton.add(new TextRenderable(renderer, {
      content: colorNames[primaryColor] || "Color",
      fg: "#000000",
      attributes: TextAttributes.BOLD
    }));
    titleRow.add(colorButton);

    bannerBox.add(titleRow);

    const progressRow = new BoxRenderable(renderer, {
      flexDirection: "row",
      alignItems: "center",
      gap: 1,
      marginTop: 1
    });

    progressBarText = new TextRenderable(renderer, {
      content: "",
      fg: primaryColor
    });

    xpProgressText = new TextRenderable(renderer, {
      content: "",
      fg: "#888888"
    });

    progressRow.add(progressBarText);
    progressRow.add(xpProgressText);
    bannerBox.add(progressRow);

    const statsRow = new BoxRenderable(renderer, {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      width: "100%",
      marginTop: 1,
      gap: 2
    });

    const xpBlock = new BoxRenderable(renderer, { flexDirection: "column", alignItems: "center" });
    xpBlock.add(new TextRenderable(renderer, { content: "XP", fg: "#888888" }));
    totalXpText = new TextRenderable(renderer, {
      content: "",
      fg: primaryColor,
      attributes: TextAttributes.BOLD
    });
    xpBlock.add(totalXpText);

    const wordsBlock = new BoxRenderable(renderer, { flexDirection: "column", alignItems: "center" });
    wordsBlock.add(new TextRenderable(renderer, { content: "WORDS", fg: "#888888" }));
    wordsText = new TextRenderable(renderer, {
      content: "",
      fg: "#FFFFFF",
      attributes: TextAttributes.BOLD
    });
    wordsBlock.add(wordsText);

    const streakBlock = new BoxRenderable(renderer, { flexDirection: "column", alignItems: "center" });
    streakBlock.add(new TextRenderable(renderer, { content: "STREAK", fg: "#888888" }));
    streakText = new TextRenderable(renderer, {
      content: "",
      fg: "#888888",
      attributes: TextAttributes.BOLD
    });
    streakBlock.add(streakText);

    const sessionsBlock = new BoxRenderable(renderer, { flexDirection: "column", alignItems: "center" });
    sessionsBlock.add(new TextRenderable(renderer, { content: "SESSIONS", fg: "#888888" }));
    sessionsText = new TextRenderable(renderer, {
      content: "",
      fg: "#FFFFFF",
      attributes: TextAttributes.BOLD
    });
    sessionsBlock.add(sessionsText);

    const longestStreakBlock = new BoxRenderable(renderer, { flexDirection: "column", alignItems: "center" });
    longestStreakBlock.add(new TextRenderable(renderer, { content: "LONGEST", fg: "#888888" }));
    longestStreakText = new TextRenderable(renderer, {
      content: "",
      fg: "#FFD700",
      attributes: TextAttributes.BOLD
    });
    longestStreakBlock.add(longestStreakText);

    statsRow.add(xpBlock);
    statsRow.add(wordsBlock);
    statsRow.add(streakBlock);
    statsRow.add(sessionsBlock);
    statsRow.add(longestStreakBlock);
    bannerBox.add(statsRow);

    headerBox.add(bannerBox);

    mainContainer.add(headerBox);
    mainContainer.add(buildMiddleSection());

    const footerBox = new BoxRenderable(renderer, {
      flexDirection: "column",
      flexShrink: 0,
      paddingX: 1
    });

    messageText = new TextRenderable(renderer, {
      content: "",
      fg: primaryColor,
      attributes: TextAttributes.BOLD,
      visible: false
    });

    footerBox.add(messageText);

    const statusBar = new BoxRenderable(renderer, {
      flexDirection: "row",
      justifyContent: "space-between",
      width: "100%"
    });

    const statusLeft = new BoxRenderable(renderer, {
      flexDirection: "row",
      gap: 1
    });

    const modeBox = new BoxRenderable(renderer, {
      backgroundColor: primaryColor,
      paddingX: 1,
      onMouseDown: () => cycleMode()
    });

    modeText = new TextRenderable(renderer, {
      content: mode.toUpperCase(),
      fg: "#000000",
      attributes: TextAttributes.BOLD
    });

    modeBox.add(modeText);
    modeBoxRef = modeBox;
    statusLeft.add(modeBox);
    statusLeft.add(new TextRenderable(renderer, { content: sessionTitle }));

    const statusRight = new BoxRenderable(renderer, {
      flexDirection: "row",
      gap: 1
    });

    statusRight.add(new TextRenderable(renderer, {
      content: "^K help",
      fg: "#555555"
    }));

    statusBar.add(statusLeft);
    statusBar.add(statusRight);
    footerBox.add(statusBar);

    mainContainer.add(footerBox);
    renderer.root.add(mainContainer);

    updateHeaderStats();
  }

  buildUI();
}

main().catch(console.error);

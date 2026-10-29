import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { HELP_SECTIONS, documentedCtrlKeys } from "./keymap.js";

const APP_SOURCE = readFileSync(new URL("../App.ts", import.meta.url), "utf-8");

describe("HELP_SECTIONS", () => {
  it("has titled sections that all carry rows", () => {
    expect(HELP_SECTIONS.length).toBeGreaterThan(0);
    for (const section of HELP_SECTIONS) {
      expect(section.title.trim()).not.toBe("");
      expect(section.rows.length).toBeGreaterThan(0);
    }
  });

  it("gives every row both a key and a description", () => {
    for (const section of HELP_SECTIONS) {
      for (const row of section.rows) {
        expect(row.keys.trim()).not.toBe("");
        expect(row.description.trim()).not.toBe("");
      }
    }
  });

  it("does not list the same key twice within a section", () => {
    for (const section of HELP_SECTIONS) {
      const keys = section.rows.map(r => r.keys);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("uses unique section titles", () => {
    const titles = HELP_SECTIONS.map(s => s.title);
    expect(new Set(titles).size).toBe(titles.length);
  });
});

// Guards against the classic failure of hand-written help: the app grows a
// binding and the panel silently keeps lying about what exists.
describe("help stays in sync with App.ts", () => {
  /** Ctrl-chords App.ts actually reacts to, e.g. `key.ctrl && key.name === "s"`. */
  function boundCtrlKeys(): Set<string> {
    const found = new Set<string>();
    const pattern = /key\.ctrl\s*&&\s*key\.name\s*===\s*"([a-z])"/g;
    for (const match of APP_SOURCE.matchAll(pattern)) found.add(match[1]);
    return found;
  }

  it("documents every Ctrl chord the app binds", () => {
    const undocumented = [...boundCtrlKeys()].filter(k => !documentedCtrlKeys().has(k));
    expect(undocumented).toEqual([]);
  });

  it("finds the bindings it claims to check (guards the regex itself)", () => {
    const bound = boundCtrlKeys();
    expect(bound.size).toBeGreaterThanOrEqual(6);
    for (const key of ["s", "n", "e", "h", "i", "q", "g", "k", "c"]) {
      expect(bound).toContain(key);
    }
  });

  it("does not document a Ctrl chord the app never binds", () => {
    const stale = [...documentedCtrlKeys()].filter(k => !boundCtrlKeys().has(k));
    expect(stale).toEqual([]);
  });

  it("handles Ctrl+C in-app so the draft can be flushed before teardown", () => {
    expect(APP_SOURCE).toContain("exitOnCtrlC: false");
    expect(APP_SOURCE).toMatch(/key\.ctrl && key\.name === "c"/);
  });
});

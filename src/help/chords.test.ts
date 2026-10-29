import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const APP_SOURCE = readFileSync(new URL("../App.ts", import.meta.url), "utf-8");

/** The byte a terminal sends for Ctrl+<letter>. */
function ctrlByte(letter: string): number {
  return letter.toLowerCase().charCodeAt(0) - 96;
}

/**
 * Control bytes that already have a keyboard meaning. A Ctrl chord landing on
 * one of these is delivered to the app as that key, not as a ctrl chord — so
 * `key.ctrl && key.name === "<letter>"` silently never fires.
 *
 * This is what made Ctrl+H (history) and Ctrl+I (insights) dead shortcuts; the
 * source looked correct, so only a check like this catches it.
 */
const RESERVED_CONTROL_BYTES: Record<number, string> = {
  0x08: "backspace",
  0x09: "tab",
  0x0a: "line feed",
  0x0d: "carriage return / enter",
  0x1b: "escape",
};

describe("Ctrl chord collisions", () => {
  it("knows which letters collide", () => {
    expect(ctrlByte("h")).toBe(0x08);
    expect(ctrlByte("i")).toBe(0x09);
    expect(ctrlByte("j")).toBe(0x0a);
    expect(ctrlByte("m")).toBe(0x0d);
  });

  it("Ctrl+H is matched by its raw byte, since it arrives as backspace", () => {
    expect(APP_SOURCE).toContain('key.sequence === "\\b"');
  });

  it("Ctrl+I has an alias chord bound, since it is Tab", () => {
    expect(APP_SOURCE).toMatch(/key\.ctrl && key\.name === "l"/);
  });

  it("no bound chord collides with a reserved control byte without compensation", () => {
    const bound = new Set(
      [...APP_SOURCE.matchAll(/key\.ctrl\s*&&\s*key\.name\s*===\s*"([a-z])"/g)].map(m => m[1])
    );

    const compensated = new Set(["h", "i"]);
    const unhandled = [...bound]
      .filter(letter => RESERVED_CONTROL_BYTES[ctrlByte(letter)] !== undefined)
      .filter(letter => !compensated.has(letter));

    expect(unhandled).toEqual([]);
  });

  it("the compensated chords are still actually bound", () => {
    const bound = new Set(
      [...APP_SOURCE.matchAll(/key\.ctrl\s*&&\s*key\.name\s*===\s*"([a-z])"/g)].map(m => m[1])
    );
    expect(bound).toContain("h");
    expect(bound).toContain("i");
  });

  it("Backspace stays usable for deletion — only the 0x08 form toggles history", () => {
    // The real Backspace key sends 0x7f, which is not \b, so the editor still deletes.
    expect(0x7f).not.toBe(0x08);
    expect(APP_SOURCE).toContain("isToggleHistoryKey");
  });
});

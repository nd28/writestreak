import { describe, it, expect } from "vitest";
import { parseArgs, DEFAULT_LIMIT } from "./args.js";

describe("parseArgs — dispatch", () => {
  it("treats no args and unknown leading flags as a TUI launch", () => {
    expect(parseArgs([]).kind).toBe("tui");
    expect(parseArgs(["--skip-guide"]).kind).toBe("tui");
    expect(parseArgs(["--color", "#ff0000"]).kind).toBe("tui");
  });

  it("recognises help and version in both flag and word form", () => {
    for (const a of ["help", "--help", "-h"]) expect(parseArgs([a]).kind).toBe("help");
    for (const a of ["version", "--version", "-v"]) expect(parseArgs([a]).kind).toBe("version");
  });
});

describe("parseArgs — list", () => {
  it("defaults sensibly", () => {
    const cmd = parseArgs(["list"]);
    expect(cmd).toMatchObject({
      kind: "list", json: false, limit: DEFAULT_LIMIT, page: 0,
      query: "", filter: "all", content: false, file: null,
    });
  });

  it("reads every option", () => {
    expect(parseArgs([
      "list", "--json", "--content", "--limit", "5", "--page", "2",
      "--query", "fog", "--filter", "words", "--file", "/tmp/a.bin",
    ])).toMatchObject({
      kind: "list", json: true, content: true, limit: 5,
      page: 1, query: "fog", filter: "words", file: "/tmp/a.bin",
    });
  });

  it("--all lifts the limit", () => {
    const cmd = parseArgs(["list", "--all"]);
    expect(cmd.kind === "list" && cmd.limit).toBe(Number.POSITIVE_INFINITY);
  });

  it("converts --page to a 0-based index", () => {
    expect(parseArgs(["list", "--page", "3"])).toMatchObject({ page: 2 });
  });

  it("rejects bad values", () => {
    expect(parseArgs(["list", "--limit", "0"]).kind).toBe("error");
    expect(parseArgs(["list", "--limit", "x"]).kind).toBe("error");
    expect(parseArgs(["list", "--page", "0"]).kind).toBe("error");
    expect(parseArgs(["list", "--filter", "bogus"]).kind).toBe("error");
    expect(parseArgs(["list", "--nope"]).kind).toBe("error");
  });

  it("rejects a flag with a missing value instead of eating the next flag", () => {
    expect(parseArgs(["list", "--limit"]).kind).toBe("error");
    expect(parseArgs(["list", "--query", "--json"]).kind).toBe("error");
  });
});

describe("parseArgs — show", () => {
  it("defaults to txt, or json when --json is given", () => {
    expect(parseArgs(["show", "latest"])).toMatchObject({ kind: "show", target: "latest", format: "txt" });
    expect(parseArgs(["show", "latest", "--json"])).toMatchObject({ format: "json" });
  });

  it("lets --format win over --json", () => {
    expect(parseArgs(["show", "1", "--json", "--format", "html"])).toMatchObject({ format: "html" });
  });

  it("accepts every documented format", () => {
    for (const f of ["md", "txt", "html", "json", "raw"]) {
      expect(parseArgs(["show", "1", "--format", f])).toMatchObject({ format: f });
    }
    expect(parseArgs(["show", "1", "--format", "pdf"]).kind).toBe("error");
  });

  it("requires exactly one target", () => {
    expect(parseArgs(["show"]).kind).toBe("error");
    expect(parseArgs(["show", "1", "2"]).kind).toBe("error");
  });
});

describe("parseArgs — stats", () => {
  it("supports --json and --file", () => {
    expect(parseArgs(["stats"])).toMatchObject({ kind: "stats", json: false, file: null });
    expect(parseArgs(["stats", "--json", "--file", "/tmp/b.bin"]))
      .toMatchObject({ kind: "stats", json: true, file: "/tmp/b.bin" });
  });
});

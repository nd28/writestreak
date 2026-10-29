import { FILTER_ORDER } from "../history/filter.js";
import type { FilterKind } from "../history/filter.js";

export type ShowFormat = "md" | "txt" | "html" | "json" | "raw";

export const SHOW_FORMATS: ShowFormat[] = ["md", "txt", "html", "json", "raw"];

export interface CommonArgs {
  /** Save file to read; null means "resolve the default at run time". */
  file: string | null;
}

export interface ListCommand extends CommonArgs {
  kind: "list";
  json: boolean;
  limit: number;
  page: number;
  query: string;
  filter: FilterKind;
  content: boolean;
}

export interface ShowCommand extends CommonArgs {
  kind: "show";
  target: string;
  format: ShowFormat;
}

export interface StatsCommand extends CommonArgs {
  kind: "stats";
  json: boolean;
}

export type CliCommand =
  | ListCommand
  | ShowCommand
  | StatsCommand
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "tui" }
  | { kind: "error"; message: string };

export const DEFAULT_LIMIT = 20;

function readValue(argv: string[], i: number, flag: string): { value: string; next: number } | { error: string } {
  const value = argv[i + 1];
  if (value === undefined || value.startsWith("-")) {
    return { error: `${flag} needs a value` };
  }
  return { value, next: i + 1 };
}

/**
 * Maps argv to a command. Anything that is not a known subcommand falls through
 * to `tui`, so the existing `--color` / `--skip-guide` flags still launch the app.
 */
export function parseArgs(argv: string[]): CliCommand {
  const first = argv[0];

  if (first === "--help" || first === "-h" || first === "help") return { kind: "help" };
  if (first === "--version" || first === "-v" || first === "version") return { kind: "version" };

  if (first !== "list" && first !== "show" && first !== "stats") return { kind: "tui" };

  const rest = argv.slice(1);
  let file: string | null = null;
  let json = false;
  let content = false;
  let limit = DEFAULT_LIMIT;
  let page = 0;
  let query = "";
  let filter: FilterKind = "all";
  let format: ShowFormat | null = null;
  const positional: string[] = [];

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];

    if (arg === "--json") { json = true; continue; }
    if (arg === "--content") { content = true; continue; }
    if (arg === "--all") { limit = Number.POSITIVE_INFINITY; continue; }

    if (arg === "--file" || arg === "--limit" || arg === "--page" || arg === "--query" || arg === "--filter" || arg === "--format") {
      const read = readValue(rest, i, arg);
      if ("error" in read) return { kind: "error", message: read.error };
      i = read.next;

      if (arg === "--file") { file = read.value; continue; }
      if (arg === "--query") { query = read.value; continue; }
      if (arg === "--limit") {
        const n = Number(read.value);
        if (!Number.isInteger(n) || n < 1) return { kind: "error", message: "--limit needs a positive integer" };
        limit = n;
        continue;
      }
      if (arg === "--page") {
        const n = Number(read.value);
        if (!Number.isInteger(n) || n < 1) return { kind: "error", message: "--page needs a positive integer" };
        page = n - 1;
        continue;
      }
      if (arg === "--filter") {
        if (!FILTER_ORDER.includes(read.value as FilterKind)) {
          return { kind: "error", message: `--filter must be one of: ${FILTER_ORDER.join(", ")}` };
        }
        filter = read.value as FilterKind;
        continue;
      }
      if (arg === "--format") {
        if (!SHOW_FORMATS.includes(read.value as ShowFormat)) {
          return { kind: "error", message: `--format must be one of: ${SHOW_FORMATS.join(", ")}` };
        }
        format = read.value as ShowFormat;
        continue;
      }
    }

    if (arg.startsWith("-")) return { kind: "error", message: `unknown option: ${arg}` };
    positional.push(arg);
  }

  if (first === "list") return { kind: "list", json, limit, page, query, filter, content, file };
  if (first === "stats") return { kind: "stats", json, file };

  if (positional.length === 0) {
    return { kind: "error", message: "show needs a target: an id, a 1-based index, or `latest`" };
  }
  if (positional.length > 1) {
    return { kind: "error", message: `show takes one target, got ${positional.length}` };
  }
  return { kind: "show", target: positional[0], format: format ?? (json ? "json" : "txt"), file };
}

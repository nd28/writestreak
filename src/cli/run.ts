import { existsSync } from "node:fs";
import { importFromBin } from "../storage/msgpack.js";
import { renderList, renderShow, renderStats, resolveTarget, helpText } from "./render.js";
import type { CliCommand } from "./args.js";

export const DEFAULT_SAVE_PATH = "./writestreak.bin";

export function resolveSavePath(file: string | null, env: NodeJS.ProcessEnv = process.env): string {
  return file ?? env.WRITESTREAK_FILE ?? DEFAULT_SAVE_PATH;
}

export interface CliResult {
  stdout: string;
  stderr: string;
  code: number;
}

function fail(message: string): CliResult {
  return { stdout: "", stderr: `writestreak: ${message}`, code: 1 };
}

/** Pure enough to test: returns what to print rather than printing it. */
export function runCli(command: CliCommand, version: string): CliResult {
  if (command.kind === "help") return { stdout: helpText(version), stderr: "", code: 0 };
  if (command.kind === "version") return { stdout: version, stderr: "", code: 0 };
  if (command.kind === "error") {
    return { stdout: "", stderr: `writestreak: ${command.message}\nTry \`writestreak help\`.`, code: 1 };
  }
  if (command.kind === "tui") return { stdout: "", stderr: "", code: 0 };

  const path = resolveSavePath(command.file);
  if (!existsSync(path)) return fail(`no save file at ${path}`);

  const stats = importFromBin(path);
  if (!stats) return fail(`${path} is not a WriteStreak save file`);

  if (command.kind === "stats") {
    return { stdout: renderStats(stats, version, command.json), stderr: "", code: 0 };
  }

  if (command.kind === "list") {
    return { stdout: renderList(stats, command), stderr: "", code: 0 };
  }

  const found = resolveTarget(stats.sessions, command.target);
  if ("error" in found) return fail(found.error);

  return {
    stdout: renderShow(found.session, found.index, stats, version, command.format),
    stderr: "",
    code: 0,
  };
}

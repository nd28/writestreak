#!/usr/bin/env bun
import { parseArgs } from "./cli/args.js";
import { runCli } from "./cli/run.js";
import pkg from "../package.json" with { type: "json" };

const command = parseArgs(process.argv.slice(2));

if (command.kind === "tui") {
  // Imported lazily: App.ts starts the renderer on import, so a CLI run must
  // never reach it.
  await import("./App.js");
} else {
  const result = runCli(command, pkg.version);
  if (result.stdout) process.stdout.write(result.stdout + "\n");
  if (result.stderr) process.stderr.write(result.stderr + "\n");
  process.exit(result.code);
}

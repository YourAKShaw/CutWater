// Copyright 2026 Ayush Kumar Shaw
// SPDX-License-Identifier: Apache-2.0

import { CutwaterError } from "./errors.ts";

export interface ParsedArgs {
  positionals: string[];
  flags: Map<string, string | true>;
}

/**
 * Minimal argv parser. `--flag value`, `--flag=value` and boolean flags
 * (listed in `booleans`) are supported. `-` is a positional (stdin).
 */
export function parseArgs(argv: string[], booleans: ReadonlySet<string>): ParsedArgs {
  const positionals: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (arg === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
      if (eq !== -1) {
        flags.set(name, arg.slice(eq + 1));
      } else if (booleans.has(name)) {
        flags.set(name, true);
      } else {
        const value = argv[i + 1];
        if (value === undefined || (value.startsWith("--") && value !== "--")) {
          throw new CutwaterError("USAGE", `--${name} needs a value`);
        }
        flags.set(name, value);
        i++;
      }
      continue;
    }
    positionals.push(arg);
  }
  return { positionals, flags };
}

export function stringFlag(args: ParsedArgs, name: string): string | null {
  const value = args.flags.get(name);
  if (value === undefined) return null;
  if (value === true) throw new CutwaterError("USAGE", `--${name} needs a value`);
  return value;
}

export function requireFlag(args: ParsedArgs, name: string): string {
  const value = stringFlag(args, name);
  if (value === null || value === "") throw new CutwaterError("USAGE", `--${name} is required`);
  return value;
}

export function boolFlag(args: ParsedArgs, name: string): boolean {
  const value = args.flags.get(name);
  return value === true || value === "true";
}

export function intFlag(args: ParsedArgs, name: string): number | null {
  const value = stringFlag(args, name);
  if (value === null) return null;
  if (!/^\d+$/.test(value)) throw new CutwaterError("USAGE", `--${name} must be a whole number`);
  return Number(value);
}

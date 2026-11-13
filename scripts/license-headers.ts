// Copyright 2026 Ayush Kumar Shaw
// SPDX-License-Identifier: Apache-2.0

/**
 * License header check: every tracked source file the maintainer owns must
 * carry the copyright line and the Apache-2.0 SPDX identifier as whole
 * comment lines near the top (below a shebang).
 *
 *   node scripts/license-headers.ts          # check, exit 1 on a miss
 *   node scripts/license-headers.ts --fix    # add missing headers
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const OWNER = "Ayush Kumar Shaw";
export const SPDX = "Apache-2.0";
/** Lines from the top (shebang included) the header must appear in. */
export const HEADER_WINDOW = 4;

/**
 * Not ours to stamp: templates cutwater copies into other people's
 * repositories, license texts, and formats without comments.
 */
const SKIP: RegExp[] = [
  /^skills\/cutwater\/assets\//,
  /(^|\/)(LICENSE|NOTICE)$/,
  /\.(md|json|txt|svg)$/,
  /(^|\/)\.nvmrc$/,
  /(^|\/)package-lock\.json$/,
];

const SLASH = /\.(ts|mts|cts|js|mjs|cjs)$/;
const HASH = /\.(py|sh|ya?ml|rules)$|(^|\/)\.(editorconfig|gitignore|prettierignore)$/;
/** Extensionless executables, by path. */
const NODE_SCRIPTS = new Set(["test/fake-gh/bin/gh"]);

/** The comment prefix for an owned source file, or null to skip it. */
export function commentFor(path: string): "//" | "#" | null {
  if (SKIP.some((rule) => rule.test(path))) return null;
  if (SLASH.test(path) || NODE_SCRIPTS.has(path)) return "//";
  if (HASH.test(path)) return "#";
  return null;
}

export function headerLines(comment: string, year: number): string[] {
  return [`${comment} Copyright ${year} ${OWNER}`, `${comment} SPDX-License-Identifier: ${SPDX}`];
}

export function hasHeader(text: string, comment: string): boolean {
  const top = text.replace(/\r\n?/g, "\n").split("\n").slice(0, HEADER_WINDOW);
  const esc = comment.replace(/[/]/g, "\\/");
  const copyright = new RegExp(`^${esc} Copyright [0-9]{4} ${OWNER}$`);
  return (
    top.some((line) => copyright.test(line)) &&
    top.includes(`${comment} SPDX-License-Identifier: ${SPDX}`)
  );
}

/** Inserts the header below a shebang, separated from the rest by a blank line. */
export function addHeader(text: string, comment: string, year: number): string {
  if (hasHeader(text, comment)) return text;
  const header = headerLines(comment, year).join("\n");
  const shebang = /^#![^\n]*\n/.exec(text);
  const head = shebang ? shebang[0] : "";
  const rest = text.slice(head.length);
  return `${head}${header}\n${rest === "" || rest.startsWith("\n") ? "" : "\n"}${rest}`;
}

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/** The year the file was first committed; the current year for a new file. */
export function creationYear(path: string, cwd: string): number {
  const years = git(
    ["log", "--follow", "--diff-filter=A", "--format=%ad", "--date=format:%Y", "--", path],
    cwd,
  )
    .trim()
    .split("\n")
    .filter((line) => /^\d{4}$/.test(line));
  const first = years.at(-1);
  return first ? Number(first) : new Date().getFullYear();
}

export interface HeaderReport {
  checked: number;
  missing: string[];
  fixed: string[];
}

export function checkHeaders(root: string, fix = false): HeaderReport {
  // A failed listing must never look like "nothing to check".
  const files = git(["ls-files", "-z"], root)
    .split("\0")
    .filter((file) => file !== "");
  const report: HeaderReport = { checked: 0, missing: [], fixed: [] };
  for (const file of files) {
    const comment = commentFor(file);
    if (!comment) continue;
    report.checked++;
    const full = resolve(root, file);
    const text = readFileSync(full, "utf8");
    if (hasHeader(text, comment)) continue;
    if (fix) {
      writeFileSync(full, addHeader(text, comment, creationYear(file, root)));
      report.fixed.push(file);
    } else report.missing.push(file);
  }
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const fix = process.argv.includes("--fix");
  let report: HeaderReport;
  try {
    report = checkHeaders(root, fix);
  } catch (error) {
    console.error(`✖ could not list or read tracked files: ${(error as Error).message}`);
    process.exit(1);
  }
  for (const file of report.fixed) console.log(`+ ${file}`);
  if (report.fixed.length > 0) {
    // --fix edits the working tree only; the index still holds the old content.
    // Literal pathspecs so a name like src/[id].ts cannot also stage src/i.ts.
    const quoted = report.fixed.map((file) => `'${file.replace(/'/g, "'\\''")}'`).join(" ");
    console.log(
      `Stage the fixed files so the commit includes the headers:\n  git --literal-pathspecs add -- ${quoted}`,
    );
  }
  for (const file of report.missing) console.error(`✖ ${file}: missing copyright or SPDX header`);
  if (report.checked === 0) {
    console.error("✖ no owned source files found; refusing to pass");
    process.exit(1);
  }
  if (report.missing.length > 0) {
    console.error(`Run \`node scripts/license-headers.ts --fix\` to add them.`);
    process.exit(1);
  }
  console.log(
    fix
      ? `✔ added ${report.fixed.length} headers (${report.checked} files checked)`
      : `✔ every source file has a license header (${report.checked} checked)`,
  );
}

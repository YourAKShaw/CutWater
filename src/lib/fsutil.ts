// Copyright 2026 Ayush Kumar Shaw
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, posix } from "node:path";

/** Convert CRLF and lone CR line endings to LF. Hashes are always taken after this. */
export function normalizeEol(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

/** SHA-256 of the EOL-normalised text, so CRLF checkouts hash like LF ones. */
export function sha256(text: string): string {
  return createHash("sha256").update(normalizeEol(text), "utf8").digest("hex");
}

export function readText(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

export function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

export function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function listDir(path: string): string[] {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

/** Write via a temporary file and rename, creating parent directories. */
export function writeTextAtomic(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.cutwater-${process.pid}.tmp`;
  writeFileSync(tmp, text, "utf8");
  renameSync(tmp, path);
}

/**
 * Find the first existing file among `dirs` whose name matches `name`
 * (case-insensitive). Returns a repo-relative POSIX path or null.
 */
export function findFile(root: string, dirs: string[], name: RegExp): string | null {
  for (const dir of dirs) {
    const abs = dir === "" ? root : join(root, dir);
    for (const entry of listDir(abs).sort()) {
      if (name.test(entry) && isFile(join(abs, entry))) {
        return dir === "" ? entry : posix.join(dir, entry);
      }
    }
  }
  return null;
}

/**
 * Line ending to write for a repo-relative path, from `.gitattributes`.
 * Supports the common `* text eol=crlf` and `*.ext eol=crlf` forms; the last
 * matching line wins, as in git. Defaults to LF.
 */
export function eolFor(root: string, relPath: string): "\n" | "\r\n" {
  const attrs = readText(join(root, ".gitattributes"));
  if (attrs === null) return "\n";
  const base = posix.basename(relPath);
  let eol: "\n" | "\r\n" = "\n";
  for (const raw of normalizeEol(attrs).split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const [pattern, ...attributes] = line.split(/\s+/);
    if (pattern === undefined || !globMatch(pattern, pattern.includes("/") ? relPath : base))
      continue;
    for (const attribute of attributes) {
      if (attribute === "eol=crlf") eol = "\r\n";
      if (attribute === "eol=lf" || attribute === "-text" || attribute === "binary") eol = "\n";
    }
  }
  return eol;
}

function globMatch(pattern: string, value: string): boolean {
  const re = new RegExp(
    `^${pattern
      .replace(/^\//, "")
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*/g, "\uffff")
      .replace(/\*/g, "[^/]*")
      .replace(/\?/g, "[^/]")
      .replace(/\uffff/g, ".*")}$`,
  );
  return re.test(value);
}

export function withEol(text: string, eol: "\n" | "\r\n"): string {
  const lf = normalizeEol(text);
  return eol === "\n" ? lf : lf.replace(/\n/g, "\r\n");
}

export { existsSync };

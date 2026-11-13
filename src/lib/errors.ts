// Copyright 2026 Ayush Kumar Shaw
// SPDX-License-Identifier: Apache-2.0

/**
 * Typed errors and exit codes.
 *
 * Exit codes (documented in SKILL.md):
 *   0 ok, 1 usage or validation error, 2 needs confirmation,
 *   3 auth or scope problem, 4 conflict, 5 remote error.
 */

export type ErrorCode =
  | "AUTH"
  | "SCOPE"
  | "NOT_FOUND"
  | "RATE_LIMIT"
  | "CONFLICT"
  | "VALIDATION"
  | "REMOTE"
  | "USAGE"
  | "FORBIDDEN"
  | "SECRET"
  | "NEEDS_CONFIRMATION";

export const EXIT = {
  OK: 0,
  ERROR: 1,
  NEEDS_CONFIRMATION: 2,
  AUTH: 3,
  CONFLICT: 4,
  REMOTE: 5,
} as const;

export const REMEDIATION: Record<ErrorCode, string> = {
  AUTH: "Run `gh auth login` (or `gh auth refresh`) and try again.",
  SCOPE:
    "The token lacks a permission. Run `gh auth refresh -s <scope>` or use a fine-grained token with the needed repository permission.",
  NOT_FOUND:
    "Check the repository name and that your account can see it; private repositories need the `repo` scope.",
  RATE_LIMIT: "GitHub rate-limited the request. Wait a few minutes and run the command again.",
  CONFLICT:
    "The target changed since the plan was made. Run `audit` and `plan` again, then review the new plan.",
  VALIDATION: "GitHub rejected the request body. Check the input values and the gh version.",
  REMOTE: "GitHub returned an unexpected error. Retry later; if it persists, run the step by hand.",
  USAGE: "Run `node scripts/cutwater.mjs help` for usage.",
  FORBIDDEN: "cutwater never runs this command. Ask the user to do it themselves.",
  SECRET: "Remove the secret from the text before posting it. Never post credentials to GitHub.",
  NEEDS_CONFIRMATION:
    "Show the user the listed items (with diffs), ask for an explicit yes, then pass the approved ids with --yes or --yes-file.",
};

export class CutwaterError extends Error {
  readonly code: ErrorCode;
  readonly remediation: string;
  readonly details: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "CutwaterError";
    this.code = code;
    this.remediation = REMEDIATION[code];
    this.details = details;
  }

  toJSON(): Record<string, unknown> {
    return {
      error: this.code,
      message: this.message,
      remediation: this.remediation,
      ...(this.details === undefined ? {} : { details: this.details }),
    };
  }
}

export function exitCodeFor(code: ErrorCode): number {
  switch (code) {
    case "NEEDS_CONFIRMATION":
      return EXIT.NEEDS_CONFIRMATION;
    case "AUTH":
    case "SCOPE":
      return EXIT.AUTH;
    case "CONFLICT":
      return EXIT.CONFLICT;
    case "NOT_FOUND":
    case "RATE_LIMIT":
    case "REMOTE":
      return EXIT.REMOTE;
    case "VALIDATION":
    case "USAGE":
    case "FORBIDDEN":
    case "SECRET":
      return EXIT.ERROR;
  }
}

export interface GhFailure {
  code: ErrorCode;
  transient: boolean;
  status: number | null;
}

/** Map a failed gh invocation's stderr to a typed error. */
export function classifyGhFailure(stderr: string): GhFailure {
  const text = stderr.toLowerCase();
  const statusMatch = /http (\d{3})/i.exec(stderr);
  const status = statusMatch ? Number(statusMatch[1]) : null;

  if (text.includes("secondary rate limit") || text.includes("abuse detection")) {
    return { code: "RATE_LIMIT", transient: true, status };
  }
  if (status !== null && status >= 500) return { code: "REMOTE", transient: true, status };
  if (
    text.includes("gh auth login") ||
    text.includes("not logged in") ||
    text.includes("authentication required") ||
    status === 401
  ) {
    return { code: "AUTH", transient: false, status };
  }
  if (text.includes("rate limit")) return { code: "RATE_LIMIT", transient: false, status };
  if (
    status === 403 ||
    text.includes("resource not accessible") ||
    text.includes("missing required scope") ||
    text.includes("requires the") ||
    text.includes("must have admin rights")
  ) {
    return { code: "SCOPE", transient: false, status };
  }
  if (
    status === 404 ||
    text.includes("could not resolve to a repository") ||
    text.includes("not found")
  ) {
    return { code: "NOT_FOUND", transient: false, status };
  }
  if (status === 409 || text.includes("already exists") || text.includes("already_exists")) {
    return { code: "CONFLICT", transient: false, status };
  }
  if (status === 422 || status === 400) return { code: "VALIDATION", transient: false, status };
  if (text.includes("timeout") || text.includes("connection reset") || text.includes("eof")) {
    return { code: "REMOTE", transient: true, status };
  }
  // A failure with no recognisable cause is treated as a permanent remote
  // error: retrying unknown failures could repeat a partial write.
  return { code: "REMOTE", transient: false, status };
}

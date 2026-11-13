// Copyright 2026 Ayush Kumar Shaw
// SPDX-License-Identifier: Apache-2.0

/**
 * Conventional Commits 1.0.0 linter used before every commit.
 *
 * Accepts an optional gitmoji after the colon (`feat(ui): :sparkles: add x`
 * or `feat(ui): ✨ add x`), never before the type, because a leading emoji
 * makes the header unparseable for changelog and release tools.
 */

export const COMMIT_TYPES = [
  "feat",
  "fix",
  "docs",
  "style",
  "refactor",
  "perf",
  "test",
  "build",
  "ci",
  "chore",
  "revert",
] as const;

export interface LintIssue {
  rule: string;
  message: string;
}

export interface LintResult {
  valid: boolean;
  header: string;
  type: string | null;
  scope: string | null;
  breaking: boolean;
  errors: LintIssue[];
  warnings: LintIssue[];
}

export interface LintOptions {
  /** Require a reference to this issue number in the header or footer. */
  issue?: number | null;
  types?: readonly string[];
  /** Hard header limit; longer than 72 is a warning. */
  maxHeader?: number;
}

const HEADER = /^(?<type>[A-Za-z]+)(?:\((?<scope>[^()]*)\))?(?<bang>!)?: (?<subject>.*)$/;
const SHORTCODE = /^:[a-z0-9_+-]+:\s+/;
const UNICODE_EMOJI =
  /^(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})(?:\uFE0F|\u200D|\p{Extended_Pictographic})*\s+/u;
const LEADING_EMOJI = /^(?::[a-z0-9_+-]+:|\p{Extended_Pictographic})/u;

export function stripGitmoji(subject: string): { emoji: string | null; text: string } {
  const match = SHORTCODE.exec(subject) ?? UNICODE_EMOJI.exec(subject);
  if (!match) return { emoji: null, text: subject };
  return { emoji: match[0].trim(), text: subject.slice(match[0].length) };
}

export function lintCommit(raw: string, opts: LintOptions = {}): LintResult {
  const types = opts.types ?? COMMIT_TYPES;
  const maxHeader = opts.maxHeader ?? 100;
  const errors: LintIssue[] = [];
  const warnings: LintIssue[] = [];
  const lines = raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => !line.startsWith("# ") && line !== "#");
  while (lines.length > 0 && lines[lines.length - 1]?.trim() === "") lines.pop();
  const header = lines[0] ?? "";
  const result: LintResult = {
    valid: false,
    header,
    type: null,
    scope: null,
    breaking: false,
    errors,
    warnings,
  };

  if (header.trim() === "") {
    errors.push({ rule: "header-empty", message: "The commit message is empty." });
    return result;
  }
  if (/^Merge /.test(header)) {
    errors.push({ rule: "merge-commit", message: "cutwater never creates merge commits." });
    return result;
  }

  const match = HEADER.exec(header);
  if (!match?.groups) {
    if (/^\[[^\]]*\]\s*[a-z]+(\([^)]*\))?!?:/i.test(header)) {
      errors.push({
        rule: "ticket-position",
        message: "Tracker keys never go in a commit header; move it to a `Refs: KEY-123` footer.",
      });
      return result;
    }
    const hint = LEADING_EMOJI.test(header)
      ? " Put the emoji after the colon: `feat(scope): :sparkles: subject`."
      : " Expected `type(scope): subject`.";
    errors.push({ rule: "header-format", message: `Header is not a Conventional Commit.${hint}` });
    return result;
  }
  const { type = "", scope, bang, subject = "" } = match.groups;
  result.type = type;
  result.scope = scope ?? null;

  if (type !== type.toLowerCase()) {
    errors.push({ rule: "type-case", message: `Type "${type}" must be lower case.` });
  }
  if (!types.includes(type.toLowerCase())) {
    errors.push({
      rule: "type-enum",
      message: `Type "${type}" must be one of: ${types.join(", ")}.`,
    });
  }
  if (scope !== undefined) {
    if (scope.trim() === "")
      errors.push({ rule: "scope-empty", message: "Scope parentheses are empty." });
    else if (!/^[a-z0-9][a-z0-9._/-]*$/.test(scope)) {
      errors.push({
        rule: "scope-case",
        message: `Scope "${scope}" must be lower-case kebab-case.`,
      });
    }
  }

  const { text } = stripGitmoji(subject);
  if (text.trim() === "") {
    errors.push({ rule: "subject-empty", message: "The subject is empty." });
  } else {
    if (/\.$/.test(text))
      errors.push({ rule: "subject-full-stop", message: "Do not end the subject with a period." });
    if (/^[A-Z][a-z]/.test(text)) {
      warnings.push({
        rule: "subject-case",
        message: "Start the subject with a lower-case imperative verb.",
      });
    }
    if (text !== text.trimStart())
      errors.push({
        rule: "subject-whitespace",
        message: "Remove the extra space before the subject.",
      });
  }
  if (header.length > maxHeader) {
    errors.push({
      rule: "header-max-length",
      message: `Header is ${header.length} characters; the limit is ${maxHeader}.`,
    });
  } else if (header.length > 72) {
    warnings.push({
      rule: "header-length",
      message: `Header is ${header.length} characters; keep it at 72 or fewer.`,
    });
  }

  if (lines.length > 1 && (lines[1] ?? "").trim() !== "") {
    errors.push({
      rule: "body-leading-blank",
      message: "Leave a blank line between the header and the body.",
    });
  }

  let breakingFooter = false;
  for (const line of lines.slice(1)) {
    if (/^BREAKING[ -]CHANGE: \S/.test(line)) {
      breakingFooter = true;
    } else if (/^breaking[ -]change\s*:/i.test(line)) {
      errors.push({
        rule: "breaking-change-case",
        message:
          "Write the footer token exactly as `BREAKING CHANGE:` or `BREAKING-CHANGE:` (upper case).",
      });
    }
  }
  result.breaking = bang === "!" || breakingFooter;

  if (opts.issue !== undefined && opts.issue !== null) {
    const ref = new RegExp(`#${opts.issue}(?!\\d)`);
    const footerRef = lines
      .slice(1)
      .some((line) => /^(Refs|Closes|Fixes|Resolves|Part-of):?\s/i.test(line) && ref.test(line));
    if (!ref.test(header) && !footerRef) {
      errors.push({
        rule: "issue-reference",
        message: `Reference the issue: add "(#${opts.issue})" to the header or a "Refs: #${opts.issue}" footer.`,
      });
    }
  }

  result.valid = errors.length === 0;
  return result;
}

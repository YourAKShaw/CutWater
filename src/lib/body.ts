// Copyright 2026 Ayush Kumar Shaw
// SPDX-License-Identifier: Apache-2.0

/**
 * Issue and pull request bodies. Issue bodies follow the skeletons in
 * assets/issue-bodies/ (which mirror the issue forms); PR bodies always
 * carry Closes #N (or a logged no-issue reason) and a Not verified section.
 * Every body is secret-scanned before it is returned.
 */
import { CutwaterError } from "./errors.ts";
import { scanSecrets } from "./secrets.ts";
import { readAsset } from "./templates.ts";
import { MAX_TICKET_LENGTH, TICKET_SHAPES } from "./title.ts";

export const ISSUE_KINDS = ["feature", "bug", "chore", "docs"] as const;
export type IssueKind = (typeof ISSUE_KINDS)[number];

/** Commit/branch type to issue skeleton. */
export function issueKindFor(type: string): IssueKind {
  if (type === "feat") return "feature";
  if (type === "fix") return "bug";
  if (type === "docs") return "docs";
  return "chore";
}

export interface SkeletonSection {
  heading: string;
  required: boolean;
}

export function skeletonSections(kind: IssueKind): SkeletonSection[] {
  const text = readAsset(`issue-bodies/${kind}.md`).replace(/\r\n?/g, "\n");
  const sections: SkeletonSection[] = [];
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    const heading = /^## (.+)$/.exec(line)?.[1];
    if (heading) sections.push({ heading, required: /<!-- required/.test(lines[index + 1] ?? "") });
  });
  return sections;
}

type SectionValue = string | string[];

function renderValue(heading: string, value: SectionValue): string {
  if (typeof value === "string") return value.trim();
  const checkbox = /criteria|checklist/i.test(heading);
  return value
    .map((item) => item.trim())
    .filter((item) => item !== "")
    .map((item) => {
      if (/^- \[[ xX]\] /.test(item)) return item;
      return checkbox ? `- [ ] ${item}` : `- ${item}`;
    })
    .join("\n");
}

function isEmpty(value: SectionValue | undefined): boolean {
  if (value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  return value.every((item) => item.trim() === "");
}

function assertNoSecrets(text: string): void {
  const findings = scanSecrets(text);
  if (findings.length > 0) {
    throw new CutwaterError(
      "SECRET",
      `Refusing to produce a body that looks like it contains credentials (${findings.map((f) => `${f.rule} on line ${f.line}`).join(", ")})`,
      { findings },
    );
  }
}

export interface TrackerRef {
  /** The tracker's key, verbatim, e.g. `Req-004`. */
  key: string;
  /** The item's https URL: the durable link. */
  url: string;
}

export interface IssueBodyInput {
  sections: Record<string, SectionValue>;
  /** Emitted as a Tracker refs section only when present; primary key first. */
  trackerRefs?: TrackerRef[];
}

/** Parses as a URL with an https scheme and a host (rejects bad ports). */
function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname !== "";
  } catch {
    return false;
  }
}

function renderTrackerRefs(refs: TrackerRef[]): string {
  const bad = refs.filter(
    (ref) =>
      typeof ref?.key !== "string" ||
      ref.key.length > MAX_TICKET_LENGTH ||
      !TICKET_SHAPES.none.test(ref.key) ||
      typeof ref.url !== "string" ||
      !/^https:\/\/[^\s<>()[\]]+$/.test(ref.url) ||
      !isHttpsUrl(ref.url),
  );
  if (bad.length > 0) {
    throw new CutwaterError(
      "VALIDATION",
      "Each tracker ref needs a verbatim key such as Req-004 and an https URL without spaces",
    );
  }
  return refs.map((ref) => `- ${ref.key}: ${ref.url}`).join("\n");
}

export function renderIssueBody(kind: IssueKind, input: IssueBodyInput): string {
  const sections = skeletonSections(kind);
  const known = new Set(sections.map((section) => section.heading));
  const unknown = Object.keys(input.sections ?? {}).filter((key) => !known.has(key));
  if (unknown.length > 0) {
    throw new CutwaterError(
      "VALIDATION",
      `Unknown sections for a ${kind} issue: ${unknown.join(", ")}. Use: ${[...known].join(", ")}`,
    );
  }
  const missing = sections
    .filter((section) => section.required && isEmpty(input.sections[section.heading]))
    .map((s) => s.heading);
  if (missing.length > 0) {
    throw new CutwaterError("VALIDATION", `Fill the required sections: ${missing.join(", ")}`);
  }
  const out: string[] = [];
  for (const section of sections) {
    const value = input.sections[section.heading];
    out.push(
      `## ${section.heading}`,
      "",
      isEmpty(value) ? "_None._" : renderValue(section.heading, value as SectionValue),
      "",
    );
  }
  if (input.trackerRefs && input.trackerRefs.length > 0) {
    out.push("## Tracker refs", "", renderTrackerRefs(input.trackerRefs), "");
  }
  const body = `${out.join("\n").trimEnd()}\n`;
  assertNoSecrets(body);
  return body;
}

export interface Evidence {
  command: string;
  result: string;
}

export interface PrBodyInput {
  summary: string;
  /** The issue this PR closes; null only for a user-declared trivial edit. */
  issue: number | null;
  noIssueReason?: string;
  changes: string[];
  testing: Evidence[];
  screenshots?: string[];
  notVerified: string[];
  related?: number[];
}

export const PR_CHECKLIST = [
  "Linked to its issue (or the no-issue reason is stated above)",
  "Commits follow Conventional Commits and reference the issue",
  "Checks were run and their results are recorded above",
  "No secrets, tokens or personal data are included",
  "Ready for the maintainer to review and merge; the agent does not merge",
];

export function renderPrBody(input: PrBodyInput): string {
  const problems: string[] = [];
  if (!input.summary || input.summary.trim() === "") problems.push("summary is required");
  if (input.issue === null || input.issue === undefined) {
    if (!input.noIssueReason || input.noIssueReason.trim() === "") {
      problems.push(
        "issue is required; for a user-declared trivial edit set issue to null and give noIssueReason",
      );
    }
  } else if (!Number.isInteger(input.issue) || input.issue <= 0)
    problems.push("issue must be a positive issue number");
  if (!Array.isArray(input.changes) || input.changes.length === 0)
    problems.push("list at least one change");
  if (!Array.isArray(input.testing)) problems.push("testing must be a list of {command, result}");
  if (!Array.isArray(input.notVerified) || input.notVerified.length === 0) {
    problems.push(
      'notVerified must list what was not checked, or say "Nothing left unverified" explicitly',
    );
  }
  if (problems.length > 0)
    throw new CutwaterError("VALIDATION", `PR body input is invalid: ${problems.join("; ")}`);

  const lines: string[] = ["## Summary", "", input.summary.trim(), ""];
  if (input.issue) lines.push(`Closes #${input.issue}`, "");
  else
    lines.push(
      `No issue: trivial edit declared by the user (${(input.noIssueReason ?? "").trim()}).`,
      "",
    );
  if (input.related && input.related.length > 0)
    lines.push(`Related to ${input.related.map((n) => `#${n}`).join(", ")}`, "");
  lines.push("## Changes", "", ...input.changes.map((change) => `- ${change.trim()}`), "");
  lines.push("## Testing evidence", "");
  if (input.testing.length === 0) lines.push("_No commands were run; see Not verified._");
  for (const evidence of input.testing)
    lines.push(`- \`${evidence.command.trim()}\`: ${evidence.result.trim()}`);
  lines.push("");
  if (input.screenshots && input.screenshots.length > 0) {
    lines.push("## Screenshots", "", ...input.screenshots.map((shot) => shot.trim()), "");
  }
  lines.push("## Not verified", "", ...input.notVerified.map((item) => `- ${item.trim()}`), "");
  lines.push("## Checklist", "", ...PR_CHECKLIST.map((item) => `- [x] ${item}`));
  const body = `${lines.join("\n")}\n`;
  assertNoSecrets(body);
  return body;
}

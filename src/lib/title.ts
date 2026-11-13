/**
 * Issue title convention (see .github/CONTRIBUTING.md → Issue titles):
 *
 *   <gitmoji> <type>(<scope>)[!]: <summary>
 *   <gitmoji> [<ticket>] <type>(<scope>)[!]: <summary>
 *
 * Titles come from GitHub and trackers, so they are data: the linter only
 * classifies them and never echoes more than the offending fragment.
 */

import { COMMIT_TYPES } from "./commitlint.ts";

export type CommitType = (typeof COMMIT_TYPES)[number];

/** Default gitmoji first, then the allowed, more specific alternatives. */
export const GITMOJI_BY_TYPE: Record<CommitType, readonly string[]> = {
  feat: ["✨", "🔒️", "🗃️", "🚸"],
  fix: ["🐛", "🔒️", "🚑️", "🩹"],
  docs: ["📝", "🏗️", "🔍️"],
  style: ["🎨"],
  refactor: ["♻️", "🔥", "🚚"],
  perf: ["⚡️"],
  test: ["✅", "🧪", "📊"],
  build: ["📦️", "⬆️", "⬇️"],
  ci: ["👷", "💚"],
  chore: ["🔧", "🔖", "🙈"],
  revert: ["⏪️"],
};

export const TRACKERS = ["none", "entalpa", "jira", "linear"] as const;
export type Tracker = (typeof TRACKERS)[number];

/** Key shape per tracker; `none` still accepts any well-formed key. */
export const TICKET_SHAPES: Record<Tracker, RegExp> = {
  none: /^[A-Za-z][A-Za-z0-9]*-[0-9]+$/,
  entalpa: /^Req-[0-9]{3,}$/,
  jira: /^[A-Z][A-Z0-9]*-[1-9][0-9]*$/,
  linear: /^[A-Z][A-Z0-9]*-[1-9][0-9]*$/,
};

export const MAX_TITLE_LENGTH = 72;
export const MAX_TICKET_LENGTH = 20;

/** Words that may start a summary in upper case. */
const PROPER_NOUNS = new Set([
  "GitHub",
  "GitLab",
  "Git",
  "Jira",
  "Linear",
  "Entalpa",
  "Node",
  "TypeScript",
  "JavaScript",
  "Python",
  "Windows",
  "macOS",
  "Linux",
]);

const strip = (emoji: string) => emoji.replace(/\uFE0F/g, "");
const KNOWN_EMOJI = new Set(Object.values(GITMOJI_BY_TYPE).flat().map(strip));

const EMOJI_CLUSTER =
  /^(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})\ufe0f?(?:\u200d(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})\ufe0f?)*/u;
const SHORTCODE = /^:[a-z0-9_+-]+:/;
const TICKET = /^\[(?<key>[^\]]*)\] /;
const HEADER = /^(?<type>[A-Za-z]+)(?:\((?<scope>[^()]*)\))?(?<bang>!)?: (?<summary>.*)$/;
// C0/C1 controls, zero-width and bidi overrides: never valid in a title.
const HIDDEN =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u001f\u007f-\u009f\u200b\u200c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/u;

export interface TitleIssue {
  rule: string;
  message: string;
}

export interface ParsedTitle {
  emoji: string | null;
  ticket: string | null;
  type: string | null;
  scope: string | null;
  breaking: boolean;
  summary: string | null;
}

export interface TitleLintResult extends ParsedTitle {
  valid: boolean;
  title: string;
  errors: TitleIssue[];
}

export interface TitleLintOptions {
  /** Validate the ticket against this tracker's key shape. Default `none`. */
  tracker?: Tracker;
  /** The issue's `type: <type>` label value, if known. */
  labelType?: string | null;
}

/** Best-effort structural parse; fields the title lacks are null. */
export function parseTitle(title: string): ParsedTitle {
  const parsed: ParsedTitle = {
    emoji: null,
    ticket: null,
    type: null,
    scope: null,
    breaking: false,
    summary: null,
  };
  let rest = title;
  const emoji = EMOJI_CLUSTER.exec(rest);
  if (emoji) {
    parsed.emoji = emoji[0];
    rest = rest.slice(emoji[0].length).replace(/^ /, "");
  }
  const ticket = TICKET.exec(rest);
  if (ticket?.groups) {
    parsed.ticket = ticket.groups.key ?? "";
    rest = rest.slice(ticket[0].length);
  }
  const header = HEADER.exec(rest);
  if (header?.groups) {
    parsed.type = header.groups.type ?? null;
    parsed.scope = header.groups.scope ?? null;
    parsed.breaking = header.groups.bang === "!";
    parsed.summary = header.groups.summary ?? "";
  }
  return parsed;
}

export function lintTitle(title: string, opts: TitleLintOptions = {}): TitleLintResult {
  const tracker = opts.tracker ?? "none";
  const errors: TitleIssue[] = [];
  const add = (rule: string, message: string) => errors.push({ rule, message });
  const parsed = parseTitle(title);
  const result = { ...parsed, valid: false, title, errors };

  if (title.trim() === "") {
    add("title-empty", "The title is empty.");
    return result;
  }
  if (HIDDEN.test(title)) {
    add("title-hidden-chars", "Remove control, zero-width or bidi characters from the title.");
    return result;
  }
  if (title !== title.trim() || / {2}/.test(title)) {
    add("title-whitespace", "Use single spaces and no leading or trailing whitespace.");
  }

  // Gitmoji: exactly one, Unicode, first.
  if (!parsed.emoji) {
    if (SHORTCODE.test(title))
      add("emoji-shortcode", "Use the Unicode emoji, not a :shortcode: (titles render raw).");
    else if (/^\[/.test(title))
      add("ticket-position", "Put the gitmoji first: `✨ [KEY-1] feat(scope): …`.");
    else add("emoji-missing", "Start the title with one gitmoji, e.g. `✨ feat(scope): …`.");
  } else {
    const after = title.slice(parsed.emoji.length);
    if (EMOJI_CLUSTER.test(after.trimStart())) add("emoji-multiple", "Use exactly one gitmoji.");
    else if (!after.startsWith(" ")) add("emoji-space", "Put one space after the gitmoji.");
    if (!KNOWN_EMOJI.has(strip(parsed.emoji)))
      add("emoji-unknown", "Use a gitmoji from the CONTRIBUTING table.");
  }

  // Ticket: at most one, verbatim shape, between the gitmoji and the type.
  if (parsed.ticket !== null) {
    const key = parsed.ticket;
    if (/^\s*(n\/?a|tbd|none|-+)\s*$/i.test(key))
      add("ticket-placeholder", "Drop the placeholder and use the standard form.");
    else if (key.length > MAX_TICKET_LENGTH)
      add("ticket-length", `Ticket keys are at most ${MAX_TICKET_LENGTH} characters.`);
    else if (!TICKET_SHAPES[tracker].test(key))
      add(
        "ticket-format",
        `The ticket does not match the ${tracker === "none" ? "KEY-123" : tracker} key shape; copy it verbatim.`,
      );
  }
  const afterPrefix = title.slice((parsed.emoji ?? "").length).trimStart();
  if (/^\[[^\]]*\]\s*\[/.test(afterPrefix))
    add("ticket-multiple", "Use exactly one ticket; list the rest under Tracker refs.");
  if (parsed.summary !== null && /\[[A-Za-z][A-Za-z0-9]*-[0-9]+\]/.test(parsed.summary))
    add("ticket-position", "Move the ticket between the gitmoji and the type.");

  if (parsed.type === null) {
    if (/^\s*(epic|spike|wip)\b/i.test(afterPrefix.replace(/^\[[^\]]*\]\s*/, "")))
      add("kind-in-title", "Epic, spike and WIP are labels (`kind: …`), not title words.");
    if (!errors.some((e) => e.rule.startsWith("ticket-")))
      add("header-format", "Expected `<gitmoji> <type>(<scope>): <summary>`.");
    result.valid = false;
    return result;
  }

  const type = parsed.type;
  if (/^(epic|spike|wip|adr)$/i.test(type)) {
    add("kind-in-title", "Epic, spike and ADR are labels (`kind: …`), not the type.");
    return result;
  }
  if (type !== type.toLowerCase()) add("type-case", `Type "${type}" must be lower case.`);
  const lower = type.toLowerCase() as CommitType;
  if (!(COMMIT_TYPES as readonly string[]).includes(lower)) {
    add("type-enum", `Type "${type}" must be one of: ${COMMIT_TYPES.join(", ")}.`);
  } else {
    if (parsed.emoji && KNOWN_EMOJI.has(strip(parsed.emoji))) {
      const allowed = GITMOJI_BY_TYPE[lower].map(strip);
      if (!allowed.includes(strip(parsed.emoji)))
        add(
          "emoji-type-mismatch",
          `For ${lower}, use one of: ${GITMOJI_BY_TYPE[lower].join(" ")}.`,
        );
    }
    if (opts.labelType && opts.labelType !== lower)
      add(
        "type-label-mismatch",
        `The title says ${lower} but the label is type: ${opts.labelType}.`,
      );
  }

  if (parsed.scope === null) add("scope-missing", "Add a scope: `type(scope): …`.");
  else if (parsed.scope === "<scope>" || parsed.scope.trim() === "")
    add("scope-placeholder", "Replace `<scope>` with the module or area, e.g. `fix(exec): …`.");
  else if (!/^[a-z0-9][a-z0-9-]*$/.test(parsed.scope))
    add("scope-case", "The scope must be lower-case kebab-case, e.g. `fake-gh`.");

  const summary = parsed.summary ?? "";
  if (summary.trim() === "") add("summary-empty", "The summary is empty.");
  else {
    const first = summary.split(/\s/)[0] ?? "";
    if (/^[A-Z]/.test(first) && !PROPER_NOUNS.has(first) && first !== first.toUpperCase())
      add("summary-case", "Start the summary with a lower-case imperative verb.");
    if (/\.$/.test(summary)) add("summary-full-stop", "Do not end the title with a period.");
    if (/(^|\s)#\d+\b/.test(summary)) add("summary-issue-number", "Drop the issue number.");
    if (/\[(wip|draft)\]|\bepic:/i.test(summary))
      add("kind-in-title", "WIP, draft and epic are labels, not title words.");
  }

  const core = afterPrefix.replace(TICKET, "");
  const length = [...core].length;
  if (length > MAX_TITLE_LENGTH)
    add(
      "title-length",
      `\`type(scope): summary\` is ${length} characters; the limit is ${MAX_TITLE_LENGTH}.`,
    );

  result.valid = errors.length === 0;
  return result;
}

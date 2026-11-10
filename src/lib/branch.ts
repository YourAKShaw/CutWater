import { CutwaterError } from "./errors.ts";

export const BRANCH_TYPES = [
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
] as const;

export type BranchType = (typeof BRANCH_TYPES)[number];

/** Longest allowed branch name. */
export const MAX_BRANCH_LENGTH = 60;
/** Most words kept from the issue title. */
export const MAX_SLUG_WORDS = 5;

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "to",
  "for",
  "of",
  "and",
  "or",
  "in",
  "on",
  "with",
  "when",
]);

export interface BranchInput {
  login: string;
  type: string;
  issue: number;
  title: string;
}

/** ASCII kebab-case words from a free-form title. */
export function slugWords(title: string): string[] {
  const ascii = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e]/g, " ")
    .toLowerCase();
  // Drop a leading conventional prefix such as "✨ feat:" or "fix(api):".
  const withoutPrefix = ascii.replace(/^\s*[a-z]+(\([^)]*\))?!?:\s*/, "");
  const words = withoutPrefix.split(/[^a-z0-9]+/).filter((word) => word !== "");
  const meaningful = words.filter((word) => !STOP_WORDS.has(word));
  return (meaningful.length > 0 ? meaningful : words).slice(0, MAX_SLUG_WORDS);
}

/** `<login>/<type>/<issue>-<kebab>`, ASCII only, at most 60 characters. */
export function branchName(input: BranchInput): string {
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(input.login)) {
    throw new CutwaterError("USAGE", `"${input.login}" is not a valid GitHub login`);
  }
  if (!(BRANCH_TYPES as readonly string[]).includes(input.type)) {
    throw new CutwaterError("USAGE", `Branch type must be one of: ${BRANCH_TYPES.join(", ")}`);
  }
  if (!Number.isInteger(input.issue) || input.issue < 0) {
    throw new CutwaterError(
      "USAGE",
      "The issue number must be a whole number (0 only for repo setup)",
    );
  }
  const prefix = `${input.login}/${input.type}/${input.issue}`;
  const words = slugWords(input.title);
  if (words.length === 0) {
    throw new CutwaterError(
      "USAGE",
      "The title has no ASCII letters or digits to build a branch name from",
    );
  }
  const budget = MAX_BRANCH_LENGTH - prefix.length - 1;
  if (budget < 1)
    throw new CutwaterError("USAGE", "The login and issue number leave no room for a description");
  while (words.length > 1 && words.join("-").length > budget) words.pop();
  let slug = words.join("-");
  if (slug.length > budget) slug = slug.slice(0, budget).replace(/-+$/, "");
  return `${prefix}-${slug}`;
}

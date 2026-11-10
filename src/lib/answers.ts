/**
 * Interview answers: defaults, validation and the template variables
 * derived from them. The interview itself is run by the agent in one
 * grouped round (see references/interview.md); this module only supplies
 * the defaults and checks the result.
 */
import { CutwaterError } from "./errors.ts";
import { STACKS, stackProfile, type Detection, type Stack } from "./detect.ts";
import { labelName } from "./labels.ts";
import type { TemplateVars } from "./templates.ts";

export const LICENSES = ["MIT", "Apache-2.0", "GPL-3.0", "none"] as const;
export type License = (typeof LICENSES)[number];
export const CI_OPTIONS = ["lint", "test", "build", "release"] as const;
export type CiOption = (typeof CI_OPTIONS)[number];
export const VISIBILITIES = ["private", "public", "internal"] as const;
export const DEPENDENCY_BOTS = ["dependabot", "renovate", "none"] as const;

export interface Answers {
  name: string;
  description: string;
  /** owner/name of the GitHub repository (existing or to create). */
  repo: string;
  /** Create the GitHub repository (gated) because none exists yet. */
  createRepo: boolean;
  visibility: (typeof VISIBILITIES)[number];
  stack: Stack;
  license: License;
  copyrightYear: string;
  copyrightHolder: string;
  /** GitHub login used in CODEOWNERS, without "@". */
  maintainer: string;
  /** Optional email for security and conduct reports; "" uses GitHub private reporting only. */
  securityContact: string;
  ci: CiOption[];
  defaultBranch: string;
  dependencyBot: (typeof DEPENDENCY_BOTS)[number];
  wiki: boolean;
  projectsBoard: string | null;
  ruleset: boolean;
  /** "direct" commits setup to the default branch (empty repositories only); "pr" uses a setup branch. */
  commitMode: "direct" | "pr";
  emojiLabels: boolean;
  acceptOrgDefaults: boolean;
}

export interface DefaultsInput {
  detection: Detection;
  login: string;
  repo: string | null;
  remoteExists: boolean;
  isEmpty: boolean;
  defaultBranch: string | null;
  year: string;
}

export interface DefaultsResult {
  answers: Answers;
  /** Fields with no safe default: the interview must ask. */
  mustAsk: string[];
  notes: string[];
}

export function defaultAnswers(input: DefaultsInput): DefaultsResult {
  const { detection } = input;
  const repo = input.repo ?? `${input.login}/${detection.name.replace(/[^A-Za-z0-9._-]/g, "-")}`;
  return {
    answers: {
      name: detection.name,
      description: detection.description,
      repo,
      createRepo: !input.remoteExists,
      visibility: "private",
      stack: detection.stack,
      license: "MIT",
      copyrightYear: input.year,
      copyrightHolder: input.login,
      maintainer: input.login,
      securityContact: "",
      ci: ["lint", "test", "build"],
      defaultBranch: input.defaultBranch ?? "main",
      dependencyBot: "dependabot",
      wiki: false,
      projectsBoard: null,
      ruleset: false,
      commitMode: !input.remoteExists || input.isEmpty ? "direct" : "pr",
      emojiLabels: false,
      acceptOrgDefaults: false,
    },
    mustAsk: ["description", "ruleset"],
    notes: [
      `Detected stack: ${stackProfile(detection.stack, ".").label}${detection.evidence.length > 0 ? ` (${detection.evidence.join(", ")})` : ""}.`,
      "Visibility defaults to private: making a repository public later is easy, exposure is not reversible.",
      "The ruleset default is to ask: it needs Administration write permission and blocks direct pushes.",
    ],
  };
}

const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

/** Validate answers.json; throws VALIDATION listing every problem. */
export function validateAnswers(input: unknown): Answers {
  const problems: string[] = [];
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new CutwaterError("VALIDATION", "answers must be a JSON object");
  }
  const a = input as Record<string, unknown>;
  const str = (key: string, required = true) => {
    if (typeof a[key] !== "string") problems.push(`${key} must be a string`);
    else if (required && (a[key] as string).trim() === "")
      problems.push(`${key} must not be empty`);
  };
  const bool = (key: string) => {
    if (typeof a[key] !== "boolean") problems.push(`${key} must be true or false`);
  };
  str("name");
  str("description", false);
  str("copyrightHolder");
  if (typeof a.repo !== "string" || !REPO.test(a.repo))
    problems.push("repo must look like owner/name");
  if (typeof a.maintainer !== "string" || !LOGIN.test(a.maintainer)) {
    problems.push("maintainer must be a GitHub login without @");
  }
  if (
    typeof a.securityContact !== "string" ||
    (a.securityContact !== "" && !EMAIL.test(a.securityContact))
  ) {
    problems.push('securityContact must be an email address or ""');
  }
  if (typeof a.copyrightYear !== "string" || !/^\d{4}$/.test(a.copyrightYear)) {
    problems.push("copyrightYear must be a four-digit year");
  }
  if (typeof a.defaultBranch !== "string" || !/^[A-Za-z0-9._/-]+$/.test(a.defaultBranch)) {
    problems.push("defaultBranch must be a valid branch name");
  }
  if (!oneOf(a.visibility, VISIBILITIES))
    problems.push(`visibility must be one of ${VISIBILITIES.join(", ")}`);
  if (!oneOf(a.stack, STACKS)) problems.push(`stack must be one of ${STACKS.join(", ")}`);
  if (!oneOf(a.license, LICENSES)) problems.push(`license must be one of ${LICENSES.join(", ")}`);
  if (!oneOf(a.dependencyBot, DEPENDENCY_BOTS)) {
    problems.push(`dependencyBot must be one of ${DEPENDENCY_BOTS.join(", ")}`);
  }
  if (!oneOf(a.commitMode, ["direct", "pr"] as const))
    problems.push('commitMode must be "direct" or "pr"');
  if (
    !Array.isArray(a.ci) ||
    !a.ci.every((item) => oneOf(item, CI_OPTIONS)) ||
    new Set(a.ci).size !== a.ci.length
  ) {
    problems.push(`ci must be a list of distinct values from ${CI_OPTIONS.join(", ")}`);
  }
  for (const key of ["createRepo", "wiki", "ruleset", "emojiLabels", "acceptOrgDefaults"])
    bool(key);
  if (a.projectsBoard !== null && typeof a.projectsBoard !== "string") {
    problems.push("projectsBoard must be a string or null");
  }
  if (problems.length > 0) {
    throw new CutwaterError("VALIDATION", `answers.json is invalid: ${problems.join("; ")}`, {
      problems,
    });
  }
  return a as unknown as Answers;
}

/** Variables available to every template. */
export function templateVars(answers: Answers, root: string): TemplateVars {
  const profile = stackProfile(answers.stack, root);
  const [owner = "", repoName = ""] = answers.repo.split("/");
  const contact = answers.securityContact;
  return {
    projectName: answers.name,
    description: answers.description || `${answers.name}.`,
    repo: answers.repo,
    owner,
    repoName,
    maintainer: answers.maintainer,
    defaultBranch: answers.defaultBranch,
    hasLicense: answers.license !== "none",
    licenseName: answers.license === "none" ? "" : answers.license,
    installCommand: profile.installCommand,
    testCommand: profile.testCommand,
    packageEcosystem: profile.packageEcosystem,
    nodeInstall: profile.installCommand,
    securityEmail: contact,
    reportingMethod:
      contact !== ""
        ? `email ${contact}.`
        : `contact the maintainer, @${answers.maintainer}, privately through the contact options on their GitHub profile (https://github.com/${answers.maintainer}).`,
    ciLint: answers.ci.includes("lint"),
    ciTest: answers.ci.includes("test"),
    ciBuild: answers.ci.includes("build"),
    labelFeat: labelName("type: feat", answers.emojiLabels),
    labelFix: labelName("type: fix", answers.emojiLabels),
    labelChore: labelName("type: chore", answers.emojiLabels),
    labelDocs: labelName("type: docs", answers.emojiLabels),
  };
}

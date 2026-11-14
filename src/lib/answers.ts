// Copyright 2026 Ayush Kumar Shaw
// SPDX-License-Identifier: Apache-2.0

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
/** CodeRabbit review profile for .coderabbit.yaml; "off" writes no file. */
export const CODERABBIT_PROFILES = ["off", "quiet", "chill", "assertive"] as const;
export type CoderabbitProfile = (typeof CODERABBIT_PROFILES)[number];

/** Project fields cutwater can create (supported gh field types, #6 spike). */
export const PROJECT_FIELDS = ["status", "priority", "size", "target-date"] as const;
export type ProjectField = (typeof PROJECT_FIELDS)[number];
/** cutwater's own cap, to keep titles readable in gh output and the manifest. */
export const PROJECT_TITLE_MAX = 100;

export interface ProjectAnswers {
  enabled: boolean;
  mode: "create" | "adopt";
  /** Project number; required when adopting. */
  number?: number;
  title: string;
  /** Must be the repository owner (ADR 0010, decision 4). */
  owner: string;
  fields: ProjectField[];
  seed: boolean;
}

/** An existing Project linked to the repository, found by `cw defaults`. */
export interface LinkedProject {
  number: number;
  title: string;
}

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
  /** Deprecated: v0.1 answers files. Read into `project`; kept for v1 manifests. */
  projectsBoard: string | null;
  /** Projects choices; optional for answers files written before v0.2.0. */
  project?: ProjectAnswers;
  ruleset: boolean;
  /**
   * Write .coderabbit.yaml with this review profile. Optional for answers files
   * written before it existed; missing means "off".
   */
  coderabbit?: CoderabbitProfile;
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
  /** Open Projects already linked to the repository; null when not checked. */
  linkedProjects?: LinkedProject[] | null;
  /** The token cannot read Projects; the interview shows 🔒 on the Projects line. */
  projectScopeMissing?: boolean;
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
  const linked = input.linkedProjects?.[0];
  const notes: string[] = [];
  if (linked)
    notes.push(
      `Project #${linked.number} "${linked.title}" is already linked to the repository: if Projects are turned on, the default is to adopt it rather than create a new one.`,
    );
  if (input.projectScopeMissing)
    notes.push("Projects: 🔒 needs `gh auth refresh -s project` before a board can be set up.");
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
      project: {
        enabled: false,
        mode: linked ? "adopt" : "create",
        ...(linked ? { number: linked.number } : {}),
        title: linked?.title ?? `${detection.name} Development`,
        owner: repo.split("/")[0] ?? input.login,
        fields: ["status", "priority"],
        seed: false,
      },
      ruleset: false,
      coderabbit: "off",
      commitMode: !input.remoteExists || input.isEmpty ? "direct" : "pr",
      emojiLabels: false,
      acceptOrgDefaults: false,
    },
    mustAsk: ["description", "ruleset"],
    notes: [
      `Detected stack: ${stackProfile(detection.stack, ".").label}${detection.evidence.length > 0 ? ` (${detection.evidence.join(", ")})` : ""}.`,
      "Visibility defaults to private: making a repository public later is easy, exposure is not reversible.",
      "The ruleset default is to ask: it needs Administration write permission and blocks direct pushes.",
      ...notes,
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
  if (a.coderabbit !== undefined && !oneOf(a.coderabbit, CODERABBIT_PROFILES)) {
    problems.push(`coderabbit must be one of ${CODERABBIT_PROFILES.join(", ")}`);
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
  if (a.projectsBoard === undefined) a.projectsBoard = null;
  if (a.projectsBoard !== null && typeof a.projectsBoard !== "string") {
    problems.push("projectsBoard must be a string or null");
  }
  if (a.project === undefined && typeof a.projectsBoard === "string" && a.projectsBoard !== "") {
    // v0.1 answers: a board title meant "create a board with this title".
    a.project = {
      enabled: true,
      mode: "create",
      title: a.projectsBoard,
      owner: typeof a.repo === "string" ? (a.repo.split("/")[0] ?? "") : "",
      fields: ["status", "priority"],
      seed: false,
    };
  }
  if (a.project !== undefined) problems.push(...projectProblems(a.project, a.repo));
  if (problems.length > 0) {
    throw new CutwaterError("VALIDATION", `answers.json is invalid: ${problems.join("; ")}`, {
      problems,
    });
  }
  return a as unknown as Answers;
}

function projectProblems(value: unknown, repo: unknown): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return ["project must be an object"];
  const p = value as Record<string, unknown>;
  const problems: string[] = [];
  const known = ["enabled", "mode", "number", "title", "owner", "fields", "seed"];
  for (const key of Object.keys(p))
    if (!known.includes(key)) problems.push(`project.${key} is not a known field`);
  for (const key of ["enabled", "seed"])
    if (typeof p[key] !== "boolean") problems.push(`project.${key} must be true or false`);
  if (!oneOf(p.mode, ["create", "adopt"] as const))
    problems.push('project.mode must be "create" or "adopt"');
  if (p.number !== undefined && (!Number.isInteger(p.number) || (p.number as number) < 1))
    problems.push("project.number must be a positive integer");
  if (p.mode === "adopt" && p.number === undefined)
    problems.push("project.number is required when project.mode is adopt");
  if (typeof p.title !== "string" || p.title.trim() === "")
    problems.push("project.title must not be empty");
  else if (p.title.length > PROJECT_TITLE_MAX)
    problems.push(`project.title must be at most ${PROJECT_TITLE_MAX} characters`);
  if (!Array.isArray(p.fields) || new Set(p.fields).size !== p.fields.length)
    problems.push("project.fields must be a list of distinct field keys");
  else
    for (const field of p.fields)
      if (!oneOf(field, PROJECT_FIELDS))
        problems.push(
          `project.fields: unknown field "${String(field)}" (use ${PROJECT_FIELDS.join(", ")})`,
        );
  const repoOwner = typeof repo === "string" ? repo.split("/")[0] : undefined;
  if (typeof p.owner !== "string" || !LOGIN.test(p.owner))
    problems.push("project.owner must be a GitHub login without @");
  else if (
    p.enabled === true &&
    repoOwner !== undefined &&
    p.owner.toLowerCase() !== repoOwner.toLowerCase()
  )
    problems.push(
      `project.owner ${p.owner} differs from the repository owner ${repoOwner}; boards of another owner are out of scope (ADR 0010)`,
    );
  return problems;
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
    stackNode: answers.stack === "node" || answers.stack === "node-ts",
    stackPython: answers.stack === "python",
    stackGo: answers.stack === "go",
    coderabbitProfile:
      answers.coderabbit === undefined || answers.coderabbit === "off"
        ? "chill"
        : answers.coderabbit,
    labelFeat: labelName("type: feat", answers.emojiLabels),
    labelFix: labelName("type: fix", answers.emojiLabels),
    labelChore: labelName("type: chore", answers.emojiLabels),
    labelDocs: labelName("type: docs", answers.emojiLabels),
  };
}

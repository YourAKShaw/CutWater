// Copyright 2026 Ayush Kumar Shaw
// SPDX-License-Identifier: Apache-2.0

/**
 * The setup manifest at .github/cutwater.json. It records only what was
 * applied and verified (invariant I8), and per-file hashes let upgrades tell
 * untouched templates from user edits. Validation mirrors
 * assets/manifest.schema.json without a JSON Schema dependency.
 */
import { join } from "node:path";
import type { Answers } from "./answers.ts";
import { readText } from "./fsutil.ts";
import { MANIFEST_PATH, MANIFEST_SCHEMA_URL, SCHEMA_VERSION } from "../version.ts";

export interface ManifestFile {
  template: string;
  sha256: string;
}

export interface Manifest {
  $schema?: string;
  schemaVersion: number;
  skillVersion: string;
  createdAt: string;
  updatedAt: string;
  repo: string;
  defaultBranch: string;
  choices: {
    visibility: string;
    stack: string;
    license: string;
    ci: string[];
    dependencyBot: string;
    wiki: boolean;
    projectsBoard: string | null;
    ruleset: boolean;
    emojiLabels?: boolean;
    acceptOrgDefaults?: boolean;
    copyrightYear?: string;
    copyrightHolder?: string;
    maintainer?: string;
    securityContact?: string;
  };
  applied: {
    files: Record<string, ManifestFile>;
    labels: string[];
    rulesetId?: number | null;
  };
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const CHOICE_KEYS = new Set([
  "visibility",
  "stack",
  "license",
  "ci",
  "dependencyBot",
  "wiki",
  "projectsBoard",
  "ruleset",
  "emojiLabels",
  "acceptOrgDefaults",
  "copyrightYear",
  "copyrightHolder",
  "maintainer",
  "securityContact",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Returns a list of problems; empty means valid. */
export function validateManifest(value: unknown): string[] {
  const errors: string[] = [];
  if (!isObject(value)) return ["manifest must be a JSON object"];
  const allowed = new Set([
    "$schema",
    "schemaVersion",
    "skillVersion",
    "createdAt",
    "updatedAt",
    "repo",
    "defaultBranch",
    "choices",
    "applied",
  ]);
  for (const key of Object.keys(value))
    if (!allowed.has(key)) errors.push(`unknown property "${key}"`);
  if (value.schemaVersion !== SCHEMA_VERSION)
    errors.push(`schemaVersion must be ${SCHEMA_VERSION}`);
  if (
    typeof value.skillVersion !== "string" ||
    !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(value.skillVersion)
  ) {
    errors.push("skillVersion must be a semantic version");
  }
  for (const key of ["createdAt", "updatedAt"]) {
    if (typeof value[key] !== "string" || !ISO.test(value[key] as string))
      errors.push(`${key} must be an ISO 8601 date-time`);
  }
  if (typeof value.repo !== "string" || !/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(value.repo)) {
    errors.push("repo must look like owner/name");
  }
  if (typeof value.defaultBranch !== "string" || value.defaultBranch === "")
    errors.push("defaultBranch must be a non-empty string");

  const choices = value.choices;
  if (!isObject(choices)) errors.push("choices must be an object");
  else {
    for (const key of Object.keys(choices))
      if (!CHOICE_KEYS.has(key)) errors.push(`unknown choice "${key}"`);
    const inSet = (key: string, values: string[]) => {
      if (!values.includes(choices[key] as string))
        errors.push(`choices.${key} must be one of ${values.join(", ")}`);
    };
    inSet("visibility", ["private", "public", "internal"]);
    inSet("stack", ["node-ts", "node", "python", "go", "generic"]);
    inSet("license", ["MIT", "Apache-2.0", "GPL-3.0", "none"]);
    inSet("dependencyBot", ["dependabot", "renovate", "none"]);
    if (
      !Array.isArray(choices.ci) ||
      !choices.ci.every((item) => ["lint", "test", "build", "release"].includes(item as string)) ||
      new Set(choices.ci).size !== choices.ci.length
    ) {
      errors.push("choices.ci must be a list of distinct lint, test, build, release");
    }
    for (const key of ["wiki", "ruleset"])
      if (typeof choices[key] !== "boolean") errors.push(`choices.${key} must be boolean`);
    for (const key of ["emojiLabels", "acceptOrgDefaults"]) {
      if (key in choices && typeof choices[key] !== "boolean")
        errors.push(`choices.${key} must be boolean`);
    }
    if (
      !("projectsBoard" in choices) ||
      (choices.projectsBoard !== null && typeof choices.projectsBoard !== "string")
    ) {
      errors.push("choices.projectsBoard must be a string or null");
    }
  }

  const applied = value.applied;
  if (!isObject(applied)) errors.push("applied must be an object");
  else {
    for (const key of Object.keys(applied)) {
      if (!["files", "labels", "rulesetId"].includes(key))
        errors.push(`unknown applied property "${key}"`);
    }
    if (!isObject(applied.files)) errors.push("applied.files must be an object");
    else {
      for (const [path, entry] of Object.entries(applied.files)) {
        if (
          !isObject(entry) ||
          typeof entry.template !== "string" ||
          typeof entry.sha256 !== "string" ||
          !/^[0-9a-f]{64}$/.test(entry.sha256)
        ) {
          errors.push(`applied.files["${path}"] needs a template and a sha256`);
        }
      }
    }
    if (
      !Array.isArray(applied.labels) ||
      !applied.labels.every((label) => typeof label === "string")
    ) {
      errors.push("applied.labels must be a list of names");
    }
    if (
      "rulesetId" in applied &&
      applied.rulesetId !== null &&
      !Number.isInteger(applied.rulesetId)
    ) {
      errors.push("applied.rulesetId must be an integer or null");
    }
  }
  return errors;
}

export interface ManifestRead {
  exists: boolean;
  manifest: Manifest | null;
  errors: string[];
}

export function readManifest(root: string): ManifestRead {
  const text = readText(join(root, MANIFEST_PATH));
  if (text === null) return { exists: false, manifest: null, errors: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return {
      exists: true,
      manifest: null,
      errors: [`not valid JSON: ${(error as Error).message}`],
    };
  }
  const errors = validateManifest(parsed);
  return { exists: true, manifest: errors.length === 0 ? (parsed as Manifest) : null, errors };
}

export function choicesFrom(answers: Answers): Manifest["choices"] {
  return {
    visibility: answers.visibility,
    stack: answers.stack,
    license: answers.license,
    ci: [...answers.ci],
    dependencyBot: answers.dependencyBot,
    wiki: answers.wiki,
    projectsBoard: answers.projectsBoard,
    ruleset: answers.ruleset,
    emojiLabels: answers.emojiLabels,
    acceptOrgDefaults: answers.acceptOrgDefaults,
    copyrightYear: answers.copyrightYear,
    copyrightHolder: answers.copyrightHolder,
    maintainer: answers.maintainer,
    securityContact: answers.securityContact,
  };
}

export interface BuildManifestInput {
  previous: Manifest | null;
  answers: Answers;
  skillVersion: string;
  files: Record<string, ManifestFile>;
  labels: string[];
  now: string;
}

/** Build the next manifest; timestamps change only when content changes. */
export function buildManifest(input: BuildManifestInput): { manifest: Manifest; changed: boolean } {
  const sortedFiles = Object.fromEntries(
    Object.entries(input.files).sort(([a], [b]) => a.localeCompare(b)),
  );
  const next: Manifest = {
    $schema: MANIFEST_SCHEMA_URL,
    schemaVersion: SCHEMA_VERSION,
    skillVersion: input.skillVersion,
    createdAt: input.previous?.createdAt ?? input.now,
    updatedAt: input.previous?.updatedAt ?? input.now,
    repo: input.answers.repo,
    defaultBranch: input.answers.defaultBranch,
    choices: choicesFrom(input.answers),
    applied: {
      files: sortedFiles,
      labels: [...input.labels].sort((a, b) => a.localeCompare(b)),
      rulesetId: input.previous?.applied.rulesetId ?? null,
    },
  };
  const changed =
    input.previous === null ||
    serializeManifest({ ...next, updatedAt: "" }) !==
      serializeManifest({ ...input.previous, updatedAt: "" });
  if (changed) next.updatedAt = input.now;
  return { manifest: next, changed };
}

export function serializeManifest(manifest: Manifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

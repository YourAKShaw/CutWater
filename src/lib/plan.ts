// Copyright 2026 Ayush Kumar Shaw
// SPDX-License-Identifier: Apache-2.0

/**
 * Scaffold planning: render every file the answers call for and compare it
 * with what is on disk. Read-only. Each entry is one of:
 *   create    the file does not exist                     (not gated)
 *   skip      identical, or the requirement is already met by another file
 *   update    differs, but the manifest hash shows cutwater wrote it and the
 *             user never edited it                         (gated: diff + yes)
 *   conflict  differs from a file cutwater did not write   (gated: diff + yes)
 */
import { join } from "node:path";
import type { Answers } from "./answers.ts";
import { templateVars } from "./answers.ts";
import {
  coderabbitConfig,
  dependencyConfig,
  issueTemplateState,
  locate,
  workflowFiles,
  type LocationKey,
} from "./audit.ts";
import { stackProfile } from "./detect.ts";
import { unifiedDiff } from "./diff.ts";
import { eolFor, normalizeEol, readText, sha256, withEol } from "./fsutil.ts";
import { desiredLabels, diffLabels, type Label } from "./labels.ts";
import { buildManifest, type Manifest, type ManifestFile } from "./manifest.ts";
import { readAsset, renderAsset, type TemplateVars } from "./templates.ts";
import { VERSION } from "../version.ts";

export type PlanAction = "create" | "skip" | "update" | "conflict";

export interface FilePlanEntry {
  id: string;
  kind: "file";
  path: string;
  template: string;
  action: PlanAction;
  gated: boolean;
  reason: string;
  /** Hash of the file on disk when the plan was made; null if absent. */
  expectedSha256: string | null;
  newSha256: string;
  content: string;
  diff: string;
}

export interface RepoCreateEntry {
  id: "repo-create";
  kind: "repo-create";
  action: "create";
  gated: true;
  reason: string;
  command: string[];
}

export interface LabelsEntry {
  id: "labels";
  kind: "labels";
  action: "create" | "update" | "skip";
  gated: false;
  reason: string;
  labels: Label[];
}

export type PlanEntry = FilePlanEntry | RepoCreateEntry | LabelsEntry;

export interface Plan {
  planVersion: 1;
  skillVersion: string;
  repo: string;
  answers: Answers;
  entries: PlanEntry[];
  summary: {
    create: number;
    update: number;
    conflict: number;
    skip: number;
    gated: string[];
    /** Whether the manifest would be written if every gated entry were approved. */
    manifest: "create" | "update" | "skip";
    noChanges: boolean;
  };
  notes: string[];
}

interface FileSpec {
  path: string;
  template: string;
  render: (vars: TemplateVars) => string;
  /** Requirement check: a file that already satisfies it elsewhere. */
  satisfiedBy?: () => string | null;
}

function licenseText(answers: Answers): string {
  const text = readAsset(`licenses/${answers.license}.txt`);
  if (answers.license !== "MIT") return text;
  return text
    .replace("[year]", answers.copyrightYear)
    .replace("[fullname]", answers.copyrightHolder);
}

function elsewhere(root: string, key: LocationKey, path: string): () => string | null {
  return () => {
    const found = locate(root, key);
    return found !== null && found.toLowerCase() !== path.toLowerCase() ? found : null;
  };
}

export function fileSpecs(answers: Answers, root: string): FileSpec[] {
  const profile = stackProfile(answers.stack, root);
  const asset = (template: string) => (vars: TemplateVars) => renderAsset(template, vars);
  const specs: FileSpec[] = [
    {
      path: "README.md",
      template: "community/README.md",
      render: asset("community/README.md"),
      satisfiedBy: elsewhere(root, "readme", "README.md"),
    },
  ];
  if (answers.license !== "none") {
    specs.push({
      path: "LICENSE",
      template: `licenses/${answers.license}.txt`,
      render: () => licenseText(answers),
      satisfiedBy: elsewhere(root, "license", "LICENSE"),
    });
  }
  specs.push(
    {
      path: "CONTRIBUTING.md",
      template: "community/CONTRIBUTING.md",
      render: asset("community/CONTRIBUTING.md"),
      satisfiedBy: elsewhere(root, "contributing", "CONTRIBUTING.md"),
    },
    {
      path: "CODE_OF_CONDUCT.md",
      template: "community/CODE_OF_CONDUCT.md",
      render: asset("community/CODE_OF_CONDUCT.md"),
      satisfiedBy: elsewhere(root, "conduct", "CODE_OF_CONDUCT.md"),
    },
    {
      path: "SECURITY.md",
      template: "community/SECURITY.md",
      render: asset("community/SECURITY.md"),
      satisfiedBy: elsewhere(root, "security", "SECURITY.md"),
    },
  );
  const issueState = issueTemplateState(root);
  const formsMet = () =>
    issueState.forms.length > 0 && issueState.config ? ".github/ISSUE_TEMPLATE/" : null;
  for (const form of ["bug", "feature", "chore", "docs", "config"]) {
    specs.push({
      path: `.github/ISSUE_TEMPLATE/${form}.yml`,
      template: `issue-forms/${form}.yml`,
      render: asset(`issue-forms/${form}.yml`),
      satisfiedBy: formsMet,
    });
  }
  specs.push(
    {
      path: ".github/PULL_REQUEST_TEMPLATE.md",
      template: "pr/PULL_REQUEST_TEMPLATE.md",
      render: asset("pr/PULL_REQUEST_TEMPLATE.md"),
      satisfiedBy: elsewhere(root, "prTemplate", ".github/PULL_REQUEST_TEMPLATE.md"),
    },
    {
      path: ".github/CODEOWNERS",
      template: "repo/CODEOWNERS",
      render: asset("repo/CODEOWNERS"),
      satisfiedBy: elsewhere(root, "codeowners", ".github/CODEOWNERS"),
    },
  );
  if (answers.ci.some((item) => item !== "release")) {
    specs.push({
      path: ".github/workflows/ci.yml",
      template: profile.ciTemplate,
      render: asset(profile.ciTemplate),
      satisfiedBy: () =>
        workflowFiles(root).find((file) => !/\/(ci|release)\.ya?ml$/i.test(file)) ?? null,
    });
  }
  if (answers.ci.includes("release")) {
    specs.push({
      path: ".github/workflows/release.yml",
      template: "workflows/release.yml",
      render: asset("workflows/release.yml"),
    });
  }
  if (answers.dependencyBot === "dependabot") {
    specs.push({
      path: ".github/dependabot.yml",
      template: "dependabot.yml",
      render: asset("dependabot.yml"),
      satisfiedBy: () => {
        const found = dependencyConfig(root);
        return found !== null && found !== ".github/dependabot.yml" ? found : null;
      },
    });
  } else if (answers.dependencyBot === "renovate") {
    specs.push({
      path: "renovate.json",
      template: "repo/renovate.json",
      render: asset("repo/renovate.json"),
      satisfiedBy: () => {
        const found = dependencyConfig(root);
        return found !== null && found !== "renovate.json" ? found : null;
      },
    });
  }
  if (answers.coderabbit !== undefined && answers.coderabbit !== "off") {
    specs.push({
      path: ".coderabbit.yaml",
      template: "repo/coderabbit.yaml",
      render: asset("repo/coderabbit.yaml"),
      satisfiedBy: () => {
        const found = coderabbitConfig(root);
        if (found !== null && found !== ".coderabbit.yaml") return found;
        return readText(join(root, ".coderabbit.config.ts")) === null ? null : ".coderabbit.config.ts";
      },
    });
  }
  specs.push(
    {
      path: ".gitignore",
      template: profile.gitignoreTemplate,
      render: asset(profile.gitignoreTemplate),
    },
    { path: ".editorconfig", template: "repo/editorconfig", render: asset("repo/editorconfig") },
  );
  return specs;
}

function ensureTrailingNewline(text: string): string {
  return text.endsWith("\n") ? text : `${text}\n`;
}

export interface PlanInput {
  root: string;
  answers: Answers;
  manifest: Manifest | null;
  /** Live labels, or null when the repository does not exist yet. */
  currentLabels: Label[] | null;
  remoteExists: boolean;
}

export function computePlan(input: PlanInput): Plan {
  const { root, answers, manifest } = input;
  const vars = templateVars(answers, root);
  const entries: PlanEntry[] = [];
  const notes: string[] = [];

  if (!input.remoteExists && answers.createRepo) {
    const command = [
      "gh",
      "repo",
      "create",
      answers.repo,
      `--${answers.visibility}`,
      "--source=.",
      "--remote=origin",
    ];
    if (answers.description) command.push("--description", answers.description);
    entries.push({
      id: "repo-create",
      kind: "repo-create",
      action: "create",
      gated: true,
      reason: `create ${answers.visibility} repository ${answers.repo}`,
      command,
    });
  } else if (!input.remoteExists) {
    notes.push("No GitHub repository exists and createRepo is false: labels cannot be synced.");
  }

  for (const spec of fileSpecs(answers, root)) {
    const id = `file:${spec.path}`;
    const eol = eolFor(root, spec.path);
    const content = withEol(ensureTrailingNewline(spec.render(vars)), eol);
    const newSha256 = sha256(content);
    const current = readText(join(root, spec.path));
    const currentSha = current === null ? null : sha256(current);
    const base = {
      id,
      kind: "file" as const,
      path: spec.path,
      template: spec.template,
      expectedSha256: currentSha,
      newSha256,
      content,
    };

    if (current === null) {
      const other = spec.satisfiedBy?.() ?? null;
      if (other !== null) {
        entries.push({
          ...base,
          action: "skip",
          gated: false,
          reason: `requirement already met by ${other}`,
          content: "",
          diff: "",
        });
      } else {
        entries.push({
          ...base,
          action: "create",
          gated: false,
          reason: "missing",
          diff: unifiedDiff("", content, spec.path),
        });
      }
      continue;
    }
    if (currentSha === newSha256) {
      entries.push({
        ...base,
        action: "skip",
        gated: false,
        reason: "identical",
        content: "",
        diff: "",
      });
      continue;
    }
    const recorded = manifest?.applied.files[spec.path];
    const untouched = recorded !== undefined && recorded.sha256 === currentSha;
    entries.push({
      ...base,
      action: untouched ? "update" : "conflict",
      gated: true,
      reason: untouched
        ? "template changed; your copy is the untouched previous template"
        : "differs from the template; never overwritten without your yes",
      diff: unifiedDiff(normalizeEol(current), normalizeEol(content), spec.path),
    });
  }

  if (input.remoteExists || answers.createRepo) {
    const desired = desiredLabels(answers.emojiLabels);
    const diff = diffLabels(desired, input.currentLabels ?? []);
    const pending = [...diff.create, ...diff.update];
    entries.push({
      id: "labels",
      kind: "labels",
      action: pending.length === 0 ? "skip" : diff.create.length > 0 ? "create" : "update",
      gated: false,
      reason:
        pending.length === 0
          ? "all standard labels present"
          : `${diff.create.length} to create, ${diff.update.length} to update`,
      labels: pending,
    });
  }

  if (answers.ruleset)
    notes.push(
      "Ruleset chosen: run `ruleset ensure` after the setup commit reaches the default branch (it blocks direct pushes).",
    );
  if (answers.wiki)
    notes.push(
      "Wiki chosen: run `wiki-check`; GitHub requires the first wiki page to be created in the web UI.",
    );
  if (answers.projectsBoard)
    notes.push(
      "Projects board chosen: needs the `project` scope (`gh auth refresh -s project`); set it up by hand for v1.",
    );

  const fileEntries = entries.filter((entry): entry is FilePlanEntry => entry.kind === "file");
  const count = (action: PlanAction) =>
    fileEntries.filter((entry) => entry.action === action).length;
  const gated = entries.filter((entry) => entry.gated).map((entry) => entry.id);
  const labelsPending = entries.some((entry) => entry.kind === "labels" && entry.action !== "skip");
  const recorded: Record<string, ManifestFile> = {};
  for (const entry of fileEntries) {
    if (entry.action === "skip" && entry.reason !== "identical") continue;
    recorded[entry.path] = { template: entry.template, sha256: entry.newSha256 };
  }
  const predicted = buildManifest({
    previous: manifest,
    answers,
    skillVersion: VERSION,
    files: recorded,
    labels: desiredLabels(answers.emojiLabels).map((label) => label.name),
    now: manifest?.updatedAt ?? new Date(0).toISOString(),
  });
  const manifestAction = manifest === null ? "create" : predicted.changed ? "update" : "skip";
  const summary = {
    create: count("create"),
    update: count("update"),
    conflict: count("conflict"),
    skip: count("skip"),
    gated,
    manifest: manifestAction as "create" | "update" | "skip",
    noChanges:
      gated.length === 0 && count("create") === 0 && !labelsPending && manifestAction === "skip",
  };
  return {
    planVersion: 1,
    skillVersion: VERSION,
    repo: answers.repo,
    answers,
    entries,
    summary,
    notes,
  };
}

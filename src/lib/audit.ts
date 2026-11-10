/**
 * Phase 0 audit: checks a repository against the A1–A16 checklist in
 * references/init-checklist.md and classifies it. Read-only.
 */
import { join } from "node:path";
import { gh, type ExecContext } from "./exec.ts";
import { findFile, listDir } from "./fsutil.ts";
import { desiredLabels, diffLabels, listLabels } from "./labels.ts";
import { readManifest, type Manifest } from "./manifest.ts";
import { findRuleset } from "./ruleset.ts";
import type { RepoInfo } from "./preflight.ts";

export type ItemStatus = "pass" | "fail" | "org-default" | "unknown" | "n/a";
export type Classification = "not-set-up" | "partially-set-up" | "fully-set-up";

export interface AuditItem {
  id: string;
  title: string;
  status: ItemStatus;
  required: boolean;
  found: string | null;
  detail: string;
  fix: string;
}

export interface AuditResult {
  classification: Classification;
  repo: string | null;
  remote: boolean;
  passed: number;
  required: number;
  items: AuditItem[];
  manifest: { exists: boolean; valid: boolean; errors: string[] };
  /** Items satisfied only by org-level defaults, awaiting the user's confirmation. */
  orgDefaultsPending: string[];
  notes: string[];
}

const COMMUNITY_DIRS = ["", ".github", "docs"];

/** Where each scaffolded file may already live. Shared with the planner. */
export const LOCATIONS = {
  readme: { dirs: COMMUNITY_DIRS, name: /^readme(\.(md|markdown|rst|txt|adoc|org))?$/i },
  license: { dirs: [""], name: /^(licen[cs]e|copying)(\.(md|txt|rst))?$/i },
  contributing: { dirs: COMMUNITY_DIRS, name: /^contributing(\.(md|rst|txt))?$/i },
  conduct: { dirs: COMMUNITY_DIRS, name: /^code_of_conduct(\.(md|rst|txt))?$/i },
  security: { dirs: COMMUNITY_DIRS, name: /^security(\.(md|rst|txt))?$/i },
  prTemplate: { dirs: [".github", "", "docs"], name: /^pull_request_template(\.md)?$/i },
  codeowners: { dirs: [".github", "", "docs"], name: /^CODEOWNERS$/ },
  gitignore: { dirs: [""], name: /^\.gitignore$/ },
  editorconfig: { dirs: [""], name: /^\.editorconfig$/ },
} as const;

export type LocationKey = keyof typeof LOCATIONS;

export function locate(root: string, key: LocationKey): string | null {
  const { dirs, name } = LOCATIONS[key];
  const found = findFile(root, [...dirs], name);
  if (found !== null || key !== "prTemplate") return found;
  const dir = ".github/PULL_REQUEST_TEMPLATE";
  return listDir(join(root, dir)).some((file) => /\.md$/i.test(file)) ? `${dir}/` : null;
}

export function issueTemplateState(root: string): { forms: string[]; config: string | null } {
  const dir = ".github/ISSUE_TEMPLATE";
  const files = listDir(join(root, dir)).sort();
  const config = files.find((file) => /^config\.ya?ml$/i.test(file));
  return {
    forms: files
      .filter((file) => /\.ya?ml$/i.test(file) && !/^config\.ya?ml$/i.test(file))
      .map((file) => `${dir}/${file}`),
    config: config ? `${dir}/${config}` : null,
  };
}

export function workflowFiles(root: string): string[] {
  return listDir(join(root, ".github/workflows"))
    .filter((file) => /\.ya?ml$/i.test(file))
    .sort()
    .map((file) => `.github/workflows/${file}`);
}

export function dependencyConfig(root: string): string | null {
  return (
    findFile(root, [".github"], /^dependabot\.ya?ml$/) ??
    findFile(root, ["", ".github"], /^renovate\.json5?$/) ??
    findFile(root, [""], /^\.renovaterc(\.json5?)?$/)
  );
}

interface FileItemSpec {
  id: string;
  title: string;
  check: (root: string) => { found: string | null; detail?: string };
  required: (choices: Manifest["choices"] | null) => boolean;
  orgPaths?: string[];
}

const FILE_ITEMS: FileItemSpec[] = [
  {
    id: "A3",
    title: "README",
    check: (root) => ({ found: locate(root, "readme") }),
    required: () => true,
  },
  {
    id: "A4",
    title: "LICENSE",
    check: (root) => ({ found: locate(root, "license") }),
    required: (choices) => choices?.license !== "none",
  },
  {
    id: "A5",
    title: "CONTRIBUTING",
    check: (root) => ({ found: locate(root, "contributing") }),
    required: () => true,
    orgPaths: ["CONTRIBUTING.md", ".github/CONTRIBUTING.md", "docs/CONTRIBUTING.md"],
  },
  {
    id: "A6",
    title: "CODE_OF_CONDUCT",
    check: (root) => ({ found: locate(root, "conduct") }),
    required: () => true,
    orgPaths: ["CODE_OF_CONDUCT.md", ".github/CODE_OF_CONDUCT.md", "docs/CODE_OF_CONDUCT.md"],
  },
  {
    id: "A7",
    title: "SECURITY policy",
    check: (root) => ({ found: locate(root, "security") }),
    required: () => true,
    orgPaths: ["SECURITY.md", ".github/SECURITY.md", "docs/SECURITY.md"],
  },
  {
    id: "A8",
    title: "Issue forms + config.yml",
    check: (root) => {
      const state = issueTemplateState(root);
      if (state.forms.length > 0 && state.config) return { found: ".github/ISSUE_TEMPLATE/" };
      const missing = [
        state.forms.length === 0 ? "at least one form" : null,
        state.config ? null : "config.yml",
      ].filter(Boolean);
      return { found: null, detail: `missing ${missing.join(" and ")}` };
    },
    required: () => true,
    orgPaths: [".github/ISSUE_TEMPLATE", "ISSUE_TEMPLATE"],
  },
  {
    id: "A9",
    title: "Pull request template",
    check: (root) => ({ found: locate(root, "prTemplate") }),
    required: () => true,
    orgPaths: [
      ".github/PULL_REQUEST_TEMPLATE.md",
      "PULL_REQUEST_TEMPLATE.md",
      ".github/pull_request_template.md",
    ],
  },
  {
    id: "A10",
    title: "CODEOWNERS",
    check: (root) => ({ found: locate(root, "codeowners") }),
    required: () => true,
  },
  {
    id: "A11",
    title: "CI workflow",
    check: (root) => ({ found: workflowFiles(root)[0] ?? null }),
    required: (choices) => choices === null || choices.ci.some((item) => item !== "release"),
  },
  {
    id: "A12",
    title: "Dependency updates",
    check: (root) => ({ found: dependencyConfig(root) }),
    required: (choices) => choices?.dependencyBot !== "none",
  },
  {
    id: "A13",
    title: ".gitignore + .editorconfig",
    check: (root) => {
      const ignore = locate(root, "gitignore");
      const editor = locate(root, "editorconfig");
      if (ignore && editor) return { found: ".gitignore, .editorconfig" };
      return {
        found: null,
        detail: `missing ${[ignore ? null : ".gitignore", editor ? null : ".editorconfig"].filter(Boolean).join(" and ")}`,
      };
    },
    required: () => true,
  },
];

const FIX: Record<string, string> = {
  A1: "gh repo create (gated)",
  A2: "report only",
  A14: "gh label create --force",
  A15: "ruleset API (gated)",
  A16: "write manifest",
};

export interface AuditOptions {
  root: string;
  repo: string | null;
  repoInfo: RepoInfo | null;
  offline: boolean;
  acceptOrgDefaults: boolean;
}

async function orgDefault(
  ctx: ExecContext,
  owner: string,
  paths: string[],
): Promise<string | null> {
  for (const path of paths) {
    const result = await gh(ctx, ["api", `repos/${owner}/.github/contents/${path}`, "--silent"], {
      allowFailure: true,
    });
    if (result.code === 0) return `${owner}/.github/${path}`;
  }
  return null;
}

export async function audit(ctx: ExecContext, opts: AuditOptions): Promise<AuditResult> {
  const { root } = opts;
  const manifestRead = readManifest(root);
  const choices = manifestRead.manifest?.choices ?? null;
  const acceptOrg = opts.acceptOrgDefaults || choices?.acceptOrgDefaults === true;
  const remote = opts.repoInfo !== null;
  const online = remote && !opts.offline;
  const items: AuditItem[] = [];
  const notes: string[] = [];
  const orgDefaultsPending: string[] = [];

  items.push({
    id: "A1",
    title: "GitHub remote",
    status: remote ? "pass" : opts.offline && opts.repo ? "unknown" : "fail",
    required: true,
    found: opts.repoInfo?.nameWithOwner ?? opts.repo,
    detail: remote
      ? `${opts.repoInfo?.nameWithOwner} is reachable on GitHub`
      : opts.repo
        ? `${opts.repo} not reachable`
        : "no GitHub remote",
    fix: FIX.A1 ?? "",
  });

  const defaultBranch = opts.repoInfo?.defaultBranch ?? null;
  const manifestBranch = manifestRead.manifest?.defaultBranch ?? null;
  items.push({
    id: "A2",
    title: "Default branch",
    status:
      defaultBranch === null
        ? opts.repoInfo?.isEmpty
          ? "unknown"
          : "fail"
        : manifestBranch && manifestBranch !== defaultBranch
          ? "fail"
          : "pass",
    required: false,
    found: defaultBranch,
    detail:
      defaultBranch === null
        ? opts.repoInfo?.isEmpty
          ? "repository is empty; the first push sets it"
          : "unknown"
        : manifestBranch && manifestBranch !== defaultBranch
          ? `manifest says ${manifestBranch}, GitHub says ${defaultBranch}`
          : defaultBranch,
    fix: FIX.A2 ?? "",
  });

  const owner = (opts.repoInfo?.nameWithOwner ?? opts.repo ?? "").split("/")[0] ?? "";
  let orgRepoExists: boolean | null = null;
  for (const spec of FILE_ITEMS) {
    const required = spec.required(choices);
    const { found, detail } = spec.check(root);
    let status: ItemStatus = found ? "pass" : required ? "fail" : "n/a";
    let foundAt = found;
    let itemDetail = found ? found : (detail ?? "missing");
    if (!found && required && spec.orgPaths && online && owner !== "") {
      if (orgRepoExists === null) {
        const probe = await gh(ctx, ["api", `repos/${owner}/.github`, "--silent"], {
          allowFailure: true,
        });
        orgRepoExists = probe.code === 0;
      }
      if (orgRepoExists) {
        const org = await orgDefault(ctx, owner, spec.orgPaths);
        if (org) {
          status = "org-default";
          foundAt = org;
          itemDetail = `provided by org defaults (${org})${acceptOrg ? "" : "; counts only if the user confirms"}`;
          if (!acceptOrg) orgDefaultsPending.push(spec.id);
        }
      }
    }
    items.push({
      id: spec.id,
      title: spec.title,
      status,
      required,
      found: foundAt,
      detail: itemDetail,
      fix: "scaffold",
    });
  }

  const emojiLabels = choices?.emojiLabels === true;
  if (online && opts.repo) {
    const diff = diffLabels(desiredLabels(emojiLabels), await listLabels(ctx, opts.repo));
    const missing = [...diff.create, ...diff.update].map((label) => label.name);
    items.push({
      id: "A14",
      title: "Labels",
      status: missing.length === 0 ? "pass" : "fail",
      required: true,
      found: `${diff.ok.length} of ${diff.ok.length + missing.length} standard labels`,
      detail:
        missing.length === 0
          ? "all standard labels present"
          : `missing or different: ${missing.join(", ")}`,
      fix: FIX.A14 ?? "",
    });
  } else {
    items.push({
      id: "A14",
      title: "Labels",
      status: "unknown",
      required: true,
      found: null,
      detail: "needs a reachable GitHub repository",
      fix: FIX.A14 ?? "",
    });
  }

  const rulesetChosen = choices?.ruleset === true;
  if (!rulesetChosen) {
    items.push({
      id: "A15",
      title: "Default-branch ruleset",
      status: "n/a",
      required: false,
      found: null,
      detail: "not chosen",
      fix: FIX.A15 ?? "",
    });
  } else if (online && opts.repo) {
    const lookup = await findRuleset(ctx, opts.repo);
    items.push({
      id: "A15",
      title: "Default-branch ruleset",
      status: lookup.error ? "unknown" : lookup.ruleset ? "pass" : "fail",
      required: true,
      found: lookup.ruleset ? `${lookup.ruleset.name} (#${lookup.ruleset.id})` : null,
      detail:
        lookup.error ??
        (lookup.ruleset ? "targets ~DEFAULT_BRANCH" : "no ruleset targets the default branch"),
      fix: FIX.A15 ?? "",
    });
  } else {
    items.push({
      id: "A15",
      title: "Default-branch ruleset",
      status: "unknown",
      required: true,
      found: null,
      detail: "needs a reachable GitHub repository",
      fix: FIX.A15 ?? "",
    });
  }

  items.push({
    id: "A16",
    title: "Manifest (.github/cutwater.json)",
    status: manifestRead.manifest ? "pass" : "fail",
    required: true,
    found: manifestRead.exists ? ".github/cutwater.json" : null,
    detail: manifestRead.manifest
      ? "valid"
      : manifestRead.exists
        ? `invalid: ${manifestRead.errors.join("; ")}`
        : "missing",
    fix: FIX.A16 ?? "",
  });

  const requiredItems = items.filter((item) => item.required);
  const passing = (item: AuditItem) =>
    item.status === "pass" || (item.status === "org-default" && acceptOrg);
  const passed = requiredItems.filter(passing).length;
  let classification: Classification;
  if (!remote || passed <= 2) classification = "not-set-up";
  else if (requiredItems.every(passing)) classification = "fully-set-up";
  else classification = "partially-set-up";

  if (opts.offline) notes.push("Offline mode: remote checks (A1, A14, A15) were not run.");
  if (orgDefaultsPending.length > 0) {
    notes.push(
      `Org-level defaults cover ${orgDefaultsPending.join(", ")}; ask the user whether they count, then re-run with --accept-org-defaults.`,
    );
  }
  return {
    classification,
    repo: opts.repoInfo?.nameWithOwner ?? opts.repo,
    remote,
    passed,
    required: requiredItems.length,
    items,
    manifest: {
      exists: manifestRead.exists,
      valid: manifestRead.manifest !== null,
      errors: manifestRead.errors,
    },
    orgDefaultsPending,
    notes,
  };
}

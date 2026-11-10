/** Small read-mostly GitHub helpers: reactions, status and wiki checks. */
import { CutwaterError } from "./errors.ts";
import { gh, ghJson, git, type ExecContext } from "./exec.ts";

export const REACTIONS = [
  "+1",
  "-1",
  "laugh",
  "confused",
  "heart",
  "hooray",
  "rocket",
  "eyes",
] as const;

export interface ReactionResult {
  ok: boolean;
  issue: number;
  content: string;
  warning: string | null;
}

/** Reactions are best-effort: a failure is reported, never thrown. */
export async function react(
  ctx: ExecContext,
  repo: string,
  issue: number,
  content: string,
): Promise<ReactionResult> {
  if (!(REACTIONS as readonly string[]).includes(content)) {
    throw new CutwaterError("USAGE", `Reaction must be one of: ${REACTIONS.join(", ")}`);
  }
  try {
    await gh(ctx, [
      "api",
      "--method",
      "POST",
      `repos/${repo}/issues/${issue}/reactions`,
      "-f",
      `content=${content}`,
      "--silent",
    ]);
    return { ok: true, issue, content, warning: null };
  } catch (error) {
    if (error instanceof CutwaterError && error.code === "FORBIDDEN") throw error;
    return {
      ok: false,
      issue,
      content,
      warning: `reaction not added (best-effort): ${(error as Error).message}`,
    };
  }
}

interface IssueRow {
  number: number;
  title: string;
  url: string;
  labels?: { name: string }[];
}

interface PrRow {
  number: number;
  title: string;
  url: string;
  headRefName: string;
  isDraft: boolean;
  statusCheckRollup?: { conclusion?: string | null; status?: string; state?: string }[];
}

export function checkState(
  rollup: PrRow["statusCheckRollup"],
): "passing" | "failing" | "pending" | "none" {
  if (!rollup || rollup.length === 0) return "none";
  const states = rollup.map((check) =>
    (check.conclusion ?? check.state ?? check.status ?? "").toUpperCase(),
  );
  if (
    states.some((state) =>
      ["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE"].includes(
        state,
      ),
    )
  ) {
    return "failing";
  }
  if (states.every((state) => ["SUCCESS", "NEUTRAL", "SKIPPED"].includes(state))) return "passing";
  return "pending";
}

export interface StatusReport {
  repo: string;
  login: string;
  issues: { number: number; title: string; url: string; labels: string[] }[];
  pulls: {
    number: number;
    title: string;
    url: string;
    branch: string;
    draft: boolean;
    checks: string;
  }[];
  localBranches: string[];
  remoteBranches: string[];
  branchesWithoutPr: string[];
}

export async function status(ctx: ExecContext, repo: string, login: string): Promise<StatusReport> {
  const issues = await ghJson<IssueRow[]>(ctx, [
    "issue",
    "list",
    "--repo",
    repo,
    "--assignee",
    "@me",
    "--state",
    "open",
    "--json",
    "number,title,url,labels",
    "--limit",
    "100",
  ]);
  const pulls = await ghJson<PrRow[]>(ctx, [
    "pr",
    "list",
    "--repo",
    repo,
    "--author",
    "@me",
    "--state",
    "open",
    "--json",
    "number,title,url,headRefName,isDraft,statusCheckRollup",
    "--limit",
    "100",
  ]);
  const refs = async (pattern: string) => {
    const result = await git(ctx, ["for-each-ref", "--format=%(refname:short)", pattern], {
      allowFailure: true,
    });
    return result.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "");
  };
  const localBranches = await refs(`refs/heads/${login}/`);
  const remoteBranches = (await refs(`refs/remotes/origin/${login}/`)).map((ref) =>
    ref.replace(/^origin\//, ""),
  );
  const prBranches = new Set(pulls.map((pull) => pull.headRefName));
  return {
    repo,
    login,
    issues: issues.map((issue) => ({
      number: issue.number,
      title: issue.title,
      url: issue.url,
      labels: (issue.labels ?? []).map((label) => label.name),
    })),
    pulls: pulls.map((pull) => ({
      number: pull.number,
      title: pull.title,
      url: pull.url,
      branch: pull.headRefName,
      draft: pull.isDraft,
      checks: checkState(pull.statusCheckRollup),
    })),
    localBranches,
    remoteBranches,
    branchesWithoutPr: [...new Set([...localBranches, ...remoteBranches])]
      .filter((branch) => !prBranches.has(branch))
      .sort(),
  };
}

export interface WikiCheck {
  enabled: boolean;
  initialized: boolean;
  url: string;
  next: string;
}

/**
 * GitHub only creates a wiki's git repository once the first page exists,
 * and no API can create it, so an uninitialised wiki is handed to the user.
 */
export async function wikiCheck(
  ctx: ExecContext,
  repo: string,
  enabled: boolean,
): Promise<WikiCheck> {
  const url = `https://github.com/${repo}.wiki.git`;
  if (!enabled) {
    return {
      enabled,
      initialized: false,
      url,
      next: `The wiki is disabled. Ask the user to enable it under Settings → General → Features (a settings change, so it needs their yes).`,
    };
  }
  const result = await git(ctx, ["ls-remote", url], { allowFailure: true });
  if (result.code === 0) {
    return {
      enabled,
      initialized: true,
      url,
      next: "Clone the wiki into a temporary directory, generate the pages, show a diff summary and ask before pushing.",
    };
  }
  return {
    enabled,
    initialized: false,
    url,
    next: `Open https://github.com/${repo}/wiki, click "Create the first page", save it, then say continue.`,
  };
}

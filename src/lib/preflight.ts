// Copyright 2026 Ayush Kumar Shaw
// SPDX-License-Identifier: Apache-2.0

/**
 * Preflight: everything cutwater must know before any other step.
 * Read-only. Identity always comes from `gh api user` (invariant I4).
 */
import { CutwaterError } from "./errors.ts";
import { gh, git, type ExecContext } from "./exec.ts";
import { readManifest } from "./manifest.ts";

export interface GitInfo {
  insideWorkTree: boolean;
  root: string | null;
  hasCommits: boolean;
  branch: string | null;
  originUrl: string | null;
  /** owner/name parsed from a github.com origin URL. */
  originRepo: string | null;
}

export interface AuthInfo {
  installed: boolean;
  authenticated: boolean;
  version: string | null;
  /** Classic OAuth scopes, or null when gh does not report them (fine-grained tokens). */
  scopes: string[] | null;
}

export interface RepoInfo {
  nameWithOwner: string;
  defaultBranch: string | null;
  visibility: string;
  hasWikiEnabled: boolean;
  isEmpty: boolean;
}

/** Parse owner/name from https, ssh and scp-style github.com remote URLs. */
export function parseGithubRemote(url: string): string | null {
  const match =
    /^(?:https?:\/\/(?:[^@/]+@)?github\.com\/|ssh:\/\/git@github\.com(?::\d+)?\/|git@github\.com:)([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/.exec(
      url.trim(),
    );
  return match ? `${match[1]}/${match[2]}` : null;
}

export async function gitInfo(ctx: ExecContext): Promise<GitInfo> {
  const inside = await git(ctx, ["rev-parse", "--is-inside-work-tree"], { allowFailure: true });
  if (inside.code !== 0 || inside.stdout.trim() !== "true") {
    return {
      insideWorkTree: false,
      root: null,
      hasCommits: false,
      branch: null,
      originUrl: null,
      originRepo: null,
    };
  }
  const root = (await git(ctx, ["rev-parse", "--show-toplevel"])).stdout.trim();
  const head = await git(ctx, ["rev-parse", "--verify", "--quiet", "HEAD"], { allowFailure: true });
  const branch = await git(ctx, ["symbolic-ref", "--quiet", "--short", "HEAD"], {
    allowFailure: true,
  });
  const origin = await git(ctx, ["remote", "get-url", "origin"], { allowFailure: true });
  const originUrl = origin.code === 0 ? origin.stdout.trim() : null;
  return {
    insideWorkTree: true,
    root,
    hasCommits: head.code === 0,
    branch: branch.code === 0 ? branch.stdout.trim() : null,
    originUrl,
    originRepo: originUrl ? parseGithubRemote(originUrl) : null,
  };
}

export function parseScopes(statusText: string): string[] | null {
  const match = /Token scopes:\s*(.*)/.exec(statusText);
  if (!match) return null;
  const raw = (match[1] ?? "").trim();
  if (raw === "" || raw.toLowerCase() === "none") return [];
  return raw
    .split(",")
    .map((scope) => scope.trim().replace(/^['"]|['"]$/g, ""))
    .filter((scope) => scope !== "");
}

export async function authInfo(ctx: ExecContext): Promise<AuthInfo> {
  let versionOutput: string;
  try {
    versionOutput = (await gh(ctx, ["--version"], { allowFailure: true })).stdout;
  } catch (error) {
    if (error instanceof CutwaterError)
      return { installed: false, authenticated: false, version: null, scopes: null };
    throw error;
  }
  const version = /gh version (\S+)/.exec(versionOutput)?.[1] ?? null;
  const status = await gh(ctx, ["auth", "status"], { allowFailure: true });
  const text = `${status.stdout}\n${status.stderr}`;
  return { installed: true, authenticated: status.code === 0, version, scopes: parseScopes(text) };
}

export async function viewerLogin(ctx: ExecContext): Promise<string> {
  const result = await gh(ctx, ["api", "user"]);
  const login = (JSON.parse(result.stdout) as { login?: unknown }).login;
  if (typeof login !== "string" || login === "")
    throw new CutwaterError("AUTH", "gh api user returned no login");
  return login;
}

/** Repository details, or null when it does not exist (or is not visible). */
export async function repoView(ctx: ExecContext, repo: string): Promise<RepoInfo | null> {
  const result = await gh(
    ctx,
    [
      "repo",
      "view",
      repo,
      "--json",
      "nameWithOwner,defaultBranchRef,visibility,hasWikiEnabled,isEmpty",
    ],
    {
      allowFailure: true,
    },
  );
  if (result.code !== 0) {
    if (/could not resolve|not found|HTTP 404/i.test(result.stderr)) return null;
    // Re-run through the typed path so auth and network errors surface properly.
    await gh(ctx, ["repo", "view", repo, "--json", "nameWithOwner"]);
    return null;
  }
  const data = JSON.parse(result.stdout) as {
    nameWithOwner: string;
    defaultBranchRef: { name: string } | null;
    visibility: string;
    hasWikiEnabled: boolean;
    isEmpty: boolean;
  };
  return {
    nameWithOwner: data.nameWithOwner,
    defaultBranch: data.defaultBranchRef?.name || null,
    visibility: (data.visibility ?? "").toLowerCase(),
    hasWikiEnabled: Boolean(data.hasWikiEnabled),
    isEmpty: Boolean(data.isEmpty),
  };
}

/**
 * Decide which repository this run is pinned to: --repo, else the manifest,
 * else origin. An explicit --repo that contradicts the manifest is refused
 * rather than silently acting on a different repository.
 */
export function resolveRepo(
  explicit: string | null,
  root: string,
  originRepo: string | null,
): string | null {
  const manifestRepo = readManifest(root).manifest?.repo ?? null;
  if (
    explicit !== null &&
    manifestRepo !== null &&
    explicit.toLowerCase() !== manifestRepo.toLowerCase()
  ) {
    throw new CutwaterError(
      "FORBIDDEN",
      `--repo ${explicit} does not match the manifest's repository ${manifestRepo}; cutwater only acts on the repository named in the manifest`,
    );
  }
  return explicit ?? manifestRepo ?? originRepo;
}

/** Scopes each feature needs with a classic OAuth token. */
export const SCOPE_NEEDS: Record<string, string> = {
  repo: "issues, pull requests, labels, rulesets and private repositories",
  workflow: "pushing files under .github/workflows",
  project: "the optional Projects board",
};

export interface PreflightProblem {
  code: string;
  message: string;
  remediation: string;
}

export interface PreflightResult {
  ok: boolean;
  git: GitInfo;
  gh: AuthInfo;
  login: string | null;
  repo: string | null;
  repoInfo: RepoInfo | null;
  missingScopes: string[];
  problems: PreflightProblem[];
}

export async function preflight(
  ctx: ExecContext,
  explicitRepo: string | null,
): Promise<PreflightResult> {
  const problems: PreflightProblem[] = [];
  const gitState = await gitInfo(ctx);
  if (!gitState.insideWorkTree) {
    problems.push({
      code: "NOT_A_REPO",
      message: "This folder is not a git repository.",
      remediation:
        "Ask the user before running `git init` (confirmation gate), then run preflight again.",
    });
  }
  const auth = await authInfo(ctx);
  if (!auth.installed) {
    problems.push({
      code: "NO_GH",
      message: "GitHub CLI (gh) is not installed.",
      remediation: "Install it from https://cli.github.com and run `gh auth login`.",
    });
  } else if (!auth.authenticated) {
    problems.push({
      code: "AUTH",
      message: "gh is not authenticated.",
      remediation: "Run `gh auth login`, then run preflight again.",
    });
  }

  let login: string | null = null;
  let repo: string | null = null;
  let info: RepoInfo | null = null;
  if (auth.authenticated) {
    login = await viewerLogin(ctx);
    repo = resolveRepo(explicitRepo, gitState.root ?? ctx.cwd, gitState.originRepo);
    if (repo !== null) {
      ctx.repo = repo;
      info = await repoView(ctx, repo);
      if (info === null) {
        problems.push({
          code: "NO_GITHUB_REPO",
          message: `GitHub repository ${repo} was not found.`,
          remediation:
            "Run the interview; setup offers `gh repo create` behind a confirmation gate.",
        });
      }
    } else {
      problems.push({
        code: "NO_GITHUB_REPO",
        message: "No GitHub remote is configured.",
        remediation: "Run the interview; setup offers `gh repo create` behind a confirmation gate.",
      });
    }
  }
  const missingScopes =
    auth.scopes === null
      ? []
      : Object.keys(SCOPE_NEEDS).filter(
          (scope) => scope !== "project" && !auth.scopes?.includes(scope),
        );
  const blocking = problems.some((problem) => ["AUTH", "NO_GH"].includes(problem.code));
  return {
    ok: !blocking,
    git: gitState,
    gh: auth,
    login,
    repo,
    repoInfo: info,
    missingScopes,
    problems,
  };
}

/**
 * The only place cutwater starts processes.
 *
 * - Processes are spawned with argument arrays and no shell, so text from
 *   GitHub can never be interpreted as shell syntax.
 * - Every gh and git call passes an allowlist; `gh pr merge` and pushes are
 *   refused outright (invariant I1).
 * - gh calls are pinned to one repository (`--repo` or `repos/OWNER/NAME`).
 * - Mutating calls are skipped in dry-run mode and recorded instead.
 * - Transient failures are retried with jittered exponential backoff.
 * - When CUTWATER_LOG names a file, every call is appended to it as a JSON
 *   line, which the idempotency tests use to count mutations.
 */
import { spawn } from "node:child_process";
import { appendFileSync } from "node:fs";
import { CutwaterError, classifyGhFailure } from "./errors.ts";

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  cwd: string;
  input?: string;
}

export type Runner = (cmd: string, args: string[], opts: RunOptions) => Promise<RunResult>;

export const spawnRunner: Runner = (cmd, args, opts) =>
  new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, {
        cwd: opts.cwd,
        shell: false,
        windowsHide: true,
        env: {
          ...process.env,
          GH_PROMPT_DISABLED: "1",
          GH_NO_UPDATE_NOTIFIER: "1",
          GIT_TERMINAL_PROMPT: "0",
          NO_COLOR: "1",
        },
      });
    } catch (error) {
      resolve({ code: 127, stdout: "", stderr: String(error) });
      return;
    }
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.on("error", (error: NodeJS.ErrnoException) => {
      resolve({ code: error.code === "ENOENT" ? 127 : 1, stdout: "", stderr: String(error) });
    });
    child.on("close", (code) => {
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(out).toString("utf8"),
        stderr: Buffer.concat(err).toString("utf8"),
      });
    });
    if (opts.input !== undefined) child.stdin.end(opts.input);
    else child.stdin.end();
  });

export interface PlannedCommand {
  cmd: string;
  args: string[];
}

export interface ExecContext {
  cwd: string;
  runner: Runner;
  dryRun: boolean;
  /** owner/name every gh call is pinned to, once known. */
  repo: string | null;
  /** Mutating commands skipped because of dry-run. */
  planned: PlannedCommand[];
  /** Base delay for retries in milliseconds. */
  retryBaseMs: number;
  logFile: string | null;
}

/** Retries after the first attempt for transient errors (5xx, secondary rate limits). */
export const MAX_RETRIES = 3;
/** Default first backoff; doubled per retry, plus up to 50% random jitter. */
export const DEFAULT_RETRY_BASE_MS = 500;

export function createContext(overrides: Partial<ExecContext> = {}): ExecContext {
  const envBase = process.env.CUTWATER_RETRY_BASE_MS;
  return {
    cwd: process.cwd(),
    runner: spawnRunner,
    dryRun: false,
    repo: null,
    planned: [],
    retryBaseMs: envBase !== undefined && envBase !== "" ? Number(envBase) : DEFAULT_RETRY_BASE_MS,
    logFile: process.env.CUTWATER_LOG ?? null,
    ...overrides,
  };
}

const GH_READ = new Set([
  "auth status",
  "repo view",
  "label list",
  "issue list",
  "issue view",
  "pr list",
  "pr view",
  "pr checks",
]);
const GH_WRITE = new Set(["repo create", "label create"]);
const GH_FORBIDDEN = new Set([
  "pr merge",
  "repo delete",
  "repo edit",
  "repo rename",
  "repo archive",
  "release delete",
]);
const GIT_ALLOWED = new Set([
  "rev-parse",
  "remote",
  "for-each-ref",
  "ls-remote",
  "status",
  "symbolic-ref",
  "log",
  "branch",
  "config",
  "check-attr",
]);
/** Repository-relative API paths cutwater may write to. */
const API_WRITE_PATHS = [
  /^repos\/[^/]+\/[^/]+\/labels$/,
  /^repos\/[^/]+\/[^/]+\/rulesets(\/\d+)?$/,
  /^repos\/[^/]+\/[^/]+\/issues\/\d+\/reactions$/,
  /^repos\/[^/]+\/[^/]+\/private-vulnerability-reporting$/,
];

export interface ApiCall {
  method: string;
  path: string;
}

/** Extract the method and path from `gh api` arguments. */
export function parseApiArgs(args: string[]): ApiCall {
  let method: string | null = null;
  let path: string | null = null;
  let sendsBody = false;
  for (let i = 1; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (arg === "-X" || arg === "--method") {
      method = (args[++i] ?? "").toUpperCase();
    } else if (arg.startsWith("--method=")) {
      method = arg.slice("--method=".length).toUpperCase();
    } else if (["-f", "-F", "--field", "--raw-field", "--input"].includes(arg)) {
      sendsBody = true;
      i++;
    } else if (["-H", "--header", "--jq", "-q", "--template", "-t", "--hostname"].includes(arg)) {
      i++;
    } else if (!arg.startsWith("-") && path === null) {
      path = arg.replace(/^\//, "");
    }
  }
  // gh defaults to POST when fields are sent and no method is given.
  return { method: method ?? (sendsBody ? "POST" : "GET"), path: path ?? "" };
}

export function isMutating(cmd: string, args: string[]): boolean {
  if (cmd !== "gh") return false;
  const verb = `${args[0] ?? ""} ${args[1] ?? ""}`;
  if (GH_WRITE.has(verb)) return true;
  if (args[0] === "api") return parseApiArgs(args).method !== "GET";
  return false;
}

function forbidden(message: string): CutwaterError {
  return new CutwaterError("FORBIDDEN", message);
}

/** Refuse any command outside the allowlist. Throws FORBIDDEN. */
export function assertAllowed(cmd: string, args: string[], pinnedRepo: string | null): void {
  if (cmd === "git") {
    const sub = args[0] ?? "";
    if (!GIT_ALLOWED.has(sub)) throw forbidden(`git ${sub} is not on cutwater's allowlist`);
    if (sub === "config" && !args.includes("--get")) {
      throw forbidden("cutwater only reads git config");
    }
    if (sub === "remote" && !["get-url", "-v"].includes(args[1] ?? "-v")) {
      throw forbidden("cutwater only reads git remotes");
    }
    if (
      sub === "branch" &&
      args.some((a) => /^-(d|D|m|M|c|C|f)$|^--(delete|move|copy|force)$/.test(a))
    ) {
      throw forbidden("cutwater does not modify branches");
    }
    return;
  }
  if (cmd !== "gh") throw forbidden(`${cmd} is not on cutwater's allowlist`);

  const verb = `${args[0] ?? ""} ${args[1] ?? ""}`;
  if (GH_FORBIDDEN.has(verb)) throw forbidden(`gh ${verb} is never run by cutwater`);
  if (args[0] === "--version") return;

  if (args[0] === "api") {
    const { method, path } = parseApiArgs(args);
    if (/\/merges?$|\/merge\b/.test(path) || path.includes("auto-merge")) {
      throw forbidden("cutwater never merges pull requests");
    }
    if (method === "GET") {
      if (path === "user") return;
      assertPinnedApiPath(path, pinnedRepo, true);
      return;
    }
    if (!API_WRITE_PATHS.some((re) => re.test(path))) {
      throw forbidden(`gh api ${method} ${path} is not on cutwater's allowlist`);
    }
    assertPinnedApiPath(path, pinnedRepo, false);
    return;
  }

  if (!GH_READ.has(verb) && !GH_WRITE.has(verb)) {
    throw forbidden(`gh ${verb.trim()} is not on cutwater's allowlist`);
  }
  if (verb === "auth status" || verb === "repo create") return;
  if (verb === "repo view") {
    const target = args[2] && !args[2].startsWith("-") ? args[2] : null;
    if (
      pinnedRepo !== null &&
      target !== null &&
      target.toLowerCase() !== pinnedRepo.toLowerCase()
    ) {
      throw forbidden(`refusing to read ${target}: this run is pinned to ${pinnedRepo}`);
    }
    return;
  }
  const repoFlag = flagValue(args, "--repo") ?? flagValue(args, "-R");
  if (repoFlag === null) throw forbidden(`gh ${verb} must be pinned with --repo`);
  if (pinnedRepo !== null && repoFlag.toLowerCase() !== pinnedRepo.toLowerCase()) {
    throw forbidden(`refusing to touch ${repoFlag}: this run is pinned to ${pinnedRepo}`);
  }
}

function assertPinnedApiPath(path: string, pinnedRepo: string | null, read: boolean): void {
  const match = /^repos\/([^/]+)\/([^/]+)/.exec(path);
  if (!match) throw forbidden(`gh api ${path} is outside repository scope`);
  if (pinnedRepo === null) return;
  const target = `${match[1]}/${match[2]}`.toLowerCase();
  const pinned = pinnedRepo.toLowerCase();
  if (target === pinned) return;
  // Reading the owner's .github repository is how org-level community
  // health defaults are detected; it is the only cross-repo read allowed.
  const owner = pinned.split("/")[0];
  if (read && target === `${owner}/.github`) return;
  throw forbidden(`refusing to touch ${target}: this run is pinned to ${pinnedRepo}`);
}

export function flagValue(args: string[], flag: string): string | null {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (arg === flag) return args[i + 1] ?? null;
    if (arg.startsWith(`${flag}=`)) return arg.slice(flag.length + 1);
  }
  return null;
}

function log(ctx: ExecContext, entry: Record<string, unknown>): void {
  if (!ctx.logFile) return;
  try {
    appendFileSync(ctx.logFile, `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`);
  } catch {
    // Logging is diagnostic only and must never break a run.
  }
}

export interface CallOptions {
  input?: string;
  /** Return failures instead of throwing. */
  allowFailure?: boolean;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Run an allowlisted command. Mutating gh calls are skipped in dry-run mode. */
export async function run(
  ctx: ExecContext,
  cmd: string,
  args: string[],
  opts: CallOptions = {},
): Promise<RunResult> {
  assertAllowed(cmd, args, ctx.repo);
  const mutating = isMutating(cmd, args);
  if (mutating && ctx.dryRun) {
    ctx.planned.push({ cmd, args });
    log(ctx, { cmd, args, mutating, dryRun: true, skipped: true });
    return { code: 0, stdout: "", stderr: "" };
  }

  let attempt = 0;
  for (;;) {
    const result = await ctx.runner(cmd, args, { cwd: ctx.cwd, input: opts.input });
    log(ctx, { cmd, args, mutating, dryRun: ctx.dryRun, code: result.code, attempt });
    if (result.code === 0) return result;
    if (result.code === 127) {
      throw new CutwaterError(
        cmd === "gh" ? "AUTH" : "USAGE",
        `${cmd} is not installed or not on PATH`,
      );
    }
    if (cmd !== "gh") {
      if (opts.allowFailure) return result;
      throw new CutwaterError("USAGE", `git ${args.join(" ")} failed: ${result.stderr.trim()}`);
    }
    const failure = classifyGhFailure(result.stderr);
    if (failure.transient && attempt < MAX_RETRIES) {
      const delay = ctx.retryBaseMs * 2 ** attempt * (1 + Math.random() * 0.5);
      attempt++;
      await sleep(delay);
      continue;
    }
    if (opts.allowFailure) return result;
    throw new CutwaterError(
      failure.code,
      `gh ${args.slice(0, 2).join(" ")} failed: ${firstLine(result.stderr)}`,
      {
        status: failure.status,
        stderr: result.stderr.trim().slice(0, 2000),
      },
    );
  }
}

function firstLine(text: string): string {
  return (text.trim().split("\n")[0] ?? "").slice(0, 300) || "no error output";
}

export const gh = (ctx: ExecContext, args: string[], opts?: CallOptions) =>
  run(ctx, "gh", args, opts);

export const git = (ctx: ExecContext, args: string[], opts?: CallOptions) =>
  run(ctx, "git", args, opts);

export async function ghJson<T>(ctx: ExecContext, args: string[]): Promise<T> {
  const result = await gh(ctx, args);
  try {
    return JSON.parse(result.stdout) as T;
  } catch {
    throw new CutwaterError("REMOTE", `gh ${args.slice(0, 2).join(" ")} returned invalid JSON`);
  }
}

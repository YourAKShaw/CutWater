// Copyright 2026 Ayush Kumar Shaw
// SPDX-License-Identifier: Apache-2.0

/**
 * The only place cutwater starts processes.
 *
 * - Processes are spawned with argument arrays and no shell, so text from
 *   GitHub can never be interpreted as shell syntax.
 * - Every gh and git call passes an allowlist; `gh pr merge` and pushes are
 *   refused outright (invariant I1).
 * - gh calls are pinned to one repository (`--repo` or `repos/OWNER/NAME`);
 *   `gh project` calls are pinned to that repository's owner (`--owner`),
 *   or to a Project id verified as the owner's (`--project-id`).
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
  /** Extra environment variables for this call. */
  env?: Record<string, string>;
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
          ...opts.env,
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
  /** The authenticated login, so `--owner @me` can be checked against the pin. */
  viewer: string | null;
  /**
   * Project node ids (`PVT_…`) verified to belong to the pinned owner. Only
   * project code adds to it, after checking the owner live; `item-edit`
   * takes no `--owner`, so it is allowed only for these ids.
   */
  projectIds: Set<string>;
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
    viewer: null,
    projectIds: new Set(),
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
  "pr list",
  "pr checks",
  "run view",
]);
/** Flags a `gh project` verb may use: `true` takes a value, `false` is a switch. */
type ProjectFlags = Record<string, boolean>;
const OUTPUT: ProjectFlags = { "--format": true, "--jq": true, "--template": true };
/** Short forms cutwater accepts, only as a separate token (`-L 30`). */
const PROJECT_SHORT: Record<string, string> = {
  "-q": "--jq",
  "-t": "--template",
  "-L": "--limit",
  "-R": "--repo",
};
/**
 * The exact flags each allowed verb accepts (from gh 2.100.0 help). Anything
 * else is refused, so the pin checks read the same arguments gh will (#8).
 * `item-edit` is id-only: its by-name mode (`--owner`, `--url`, `--field`,
 * `--value`) and its draft edits (`--title`, `--body`) are not allowed.
 */
const PROJECT_VERBS: Record<string, { write: boolean; number: boolean; flags: ProjectFlags }> = {
  list: {
    write: false,
    number: false,
    flags: { ...OUTPUT, "--owner": true, "--closed": false, "--limit": true },
  },
  view: { write: false, number: true, flags: { ...OUTPUT, "--owner": true } },
  "field-list": {
    write: false,
    number: true,
    flags: { ...OUTPUT, "--owner": true, "--limit": true },
  },
  "item-list": {
    write: false,
    number: true,
    flags: { ...OUTPUT, "--owner": true, "--limit": true, "--query": true },
  },
  create: { write: true, number: false, flags: { ...OUTPUT, "--owner": true, "--title": true } },
  link: { write: true, number: true, flags: { "--owner": true, "--repo": true } },
  "field-create": {
    write: true,
    number: true,
    flags: {
      ...OUTPUT,
      "--owner": true,
      "--name": true,
      "--data-type": true,
      "--single-select-options": true,
    },
  },
  "item-add": { write: true, number: true, flags: { ...OUTPUT, "--owner": true, "--url": true } },
  "item-edit": {
    write: true,
    number: false,
    flags: {
      ...OUTPUT,
      "--id": true,
      "--project-id": true,
      "--field-id": true,
      "--text": true,
      "--number": true,
      "--date": true,
      "--single-select-option-id": true,
      "--iteration-id": true,
      "--clear": false,
    },
  },
};
/** Creates that are not idempotent (#6): a replay after a lost response duplicates them. */
const PROJECT_NO_RETRY = new Set(["create", "field-create"]);
/** Destructive `gh project` verbs cutwater never runs (#8). */
const PROJECT_FORBIDDEN = new Set([
  "delete",
  "close",
  "unlink",
  "field-delete",
  "item-delete",
  "item-archive",
  "copy",
  "mark-template",
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
  if (args[0] === "project") return PROJECT_VERBS[args[1] ?? ""]?.write ?? false;
  if (args[0] === "api") return parseApiArgs(args).method !== "GET";
  return false;
}

function forbidden(message: string): CutwaterError {
  return new CutwaterError("FORBIDDEN", message);
}

/** What a call may touch beyond the pinned repository. */
export interface PinScope {
  viewer?: string | null;
  projectIds?: ReadonlySet<string>;
}

/** Refuse any command outside the allowlist. Throws FORBIDDEN. */
export function assertAllowed(
  cmd: string,
  args: string[],
  pinnedRepo: string | null,
  scope: PinScope = {},
): void {
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

  if (args[0] === "project") {
    assertProjectCall(args, pinnedRepo, scope);
    return;
  }

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
  const repoFlag = singleFlagValue(args, "--repo", "-R");
  if (repoFlag === null) throw forbidden(`gh ${verb} must be pinned with --repo`);
  if (pinnedRepo !== null && repoFlag.toLowerCase() !== pinnedRepo.toLowerCase()) {
    throw forbidden(`refusing to touch ${repoFlag}: this run is pinned to ${pinnedRepo}`);
  }
}

/**
 * Parse `gh project` arguments by the verb's own grammar and refuse anything
 * gh could read differently from cutwater: unknown flags, `--`, repeats,
 * bundled or attached short flags, and flag values that start with `-` (gh
 * would take `--title --owner o` as a title, leaving no owner). Returns each
 * flag's value, keyed by its long name.
 */
function parseProjectArgs(verb: string, args: string[]): Map<string, string> {
  const spec = PROJECT_VERBS[verb];
  if (!spec) throw forbidden(`gh project ${verb} is not on cutwater's allowlist`);
  const values = new Map<string, string>();
  let positionals = 0;
  for (let i = 2; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (arg === "--") throw forbidden(`gh project ${verb} does not accept --`);
    if (!arg.startsWith("-")) {
      if (!spec.number || positionals > 0 || !/^\d+$/.test(arg)) {
        throw forbidden(`gh project ${verb}: unexpected argument ${arg}`);
      }
      positionals++;
      continue;
    }
    const eq = arg.startsWith("--") ? arg.indexOf("=") : -1;
    const raw = eq === -1 ? arg : arg.slice(0, eq);
    const name = PROJECT_SHORT[raw] ?? raw;
    if (!(name in spec.flags)) throw forbidden(`gh project ${verb} does not allow ${raw}`);
    if (values.has(name)) throw forbidden(`${name} may be given only once`);
    let value = "";
    if (spec.flags[name]) {
      value = eq === -1 ? (args[++i] ?? "") : arg.slice(eq + 1);
      if (value === "" || value.startsWith("-")) {
        throw forbidden(`gh project ${verb}: ${name} needs a value that does not start with -`);
      }
    } else if (eq !== -1) {
      throw forbidden(`gh project ${verb}: ${name} takes no value`);
    }
    values.set(name, value);
  }
  return values;
}

/**
 * `gh project` takes `--owner`, not `--repo`, so it gets its own pin: the
 * owner must be the pinned repository's owner, `link` must name the pinned
 * repository, `item-add` only this repository's issues and PRs, and `item-edit`
 * only a Project id verified as the owner's. Destructive verbs are refused
 * outright. Fails closed when no repository is pinned yet.
 */
function assertProjectCall(args: string[], pinnedRepo: string | null, scope: PinScope): void {
  const verb = args[1] ?? "";
  if (PROJECT_FORBIDDEN.has(verb)) throw forbidden(`gh project ${verb} is never run by cutwater`);
  const flags = parseProjectArgs(verb, args);
  if (pinnedRepo === null) throw forbidden(`gh project ${verb} needs a pinned repository`);
  const pinnedOwner = (pinnedRepo.split("/")[0] ?? "").toLowerCase();

  if (verb === "item-edit") {
    const projectId = flags.get("--project-id");
    if (projectId === undefined) throw forbidden("gh project item-edit must pass --project-id");
    if (!flags.has("--id")) throw forbidden("gh project item-edit must pass --id");
    if (!scope.projectIds?.has(projectId)) {
      throw forbidden(
        `refusing to edit items of project ${projectId}: it is not verified as ${pinnedOwner}'s`,
      );
    }
    return;
  }

  const owner = flags.get("--owner");
  if (owner === undefined) throw forbidden(`gh project ${verb} must be pinned with --owner`);
  const resolved = owner === "@me" ? (scope.viewer ?? null) : owner;
  if (resolved === null || resolved.toLowerCase() !== pinnedOwner) {
    throw forbidden(`refusing to touch projects of ${owner}: this run is pinned to ${pinnedRepo}`);
  }
  if (verb === "item-add") {
    const url = flags.get("--url") ?? null;
    const match =
      url === null ? null : /^https:\/\/github\.com\/([^/]+\/[^/]+)\/(issues|pull)\/\d+$/.exec(url);
    if (match?.[1]?.toLowerCase() !== pinnedRepo.toLowerCase()) {
      throw forbidden(
        `refusing to add ${url ?? "no URL"}: only issues and pull requests of ${pinnedRepo}`,
      );
    }
  }
  if (verb === "link") {
    const repo = flags.get("--repo") ?? null;
    if (repo === null || repo.toLowerCase() !== pinnedRepo.toLowerCase()) {
      throw forbidden(
        `refusing to link ${repo ?? "no repository"}: this run is pinned to ${pinnedRepo}`,
      );
    }
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

/**
 * The value of a pinning flag, refusing any repeat. gh takes the last value
 * of a repeated flag, so checking only one occurrence would let
 * `--repo pinned --repo other` slip past the pin (#46). Matches `--long V`,
 * `--long=V`, `-S V`, `-S=V` and `-SV`. It scans every argument, even after
 * `--`, because `--` can be another flag's value (`--search -- --repo other`).
 * A short-flag cluster with `S` after another letter (`-vSV`, `-dSV`) is
 * refused outright: whether gh reads `S` as the flag or as part of the
 * previous flag's value depends on that flag, and cutwater never clusters.
 * Throws FORBIDDEN on a second occurrence or on such a cluster.
 */
export function singleFlagValue(args: string[], long: string, short?: string): string | null {
  const letter = short?.slice(1);
  const values: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (arg === long) values.push(args[++i] ?? "");
    else if (arg.startsWith(`${long}=`)) values.push(arg.slice(long.length + 1));
    else if (letter && arg.length > 1 && arg.startsWith("-") && !arg.startsWith("--")) {
      const at = arg.indexOf(letter, 1);
      if (at === -1) continue;
      if (at > 1) throw forbidden(`${short} may not be combined with other short flags`);
      const attached = arg.slice(at + 1).replace(/^=/, "");
      values.push(attached !== "" ? attached : (args[++i] ?? ""));
    }
  }
  if (values.length > 1) throw forbidden(`${long} may be given only once`);
  return values[0] ?? null;
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
  assertAllowed(cmd, args, ctx.repo, { viewer: ctx.viewer, projectIds: ctx.projectIds });
  const mutating = isMutating(cmd, args);
  if (mutating && ctx.dryRun) {
    ctx.planned.push({ cmd, args });
    log(ctx, { cmd, args, mutating, dryRun: true, skipped: true });
    return { code: 0, stdout: "", stderr: "" };
  }

  let attempt = 0;
  for (;;) {
    // GH_REPO makes the pinned repository gh's fallback too, so a `-R` that gh
    // reads as another flag's value can never leave it on an ambient repo.
    const env = cmd === "gh" && ctx.repo !== null ? { GH_REPO: ctx.repo } : undefined;
    const result = await ctx.runner(cmd, args, { cwd: ctx.cwd, input: opts.input, env });
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
    // A lost response may hide a create that succeeded; replaying it would
    // duplicate the Project or field (#6). #45 generalises this.
    const replaySafe = !(args[0] === "project" && PROJECT_NO_RETRY.has(args[1] ?? ""));
    if (failure.transient && replaySafe && attempt < MAX_RETRIES) {
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

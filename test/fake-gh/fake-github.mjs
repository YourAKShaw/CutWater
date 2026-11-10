// An in-memory stand-in for the parts of GitHub that cutwater talks to
// through gh. Used directly by unit tests and through test/fake-gh/bin/gh
// by integration tests. Unsupported commands fail loudly (exit 2).
import { execFileSync } from "node:child_process";

export function newState(overrides = {}) {
  return {
    login: "octocat",
    authenticated: true,
    scopes: ["gist", "read:org", "repo", "workflow"],
    repos: {},
    orgDotGithub: {},
    failures: [],
    nextId: 100,
    calls: [],
    ...overrides,
  };
}

export function newRepo(overrides = {}) {
  return {
    visibility: "PRIVATE",
    defaultBranch: "main",
    hasWikiEnabled: true,
    wikiInitialized: false,
    isEmpty: false,
    labels: [],
    rulesets: [],
    reactions: [],
    issues: [],
    pulls: [],
    threads: {},
    runLogs: {},
    ...overrides,
  };
}

const ok = (stdout = "") => ({ code: 0, stdout, stderr: "" });
const fail = (stderr, code = 1) => ({ code, stdout: "", stderr: `${stderr}\n` });
const json = (value) => ok(`${JSON.stringify(value)}\n`);

function flag(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? null : (args[index + 1] ?? null);
}

function notFoundRepo(name) {
  return fail(`GraphQL: Could not resolve to a Repository with the name '${name}'. (repository)`);
}

function apiArgs(args) {
  let method = null;
  let path = null;
  const fields = {};
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-X" || arg === "--method") method = args[++i].toUpperCase();
    else if (arg === "-f" || arg === "-F" || arg === "--field" || arg === "--raw-field") {
      const [key, ...rest] = args[++i].split("=");
      fields[key] = rest.join("=");
    } else if (arg === "--input") i++;
    else if (arg === "--jq" || arg === "-q" || arg === "-H") i++;
    else if (!arg.startsWith("-") && path === null) path = arg.replace(/^\//, "");
  }
  return { method: method ?? (Object.keys(fields).length > 0 ? "POST" : "GET"), path, fields };
}

/** Handle one gh invocation. Mutates state. */
export function handle(state, args, { input = "", cwd = process.cwd() } = {}) {
  state.calls.push(args);
  const verb = `${args[0] ?? ""} ${args[1] ?? ""}`;
  const injected = state.failures.find((f) => verb.startsWith(f.match) && f.times > 0);
  if (injected) {
    injected.times--;
    return fail(injected.stderr);
  }
  if (args[0] === "--version") return ok("gh version 2.100.0 (2026-09-03)\n");
  if (verb === "auth status") {
    if (!state.authenticated)
      return fail("You are not logged into any GitHub hosts. To log in, run: gh auth login");
    const scopes =
      state.scopes === null
        ? ""
        : `\n  - Token scopes: ${state.scopes.map((s) => `'${s}'`).join(", ")}`;
    return ok(
      `github.com\n  ✓ Logged in to github.com account ${state.login} (keyring)\n  - Active account: true${scopes}\n`,
    );
  }
  if (!state.authenticated)
    return fail("To get started with GitHub CLI, please run:  gh auth login");

  if (verb === "pr merge") return fail("fake gh: cutwater must never merge", 99);

  if (verb === "repo view") {
    const name = args[2];
    const repo = state.repos[name];
    if (!repo) return notFoundRepo(name);
    return json({
      nameWithOwner: name,
      defaultBranchRef: repo.isEmpty ? { name: "" } : { name: repo.defaultBranch },
      visibility: repo.visibility,
      hasWikiEnabled: repo.hasWikiEnabled,
      isEmpty: repo.isEmpty,
    });
  }
  if (verb === "repo create") {
    const name = args[2];
    if (state.repos[name])
      return fail("GraphQL: Name already exists on this account (createRepository)");
    const visibility = args.includes("--public")
      ? "PUBLIC"
      : args.includes("--internal")
        ? "INTERNAL"
        : "PRIVATE";
    state.repos[name] = newRepo({ visibility, isEmpty: true, defaultBranch: "" });
    if (args.includes("--remote=origin") || flag(args, "--remote") === "origin") {
      try {
        execFileSync("git", ["remote", "add", "origin", `https://github.com/${name}.git`], {
          cwd,
          stdio: "ignore",
        });
      } catch {
        // Not a git repository or remote already set; real gh would also fail later.
      }
    }
    return ok(`https://github.com/${name}\n`);
  }

  const repoName = flag(args, "--repo") ?? flag(args, "-R");
  if (verb === "label list") {
    const repo = state.repos[repoName];
    if (!repo) return notFoundRepo(repoName);
    return json(repo.labels);
  }
  if (verb === "label create") {
    const repo = state.repos[repoName];
    if (!repo) return notFoundRepo(repoName);
    const name = args[2];
    const color = (flag(args, "--color") ?? "ededed").toLowerCase();
    const description = flag(args, "--description") ?? "";
    const existing = repo.labels.find((l) => l.name.toLowerCase() === name.toLowerCase());
    if (existing && !args.includes("--force"))
      return fail(
        `label with name "${name}" already exists; use \`--force\` to update its color and description`,
      );
    if (existing) Object.assign(existing, { color, description });
    else repo.labels.push({ name, color, description });
    return ok();
  }
  if (verb === "issue list") return json(state.repos[repoName]?.issues ?? []);
  if (verb === "run view") {
    const log = state.repos[repoName]?.runLogs?.[args[2]];
    return log === undefined ? fail("HTTP 404: Not Found") : ok(log);
  }
  if (verb === "pr list") return json(state.repos[repoName]?.pulls ?? []);

  if (args[0] === "api") {
    const { method, path, fields } = apiArgs(args);
    if (path === "user") return json({ login: state.login });
    const dotGithub = /^repos\/([^/]+)\/\.github(?:\/contents\/(.+))?$/.exec(path);
    if (dotGithub) {
      const files = state.orgDotGithub[dotGithub[1]];
      if (!files) return fail("HTTP 404: Not Found");
      if (!dotGithub[2]) return json({ name: ".github" });
      return files.some((f) => f === dotGithub[2] || f.startsWith(`${dotGithub[2]}/`))
        ? json({ path: dotGithub[2] })
        : fail("HTTP 404: Not Found");
    }
    const match = /^repos\/([^/]+\/[^/]+)\/(.+)$/.exec(path ?? "");
    if (!match) return fail(`fake gh: unsupported api path ${path}`, 2);
    const repo = state.repos[match[1]];
    if (!repo) return fail("HTTP 404: Not Found");
    const rest = match[2];
    if (rest === "rulesets" && method === "GET")
      return json(
        repo.rulesets.map(({ id, name, target, enforcement }) => ({
          id,
          name,
          target,
          enforcement,
        })),
      );
    if (rest === "rulesets" && method === "POST") {
      const body = JSON.parse(input);
      const ruleset = { ...body, id: state.nextId++ };
      repo.rulesets.push(ruleset);
      return json(ruleset);
    }
    const one = /^rulesets\/(\d+)$/.exec(rest);
    if (one) {
      const ruleset = repo.rulesets.find((r) => r.id === Number(one[1]));
      if (!ruleset) return fail("HTTP 404: Not Found");
      if (method === "GET") return json(ruleset);
      if (method === "PUT") {
        Object.assign(ruleset, JSON.parse(input), { id: ruleset.id });
        return json(ruleset);
      }
    }
    const thread = /^(issues|pulls)\/(\d+)(?:\/(comments|reviews))?(?:\?.*)?$/.exec(rest);
    if (thread && method === "GET") {
      const t = repo.threads?.[thread[2]];
      if (!t) return fail("HTTP 404: Not Found");
      if (thread[1] === "issues" && !thread[3]) return json(t.issue);
      if (thread[1] === "issues" && thread[3] === "comments") return json(t.comments ?? []);
      if (thread[1] === "pulls" && thread[3] === "reviews") return json(t.reviews ?? []);
      if (thread[1] === "pulls" && thread[3] === "comments") return json(t.reviewComments ?? []);
    }
    const reaction = /^issues\/(\d+)\/reactions$/.exec(rest);
    if (reaction && method === "POST") {
      repo.reactions.push({ issue: Number(reaction[1]), content: fields.content });
      return json({ id: state.nextId++, content: fields.content });
    }
    return fail(`fake gh: unsupported api ${method} ${path}`, 2);
  }
  return fail(`fake gh: unsupported command gh ${args.join(" ")}`, 2);
}

/** A Runner for unit tests: gh goes to the fake, git runs for real. */
export function fakeGithubRunner(state, realRunner) {
  return async (cmd, args, opts) => {
    if (cmd === "gh") return handle(state, args, { input: opts.input ?? "", cwd: opts.cwd });
    return realRunner(cmd, args, opts);
  };
}

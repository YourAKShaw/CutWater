# Using cutwater

## Contents

- [Requirements](#requirements)
- [Install](#install)
- [Invoke](#invoke)
- [What a session looks like](#what-a-session-looks-like)
- [Explicit-only invocation](#explicit-only-invocation)
- [Hard limits in the client](#hard-limits-in-the-client)
- [Troubleshooting](#troubleshooting)

## Requirements

- `git` and the [GitHub CLI](https://cli.github.com), authenticated with `gh auth login`.
- Node.js 18 or later for the helper. Without it the skill falls back to a slower manual mode.
- Network access to github.com.

Token scopes: `repo` for issues, PRs, labels and private repositories, and `workflow` to push `.github/workflows/` files. `project` is needed only for the optional Projects board. For a smaller blast radius, use a fine-grained token limited to the one repository.

## Install

Keep the `skills/cutwater/` folder intact (`SKILL.md`, `references/`, `assets/`, `scripts/`, `agents/`, `LICENSE`).

### Claude Code: plugin

```text
/plugin marketplace add YourAKShaw/ThroughLine
/plugin install cutwater@cutwater
```

The repository must be visible to your GitHub account for the marketplace to resolve.

### Claude Code: personal or project skill

```sh
git clone https://github.com/YourAKShaw/ThroughLine.git
mkdir -p ~/.claude/skills
cp -R ThroughLine/skills/cutwater ~/.claude/skills/
```

For a project installation, copy it to `.claude/skills/` in that project instead. The entry point must end up at `~/.claude/skills/cutwater/SKILL.md` (or `.claude/skills/cutwater/SKILL.md`).

### Codex

Copy the folder to `~/.agents/skills/cutwater/` (personal) or `.agents/skills/cutwater/` (project). Codex reads `agents/openai.yaml` for its display name, default prompt and invocation policy.

### Antigravity

Copy the folder to `.agents/skills/cutwater/` in the project, or `~/.gemini/antigravity/skills/cutwater/` for every project. Secondary sources disagree on `.agent/` versus `.agents/` for project skills; if the skill does not appear, try the other one.

### Claude apps: upload a ZIP

Download `cutwater-<version>.zip` from the [latest release](https://github.com/YourAKShaw/ThroughLine/releases), or build it: `cd skills && zip -r ../cutwater.zip cutwater`. The archive must contain one top-level `cutwater/` folder with `SKILL.md` directly inside. Upload it under **Customize → Skills**, with code execution enabled. The hosted sandbox needs `gh` and network access for anything beyond reading the guidance.

### Other agents

Any client that supports the [Agent Skills](https://agentskills.io/specification) format can load the folder; `SKILL.md` uses only spec frontmatter fields. With the Skills CLI: `npx skills add YourAKShaw/ThroughLine`.

### Check the install

```sh
node ~/.claude/skills/cutwater/scripts/cutwater.mjs --version
node ~/.claude/skills/cutwater/scripts/cutwater.mjs preflight
```

## Invoke

- **Explicitly:** `/cutwater` in Claude Code, `$cutwater` in Codex, or "use cutwater to …".
- **Implicitly:** describe the work, for example "set up this repo", "start a task to add rate limiting", "open a PR for this", "what's the status of my branches?", "update the wiki".

Every invocation starts with Phase 0, unless you say to skip setup.

## What a session looks like

```text
you   › /cutwater set up this repo
agent › ✅ preflight: @octocat, octocat/demo (private, empty)
        ⛔ Not set up (1/14 required items pass)
        🧭 Setting up octocat/demo. Reply "ok" to accept everything, or change any line: …
you   › ok, description "Demo API", add the ruleset
agent › 📋 Plan for octocat/demo: 16 create, 0 update, 0 conflict, 0 skip; manifest create
        ✅ applied: 18 change(s); manifest written
        Committed directly to main (empty repository). 🛡️ Ruleset created (#123456).
        ✅ Setup is complete. Shall we start a task?
you   › fix the login bug for emails with a +
agent › Issue #1 🐛 fix: accept plus signs in sign-in emails · branch octocat/fix/1-accept-plus-signs-sign-emails
        … commits … PR #2 fix(auth): accept plus signs in email addresses (#1)
        Ready for your review — I will not merge.
```

## Explicit-only invocation

The skill keeps implicit invocation on, because its first actions (preflight, audit, status) are read-only and every write is gated. To require explicit invocation:

- **Claude Code:** add `disable-model-invocation: true` to the frontmatter of your installed copy of `SKILL.md`. It is a Claude Code extension, so it is not shipped: other clients, and the Claude app uploader, reject unknown frontmatter keys.
- **Codex:** set `policy: allow_implicit_invocation: false` in `agents/openai.yaml`.

## Hard limits in the client

Rules in a skill are requests, not guarantees. For hard enforcement:

- **Claude Code:** merge `assets/client-rules/claude-code-settings.json` into `.claude/settings.json`. It denies `gh pr merge`, `gh repo delete`, visibility edits, force-pushes and remote branch deletion.
- **Codex:** copy `assets/client-rules/codex.rules` to `~/.codex/rules/`.

## Troubleshooting

| Symptom | Cause and fix |
| :--- | :--- |
| `preflight` exits 3 | gh is missing or logged out: install it, then `gh auth login` |
| `⚠️ missing scope "workflow"` | Pushing workflow files will fail: `gh auth refresh -s workflow` |
| `apply` exits 2 | Gated entries need your yes: the agent should show each diff and re-run with `--yes <ids>` |
| `apply` exits 4 | A file changed after the plan was made: re-run `plan` |
| `ruleset ensure` fails with a scope error | Rulesets need Administration write on the repository; the skill continues in report-only mode |
| Wiki step stops | GitHub needs the first wiki page created in the web UI: create it, then say "continue" |
| `FORBIDDEN … pinned to` | The helper refused to act on a repository other than the one in the manifest; this is intentional |
| Skill does not trigger | Invoke it explicitly, or check the install path for your client |

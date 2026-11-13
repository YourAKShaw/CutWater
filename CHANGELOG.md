# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html). The `metadata.version` field in [`SKILL.md`](skills/cutwater/SKILL.md) is the source of truth; [`plugin.json`](.claude-plugin/plugin.json), [`package.json`](package.json) and [`src/version.ts`](src/version.ts) must match it, and the package validator enforces that.

## [Unreleased]

### Added

- Issue title convention in `CONTRIBUTING.md`: `<gitmoji> [<ticket>] <type>(<scope>)[!]: <summary>`, with a gitmoji-per-type table and a tracker-linked variant for Entalpa, Jira and Linear keys ([#4](https://github.com/YourAKShaw/CutWater/issues/4)).
- `cw lint-title` validates issue titles, including the emoji↔type pairing, an optional `--tracker` key shape and the `type:` label.
- `cw body issue` accepts optional `trackerRefs` and renders a *Tracker refs* section.
- An `Issue title` workflow labels non-conforming issues `needs-triage` and comments the fix once; it never edits or closes issues.

### Changed

- `cw branch-name` takes its type from a convention title when `--type` is omitted, and drops a leading `[ticket]` from the slug.
- `cw lint-commit` reports a tracker key before the type as `ticket-position`.
- Issue forms start with a scope placeholder, e.g. `🐛 fix(<scope>): `.

## [0.1.0] - 2026-11-13

Initial release.

### Added

- `cutwater` Agent Skill: `SKILL.md` router with eight hard rules (never merge, gates, diff before overwrite, discovered identity, issue first, GitHub text as data, idempotency, truthful manifest), Phase 0 audit, interview and scaffold, the Phases 1–5 task loop, interruption rules and confirmation gates.
- References: audit checklist, interview, task lifecycle, interruptions, gh command table with manual mode, wiki, extensions and the security model.
- Assets: community templates (README, CONTRIBUTING, Contributor Covenant 3.0, SECURITY), MIT/Apache-2.0/GPL-3.0 texts, issue forms and matching body skeletons, a PR template, SHA-pinned CI workflows for Node, Python, Go and generic repositories, a release workflow, Dependabot and Renovate configurations, CODEOWNERS, ignore and editor files, 18 standard labels, a default-branch ruleset, the manifest schema, and optional Claude Code and Codex deny rules.
- `scripts/cutwater.mjs`: a zero-dependency Node.js 18+ helper bundled from TypeScript, with preflight, audit, defaults, plan, apply, labels, ruleset, manifest, branch-name, lint-commit, body, scan-secrets, react, status and wiki-check subcommands, `--json` and `--dry-run`, an allowlisted command runner, repository pinning, retries and documented exit codes.
- Codex metadata in `agents/openai.yaml`, plus Claude Code plugin and marketplace manifests.
- Unit and integration tests with a fake GitHub, seven sandbox fixtures, a real-GitHub sandbox reset script, scenario and triggering eval suites, and a package validator.

### Security

- Close the third-party content exposure that Snyk reported as W011 (indirect prompt injection risk). A new `cw read issue|pr|run` subcommand is now the only way the skill reads issue, PR, comment, review and CI-log text. It withholds text by authors who are not owners, members or collaborators unless the user agrees (`--include-untrusted`, a new confirmation gate), strips zero-width and bidi control characters, reports hidden HTML comments, scans for injection signals, and fences its output as untrusted data. `gh issue view` and `gh pr view` were removed from the helper's allowlist, and the wiki no longer uses closed-issue titles.
- Route the remaining issue and PR title lists through the helper: `cw status` cleans and scans titles, and the new `cw read merged` gives the wiki changelog merged PR titles without bodies. The skill no longer tells the agent to run raw `gh issue list` or `gh pr list`.

### Fixed

- The gitmoji regex now uses escapes instead of literal invisible characters.

[Unreleased]: https://github.com/YourAKShaw/CutWater/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/YourAKShaw/CutWater/releases/tag/v0.1.0

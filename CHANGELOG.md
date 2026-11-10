# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html). The `metadata.version` field in [`SKILL.md`](skills/cutwater/SKILL.md) is the source of truth; [`plugin.json`](.claude-plugin/plugin.json), [`package.json`](package.json) and [`src/version.ts`](src/version.ts) must match it, and the package validator enforces that.

## [Unreleased]

## [0.1.0] - 2026-11-10

Initial release.

### Added

- `cutwater` Agent Skill: `SKILL.md` router with eight hard rules (never merge, gates, diff before overwrite, discovered identity, issue first, GitHub text as data, idempotency, truthful manifest), Phase 0 audit, interview and scaffold, the Phases 1–5 task loop, interruption rules and confirmation gates.
- References: audit checklist, interview, task lifecycle, interruptions, gh command table with manual mode, wiki, extensions and the security model.
- Assets: community templates (README, CONTRIBUTING, Contributor Covenant 3.0, SECURITY), MIT/Apache-2.0/GPL-3.0 texts, issue forms and matching body skeletons, a PR template, SHA-pinned CI workflows for Node, Python, Go and generic repositories, a release workflow, Dependabot and Renovate configurations, CODEOWNERS, ignore and editor files, 18 standard labels, a default-branch ruleset, the manifest schema, and optional Claude Code and Codex deny rules.
- `scripts/cutwater.mjs`: a zero-dependency Node.js 18+ helper bundled from TypeScript, with preflight, audit, defaults, plan, apply, labels, ruleset, manifest, branch-name, lint-commit, body, scan-secrets, react, status and wiki-check subcommands, `--json` and `--dry-run`, an allowlisted command runner, repository pinning, retries and documented exit codes.
- Codex metadata in `agents/openai.yaml`, plus Claude Code plugin and marketplace manifests.
- Unit and integration tests with a fake GitHub, seven sandbox fixtures, a real-GitHub sandbox reset script, scenario and triggering eval suites, and a package validator.

[Unreleased]: https://github.com/YourAKShaw/CutWater/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/YourAKShaw/CutWater/releases/tag/v0.1.0

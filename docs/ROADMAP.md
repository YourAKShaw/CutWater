# Roadmap

Milestones from the implementation plan, with their state in this repository.

| Milestone | Scope | State |
| :--- | :--- | :--- |
| **M0 Foundations** | Name clash check, repository and CI, `skills-ref` in CI, gh command table, token-scope matrix, baseline evals | Done, except the baseline runs. The name check moved the skill to `cutwater` ([ADR 0009](adr/0009-name.md)); the helper is tested against gh 2.100.0. The no-skill baseline protocol exists, with no runs recorded. |
| **M1 Audit + manifest** | `preflight`, `audit`, manifest schema and validation, classification, org defaults | Done: correct on every sandbox fixture, with zero writes |
| **M2 Interview + scaffold** | Templates, `plan` and `apply` with diff-and-ask, repository creation, gated ruleset | Done: a fresh repository reaches *fully set up* in one run, and the second run reports no changes |
| **M3 Task loop** | Issue skeletons, labels, `branch-name`, `lint-commit`, PR body builder, reactions | Done |
| **M4 Interruptions + SKILL.md** | `interruptions.md`, SKILL.md at 300 lines or fewer, description tuning | Written; the ≥ 90% interruption gate awaits eval runs |
| **M5 Wiki, status, security** | Wiki first-page detection, `status`, secret scan, injection fixtures, client deny rules | Done; the injection scenario awaits eval runs |
| **M6 Cross-client + release** | Install docs for Claude Code, Codex and Antigravity, `agents/openai.yaml`, tag v0.1.0 | Docs and metadata done; tagging and the two-client eval pass are pending |

## Next versions

- **v1.1:** `cw ci-triage` (wrapping `gh pr checks` and `gh run view --log-failed`) and `cw cleanup` (local merged-branch deletion; remote deletion gated). The guidance already exists in `references/extensions.md`.
- **v1.2:** releases from Conventional Commits (`cw release plan`), and opt-in Projects board sync.
- **Later:** evaluate `gh issue develop --name` for sidebar linking ([ADR 0006](adr/0006-custom-branch-naming.md)); Renovate as an upgrade path for existing Dependabot setups.

## Open questions

1. Should repositories under an organization with `.github` defaults count those as set up by default? (Today: only after the user confirms.)
2. Should label names use emoji by default? (Today: no, and opt-in.)
3. Should setup also open a "Repository setup" issue, so even the bootstrap PR is traced to an issue? (Today: the setup PR has no issue, and says so.)
4. Which clients beyond Claude Code and Codex must pass the evals for v1?

## Assumptions still to confirm

- The exact token scopes, classic and fine-grained, for pushing workflow files.
- The minimum gh version for every flag in `references/gh-commands.md` (tested today on gh 2.100.0 only).
- Antigravity's project skill path (`.agent/` or `.agents/`).
- The Codex rules syntax in `assets/client-rules/codex.rules`.

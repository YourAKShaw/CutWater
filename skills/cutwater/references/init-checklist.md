# Phase 0: audit checklist and setup

## Contents

- [Audit items](#audit-items)
- [Classification](#classification)
- [Optional items and org defaults](#optional-items-and-org-defaults)
- [Responses](#responses)
- [What setup creates](#what-setup-creates)
- [Scaffold order](#scaffold-order)
- [Upgrades on a set-up repository](#upgrades-on-a-set-up-repository)

## Audit items

`cw audit` checks each item. "Required" items count towards the classification; "report only" items are shown but do not count.

| # | Item | Pass criterion | Fix |
| :--- | :--- | :--- | :--- |
| A1 | GitHub remote | `origin` (or `--repo`, or the manifest) names a reachable GitHub repository | `gh repo create` (gated) |
| A2 | Default branch | Exists and matches the manifest (report only) | — |
| A3 | README | `README*` in the root, `.github/` or `docs/` | scaffold |
| A4 | LICENSE | `LICENSE*` or `COPYING*` in the root (not required when the license choice is `none`) | scaffold |
| A5 | CONTRIBUTING | Root, `.github/` or `docs/` | scaffold |
| A6 | CODE_OF_CONDUCT | Root, `.github/` or `docs/` | scaffold |
| A7 | SECURITY | Root, `.github/` or `docs/` | scaffold |
| A8 | Issue templates | `.github/ISSUE_TEMPLATE/` has at least one YAML form and `config.yml` | scaffold |
| A9 | PR template | `.github/`, root or `docs/` `PULL_REQUEST_TEMPLATE.md` (any case), or `.github/PULL_REQUEST_TEMPLATE/` | scaffold |
| A10 | CODEOWNERS | `.github/CODEOWNERS`, root or `docs/` (first found wins) | scaffold |
| A11 | CI workflow | At least one `.yml` file in `.github/workflows/` (not required when no lint, test or build CI was chosen) | scaffold |
| A12 | Dependency updates | `.github/dependabot.yml` or a Renovate config (not required when the choice is `none`) | scaffold |
| A13 | `.gitignore` and `.editorconfig` | Both exist in the root | scaffold |
| A14 | Labels | Every label in `assets/labels.json` exists with the same color and description | `gh label create --force` |
| A15 | Default-branch ruleset | A ruleset targets `~DEFAULT_BRANCH`; required only when the manifest says it was chosen | ruleset API (gated) |
| A16 | Manifest | `.github/cutwater.json` is valid against `assets/manifest.schema.json` | written by `apply` |
| A17 | CodeRabbit config | `.coderabbit.yaml`, `.coderabbit.yml` or `.coderabbit.config.ts` in the root (YAML wins over TypeScript, so an existing TypeScript config is never shadowed); required only when the manifest records a `coderabbit` profile | scaffold |

Statuses: ✅ pass, ❌ fail, 🏢 provided by org defaults, ❔ unknown (needs network or permission), ➖ not applicable.

## Classification

- **Fully set up:** every required item passes, including a valid manifest.
- **Not set up:** no reachable GitHub repository, or at most two required items pass.
- **Partially set up:** anything in between.

A repository that has everything but no manifest is *partially* set up. The only missing item is the manifest, and `apply` records it once the files verify.

## Optional items and org defaults

- The wiki, the Projects board, the ruleset and the CodeRabbit config count only when the manifest says the user chose them.
- The CodeRabbit config only tunes reviews; it does not install the CodeRabbit GitHub App. Never add CodeRabbit to the ruleset's required checks: it can skip or be rate-limited and would block merges. When the `coderabbit` answer is not `off`, walk the user through the CodeRabbit checklist after scaffolding (`coderabbit.md`, linked from SKILL.md).
- An organization's `.github` repository can supply default community health files. They show in the GitHub UI but are not part of the repository clone. The audit reports them as 🏢 "provided by org defaults" and lists them in `orgDefaultsPending`.
- Ask the user: "Your organization's `.github` repository provides SECURITY.md and CODE_OF_CONDUCT.md. Count those as set up, or add repository-specific copies?" If they count, re-run `cw audit --accept-org-defaults` and set `"acceptOrgDefaults": true` in the answers so later audits remember the decision.

## Responses

**Fully set up**

```text
✅ Setup is complete (14/14 required items pass).
<compact checklist from cw audit>
Do you want any upgrades (new workflows, refreshed templates, extra labels), or shall we start a task?
```

Make no writes. If the user asks for upgrades, re-run the interview with the manifest's choices as defaults.

**Partially set up:** show a two-column table (✅ existing, ❌ missing), then offer: "I can add only the missing items. Shall I run the interview for those?" The planner skips any group whose requirement is already met elsewhere, such as an existing `docs/README.md` or other issue forms.

**Not set up:** run the interview (see `interview.md`), then the scaffold below.

## What setup creates

| Path | Template | When |
| :--- | :--- | :--- |
| `README.md` | `community/README.md` | always |
| `LICENSE` | `licenses/<id>.txt` | license is not `none` |
| `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md` | `community/` | always |
| `.github/ISSUE_TEMPLATE/{bug,feature,chore,docs,config}.yml` | `issue-forms/` | always |
| `.github/PULL_REQUEST_TEMPLATE.md` | `pr/` | always |
| `.github/CODEOWNERS` | `repo/CODEOWNERS` | always |
| `.github/workflows/ci.yml` | `workflows/ci-<stack>.yml` | lint, test or build chosen |
| `.github/workflows/release.yml` | `workflows/release.yml` | release chosen |
| `.github/dependabot.yml` or `renovate.json` | `dependabot.yml` / `repo/renovate.json` | per choice |
| `.coderabbit.yaml` | `repo/coderabbit.yaml` (stack-aware `path_instructions`) | only when `coderabbit` is not `off` |
| `.gitignore`, `.editorconfig` | `repo/` | always |
| `.github/cutwater.json` | built by `apply` | always, last |

The code of conduct is Contributor Covenant 3.0, with the reporting contact filled in. CI workflows use `permissions: contents: read`, actions pinned to full commit SHAs, and no `pull_request_target`.

## Scaffold order

1. **Repository.** If none exists, the plan has a gated `repo-create` entry: `gh repo create <owner/name> --private --source=. --remote=origin`. It does not use `--push`, because the first commit does not exist yet.
2. **Default branch name.** In a repository with no commits, make sure the unborn branch has the chosen name: `git symbolic-ref HEAD refs/heads/<defaultBranch>`.
3. **Plan and confirm.** Run `cw plan --answers <file> --out <plan>`. Show the summary and the diff of every gated entry, and ask about each one. Collect the approved ids, for example `file:README.md,repo-create`.
4. **Apply.** Run `cw apply --plan <plan> --yes <ids>` (or `--yes none`). On exit 4 a file changed after planning: run `plan` again and show the new diff. On exit 5, report exactly what was and was not applied; the manifest is not written after a failure.
5. **Commit.**
   - `commitMode: "direct"` (empty repository only, gated): commit on the default branch and run `git push -u origin <defaultBranch>`.
   - `commitMode: "pr"`: `git switch -c <login>/chore/0-repo-setup`, commit, push, and open a PR titled `chore(repo): :tada: set up repository with cutwater`. Its body says that the bootstrap PR has no issue.
   - Commit in small logical steps (community files, issue forms, CI, manifest) with Conventional Commits. Pushing `.github/workflows/` over HTTPS needs the `workflow` scope.
6. **Ruleset (if chosen).** After the setup commit is on the default branch, run `cw ruleset ensure`. It exits 2 until the user says yes; then run `cw ruleset ensure --yes ruleset`. A 403 or 404 means the token lacks Administration write: report that and continue (report-only fallback).
7. **Private vulnerability reporting (optional, gated).** `SECURITY.md` points to GitHub's private reporting. Offer to enable it: `gh api --method PUT repos/<owner>/<repo>/private-vulnerability-reporting`.
8. **Verify.** Run `cw audit`. It should report "Setup is complete" once the setup PR is merged, or right away for direct commits.

## Upgrades on a set-up repository

- Running `plan` with the same answers yields `noChanges: true`, and `apply` reports `no-changes` with zero writes and zero API mutations.
- When a template changes in a newer skill version, a file whose hash still matches the manifest shows as `update`: it is the untouched previous template, so it is safe to refresh. It is still gated, with a diff.
- A file the user edited shows as `conflict` and is never touched without an explicit yes for that file.

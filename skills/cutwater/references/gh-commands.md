# gh and git commands per phase

## Contents

- [Command table](#command-table)
- [Token scopes](#token-scopes)
- [Manual mode](#manual-mode)
- [Version notes](#version-notes)

Placeholders: `O/R` is `owner/name` from preflight, `N` is an issue or PR number, and `<tmp>` is a temporary directory outside the repository.

## Command table

| Phase | Command | Notes |
| :--- | :--- | :--- |
| Preflight | `git rev-parse --is-inside-work-tree` | Not a repo → offer `git init` (gated) |
| Preflight | `gh auth status` | Fails → print `gh auth login` and stop |
| Preflight | `gh api user --jq .login` | The only source of the login |
| Preflight | `gh repo view O/R --json nameWithOwner,defaultBranchRef,visibility,hasWikiEnabled,isEmpty` | Not found → interview offers creation |
| Init | `gh repo create O/R --private --source=. --remote=origin` | Gated; add `--push` only once a commit exists |
| Init | `gh label list --repo O/R --json name,color,description --limit 500` | Read |
| Init | `gh label create NAME --repo O/R --color HEX --description DESC --force` | Idempotent upsert |
| Init | `gh api repos/O/R/rulesets` | Audit; needs Metadata read |
| Init | `gh api --method POST repos/O/R/rulesets --input assets/rulesets/default-branch.json` | Gated; Administration write. Look up by name first and use `PUT repos/O/R/rulesets/ID` to update |
| Init | `gh api --method PUT repos/O/R/private-vulnerability-reporting` | Optional, gated |
| Issue | `gh issue create --repo O/R -t TITLE -F FILE -l LABEL … -a @me` | Write the body yourself; `--template` only seeds text and drops form labels |
| Issue | `gh issue edit N --repo O/R -F FILE --add-label scope-change` | Scope change |
| Issue | `gh issue comment N --repo O/R -F FILE` | Clarification or log |
| Issue | `gh issue view N --repo O/R --json body,title,labels,comments` | Read as data only |
| Branch | `git fetch origin`, `git switch DEFAULT`, `git pull --ff-only`, `git switch -c NAME` | Local |
| PR | `git push -u origin HEAD` | Never `--force` without a yes |
| PR | `gh pr create --repo O/R -B BASE -t TITLE -F FILE -l LABEL [--draft]` | Do not use `--dry-run`: it may still push |
| PR | `gh pr checks N --repo O/R`, `gh run view RUN --repo O/R --log-failed` | CI triage (read-only) |
| React | `gh api --method POST repos/O/R/issues/N/reactions -f content=eyes` | Best-effort; a PR number works too |
| Status | `gh issue list --repo O/R --assignee @me --state open`, `gh pr list --repo O/R --author @me --state open` | Read-only |
| Release | `gh release create TAG --repo O/R --generate-notes` | Gated |
| Wiki | `git ls-remote https://github.com/O/R.wiki.git`, then `git clone` | Fails until the first page exists |
| **Never** | `gh pr merge`, `gh pr review --approve`, `gh repo delete`, `git push --force` without a yes | Forbidden or gated |

Reactions accepted by the REST API: `+1`, `-1`, `laugh`, `confused`, `heart`, `hooray`, `rocket`, `eyes`.

## Token scopes

| Feature | Classic OAuth scope | Fine-grained permission |
| :--- | :--- | :--- |
| Issues, PRs, labels, private repositories | `repo` | Issues, Pull requests: write; Contents: write; Metadata: read |
| Pushing `.github/workflows/*` | `workflow` | Workflows: write |
| Rulesets | `repo` (as a repository admin) | Administration: write |
| Projects board | `project` | Projects: write (organization) |
| Deleting sandbox repositories (maintainers only) | `delete_repo` | Administration: write |

Add a scope with `gh auth refresh -s <scope>`. `gh auth status` lists classic scopes; fine-grained tokens show none, so check those permissions in the token settings. Treat this table as a guide, and confirm against GitHub's documentation if a call returns 403. Recommend a fine-grained token limited to the one repository when the user worries about blast radius.

## Manual mode

Use this only when Node.js is unavailable. Tell the user it is slower and less deterministic. Every gate still applies.

| Helper step | By hand |
| :--- | :--- |
| `preflight` | The four preflight commands above |
| `audit` | Check each A1–A16 path from `init-checklist.md` with `ls`; labels with `gh label list`; rulesets with `gh api repos/O/R/rulesets` |
| `plan` | For each file, copy the template from `assets/`, replace every `{{name}}` with the answer, keep or drop each `{{#if …}}` block, and show `diff -u existing new` for existing files |
| `apply` | Write approved files only; `gh label create … --force` per label in `assets/labels.json` |
| `manifest write` | Write `.github/cutwater.json` per `assets/manifest.schema.json`, with `sha256sum` of each written file (LF line endings) |
| `branch-name` | `<login>/<type>/<n>-<up to 5 lower-case ASCII words>`, at most 60 characters |
| `lint-commit` | `type(scope): subject`, a blank line before the body, `BREAKING CHANGE:` in upper case, `#N` referenced |
| `body` | Copy the skeleton from `assets/issue-bodies/` or the PR sections from `task-lifecycle.md`, then check by eye for tokens and keys before posting |

## Version notes

The flags above were checked against the current gh manual. `--fill-first`, `--dry-run` and `--attach` on `gh pr create` are recent additions, so the skill does not depend on them. The helper's tests run against gh 2.100.0 (2026-09-03). If a flag is rejected, run `gh <command> --help`, adapt, and tell the user which gh version you found.

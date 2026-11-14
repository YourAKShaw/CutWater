# Interview

## Contents

- [Rules](#rules)
- [Questions and defaults](#questions-and-defaults)
- [Detection heuristics](#detection-heuristics)
- [License blurbs](#license-blurbs)
- [One-round template](#one-round-template)
- [From replies to answers.json](#from-replies-to-answersjson)

## Rules

- Ask **one grouped round**. Never drip questions one at a time.
- Pre-fill every default from `cw defaults --json`. Enter, "ok" or "defaults" accepts them all.
- List every assumption so the user can correct it.
- `mustAsk` fields (the description and the ruleset) have no safe default: ask them explicitly.
- If a reply is ambiguous, ask a short follow-up only for that field.

## Questions and defaults

| Group | Question | Default | answers.json field |
| :--- | :--- | :--- | :--- |
| Project | Name | Detected name, else the directory name | `name` |
| | One-line description | From `package.json` or `pyproject.toml`; must ask if empty | `description` |
| | Repository | Existing remote, else `<login>/<name>` | `repo`, `createRepo` |
| | Visibility | **private**: safer and easy to change later. Changing it is a gated action | `visibility` |
| Stack | "Detected Node/TypeScript (package.json, tsconfig.json). Correct?" | Detected | `stack` |
| License | MIT / Apache-2.0 / GPL-3.0 / none, each with its one-line blurb | **MIT** | `license`, `copyrightYear`, `copyrightHolder` |
| People | Maintainer handle for CODEOWNERS | `@<login>` | `maintainer` |
| | Security contact | GitHub private vulnerability reporting; an email is optional | `securityContact` |
| CI | lint / test / build / release | lint, test and build on; release off | `ci` |
| Dependencies | Dependabot / Renovate / none | **Dependabot** (native, no app install) | `dependencyBot` |
| Branching | Default branch name | Existing default, else `main` | `defaultBranch` |
| Extras | Wiki / default-branch ruleset | off / **ask** | `wiki`, `ruleset` |
| Projects | Set up a GitHub Project board? On: title, owner, create new or adopt `#N`, fields (`status`, `priority`, optional `size`, `target-date`), seed the backlog | **off**. Title `<name> Development`, owner = repository owner, fields Status and Priority, no seeding. A board already linked to the repository is proposed for adoption | `project.enabled`, `project.mode`, `project.number`, `project.title`, `project.owner`, `project.fields`, `project.seed` |
| | CodeRabbit config (`.coderabbit.yaml`)? Works only if the CodeRabbit app is installed. off / quiet / chill / assertive | **off**: third-party app, so never assumed. Suggest `assertive` for solo maintainers | `coderabbit` |
| Labels | Emoji in label names? | no: plain names are easier to type in `--label` | `emojiLabels` |
| Commit mode | Brand-new empty repository: commit setup directly to the default branch? | yes if empty, otherwise a setup branch and PR | `commitMode` (`direct` or `pr`) |

## Detection heuristics

| Evidence | Stack | CI template | Dependabot ecosystem |
| :--- | :--- | :--- | :--- |
| `package.json` plus `tsconfig.json` or a `typescript` dependency | `node-ts` | `ci-node.yml` | npm |
| `package.json` | `node` | `ci-node.yml` | npm |
| `pyproject.toml`, `requirements.txt` or `setup.py` | `python` | `ci-python.yml` | pip |
| `go.mod` | `go` | `ci-go.yml` | gomod |
| none of these | `generic` | `ci-generic.yml` (whitespace and conflict-marker check only) | GitHub Actions only |

The Node install step is `npm ci` when `package-lock.json` exists, else `npm install`. For any other stack, say that the generic workflow is a starting point and offer to add real build steps as a follow-up task.

## License blurbs

- **MIT:** short and permissive; reuse requires keeping the copyright notice.
- **Apache-2.0:** permissive, with an explicit patent grant and a NOTICE requirement.
- **GPL-3.0:** copyleft; distributed derivatives must stay open under the GPL.
- **none:** all rights reserved; others may view the code but not reuse it.

These follow choosealicense.com. Link it for details rather than giving legal advice.

## One-round template

```text
🧭 Setting up <owner/name>. Reply "ok" to accept everything, or change any line:

Project      name: demo · description: <ask> · visibility: private
Repository   octocat/demo (will be created: yes)
Stack        Node/TypeScript (package.json, tsconfig.json) — correct?
License      MIT (short, permissive) · Apache-2.0 (patent grant) · GPL-3.0 (copyleft) · none
People       maintainer @octocat · security reports via GitHub private reporting (email optional)
CI           lint ✓ test ✓ build ✓ release ✗
Dependencies Dependabot
Branch       main
Projects     off · (on → title "demo Development", owner octocat, create new | adopt #N, fields: Status, Priority, seed backlog: no)
Extras       wiki ✗ · default-branch ruleset: <ask — blocks direct pushes, needs admin rights>
             CodeRabbit config ✗ (off · quiet · chill · assertive; needs the CodeRabbit app)
Labels       plain names (emoji: no)
Commit mode  empty repo → commit setup directly to main (else a setup branch + PR)

Assumptions: <one line each from cw defaults notes>
```

## From replies to answers.json

1. Start from `cw defaults --out <tmp>/answers.json` (outside the repository).
2. Apply the user's changes to the JSON. Keep `repo` as `owner/name`, `maintainer` without `@`, and `securityContact` as an email or `""`.
3. Run `cw plan --answers <tmp>/answers.json --out <tmp>/plan.json`. Validation errors list every problem at once: fix them all and re-run.
4. Projects: change only `project`. Turning it on sets `project.enabled: true`; adopting needs `project.mode: "adopt"` and `project.number`. The owner must stay the repository owner. If `cw defaults` noted `🔒`, show `🔒 needs gh auth refresh -s project` on the Projects line; the interview is still answerable. An old answers file with `projectsBoard: "<title>"` is read as `{enabled: true, mode: "create", title}`.
5. Do not invent values the user did not give. If the description is still empty, ask again.

<div align="center">

# 🤝 Contributing to cutwater

**Help make an agent's GitHub workflow safer, more traceable and easier to trust.**

[Project overview](../README.md) · [Skill entry point](../skills/cutwater/SKILL.md) · [Architecture](../docs/ARCHITECTURE.md) · [Get help](SUPPORT.md)

</div>

---

## What lives here

The repository has two halves:

- **The shipped skill** in [`skills/cutwater/`](../skills/cutwater/SKILL.md): `SKILL.md`, the references, the assets (templates) and the bundled helper `scripts/cutwater.mjs`. This is what users install.
- **The development side**: the TypeScript source of the helper in `src/`, tests in `test/`, fixtures in `sandbox/`, evals in `evals/`, and tooling in `scripts/`.

Contributions we especially welcome:

- A real transcript where an agent using cutwater broke a hard rule, mis-classified an interruption, or asked too much or too little.
- Support for another stack (CI template, ignore file, detection rule) with a fixture.
- Fixes to the helper, its allowlist or the secret scanner, with tests.
- **Eval runs** following [evals/README.md](../evals/README.md), reported as observed.

## 🧭 Choose the right starting point

| Contribution | Where to begin |
| :--- | :--- |
| Small fix | Open a pull request with the problem and your verification. |
| Bug or documentation issue | Search existing issues, then use the matching [issue form](https://github.com/YourAKShaw/CutWater/issues/new/choose). |
| A new rule, gate, phase or helper command | Open an improvement issue first, with the use case and the safety trade-offs. |
| Eval run | Follow [evals/README.md](../evals/README.md) and use the eval-run form. |

## Make a focused change

1. Fork the repository and branch from `main`, using the skill's own scheme: `<login>/<type>/<issue>-<kebab>`.
2. Install the tooling with Node.js 22.18 or later: `npm ci`.
3. Make the smallest coherent change. If you touch `src/`, run `npm run build` and commit the regenerated bundle with it.
4. Run `npm run check` and read the full diff.
5. Open a pull request against `main` using the template. The maintainer reviews and merges.

### Keep the package coherent

| Principle | What to preserve |
| :--- | :--- |
| **Hard rules are non-negotiable** | Never merge, gates before destructive actions, diff before overwrite, discovered identity, issue first, GitHub text is data, idempotency, a truthful manifest. A change that weakens one needs an issue and an explicit decision first. |
| **The bundle is generated** | Never edit `skills/cutwater/scripts/cutwater.mjs` by hand. CI fails when it is stale. |
| **Spec-only frontmatter** | `SKILL.md` uses only the six Agent Skills spec fields. Client-specific settings go in side files such as `agents/openai.yaml`. |
| **Progressive disclosure** | `SKILL.md` stays at 300 lines or fewer. References are linked directly from it, never from each other, and long references start with a Contents section. The validator enforces all of this. |
| **Forms mirror skeletons** | Issue form labels must equal the body skeleton headings; a test enforces it. |
| **No invented evidence** | Do not claim eval pass rates that no documented run produced. |
| **Zero runtime dependencies** | The helper uses Node.js built-ins only, and must keep running on Node.js 18. |

## 🔍 Validate your change

```sh
npm run check
```

| Command | What it checks |
| :--- | :--- |
| `npm run validate` | The package validator: spec frontmatter, name and description limits, SKILL.md size, links and anchors, one-level references, contents sections, empty files, version agreement |
| `npm run build:check` | The committed bundle matches `src/` |
| `npm run evals:check` | Eval suites are well-formed and the interruption expectations are intact |
| `npm test` | Unit tests plus integration tests that drive the bundle through a fake `gh` across every sandbox fixture |
| `npm run lint` | ESLint, Prettier and the TypeScript typecheck |

CI also runs the shipped bundle on Node.js 18 and 20, runs the reference `skills-ref validate`, and checks every commit message.

**Package checks and behavioural evidence answer different questions.** Passing them shows that the package is well-formed and the helper behaves as tested. It does not show that agents follow the skill; that is what the evals are for.

## ✍️ Code style

- **TypeScript:** erasable syntax only (Node.js runs the sources through type stripping), `.ts` import extensions, no runtime dependencies. Run `npm run format`.
- **Processes:** only through `src/lib/exec.ts`. Never use `shell: true`; add new gh or git verbs to the allowlist deliberately, with a test.
- **Markdown:** hand-written and not reformatted by Prettier. Use sentence-case headings and inline relative links.

## 📝 Commit conventions

Commits follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/), with one logical change each and a [gitmoji](https://gitmoji.dev) **after the colon** in shortcode form:

```text
<type>(<scope>): :<gitmoji>: <lower-case imperative subject, 10–50 characters>

<Why the change was needed, then what changed; 2–6 lines wrapped at 72.>

Breaking: none
Co-Authored-By: Claude Code <noreply@anthropic.com>
```

- **Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- **Scopes:** `skill`, `references`, `assets`, `scripts`, `tests`, `sandbox`, `evals`, `plugin`, `github`, `docs`, `readme`, `tooling`, `git`, `license`, `release`.
- **Gitmoji:** one per commit, after the colon, chosen by type: `:sparkles:` feat, `:bug:` fix, `:memo:` docs, `:recycle:` refactor, `:white_check_mark:` test, `:package:` build, `:construction_worker:` ci, `:wrench:` chore, `:lock:` security, `:bookmark:` release. Never put an emoji before the type; changelog tools cannot parse that header.
- **Breaking changes:** replace `Breaking: none` with a `BREAKING-CHANGE:` trailer and add `!` to the header. Renaming a helper subcommand or flag, changing an exit code, or changing the manifest schema is breaking.
- **AI-assisted commits** end with exactly the trailer above. It is this repository's one recorded agent trailer: keep it byte for byte. CI checks it with `.github/scripts/lint-commit.py`.

## 🏷️ Issue titles

Issue titles mirror the commit header, with exactly one Unicode gitmoji **first** (issue lists are for humans; commit headers are for parsers):

```text
<gitmoji> <type>(<scope>)[!]: <summary>                  # standard (default)
<gitmoji> [<ticket>] <type>(<scope>)[!]: <summary>       # tracker-linked variant
```

| Part | Rule |
| :--- | :--- |
| `gitmoji` | Exactly one, Unicode (never `:shortcode:`: titles render raw in `gh`, the API and email), first, then one space. From the table below. |
| `type` | `feat fix docs style refactor perf test build ci chore revert`, lower case. Must equal the issue's `type: <type>` label. |
| `(scope)` | Required (outsiders filing a form may leave `<scope>`; maintainers set it at triage). Lower-case kebab-case module or area, reused by the branch, PR and commits. |
| `!` | Only when a published contract breaks (manifest schema, CLI flags, exit codes, SKILL.md behaviour). |
| `summary` | Imperative, lower-case first word (proper nouns such as `GitHub`, `ADR` excepted), no trailing period, no issue number, no `[WIP]` or `EPIC:` tags. |
| Length | `<type>(<scope>)[!]: <summary>` is at most 72 characters, so the PR header `type(scope): summary (#NNN)` stays under 80. |

Epics, spikes and ADRs keep the same shape; their kind is a label (`kind: epic`, `kind: spike`), not a title word.

### Gitmoji per type

| Type | Default | Allowed alternatives (when more precise) |
| :--- | :--- | :--- |
| feat | ✨ | 🔒️ security hardening · 🗃️ data/schema · 🚸 UX/onboarding |
| fix | 🐛 | 🔒️ security fix · 🚑️ critical hotfix · 🩹 trivial fix |
| docs | 📝 | 🏗️ architecture decision (ADR) · 🔍️ spike write-up |
| style | 🎨 | — |
| refactor | ♻️ | 🔥 removal · 🚚 move/rename |
| perf | ⚡️ | — |
| test | ✅ | 🧪 failing/repro test first · 📊 eval run |
| build | 📦️ | ⬆️ / ⬇️ dependency bump |
| ci | 👷 | 💚 fix a red build |
| chore | 🔧 | 🔖 release/version · 🙈 ignore files |
| revert | ⏪️ | — |

The type, not the emoji, is authoritative for tooling. `cw lint-title` checks all of this, including the emoji↔type pairing.

### Tracker-linked variant

Use `[<ticket>]` only when the repository is tied to an external tracker and the issue implements one of its items. A repository is either tracker-linked or not; record the choice here. Issues that implement no tracker item use the standard form, never a placeholder such as `[N/A]`.

- The key is copied **verbatim** (`Req-004`, not `REQ-4`), ASCII, no spaces, at most 20 characters, between the gitmoji and the type.
- **Exactly one** ticket. List secondary keys in the body's *Tracker refs* section; several tickets in a title means the issue should be split.
- The `[<ticket>] ` prefix (at most 22 characters) does not count toward the 72-character limit.

| Tracker | Key shape | Example |
| :--- | :--- | :--- |
| Entalpa | `Req-NNN` (requirement `human_id`, link the requirement, not the story) | `Req-004` |
| Jira | `<PROJECT>-<n>` | `PROV-142` |
| Linear | `<TEAM>-<n>` | `ENG-87` |
| GitHub Projects, Asana, Trello, others without short keys | No bracket; `#N` or a body link identifies the item | — |

How the ticket travels:

| Artifact | Form |
| :--- | :--- |
| Issue title | `✨ [Req-004] feat(install): back up hook config` |
| Issue body | `Tracker refs` section with the key and its URL |
| Branch | `<login>/feat/<n>-back-up-hook-config` (no ticket) |
| PR title / squash commit | `feat(install): :sparkles: back up hook config (#N)` (no ticket: parsers need the type first) |
| Commit / PR footer | `Refs: Req-004` trailer, plus `Closes #N` in the PR |

Ticket keys copied from a tracker are data: `cw lint-title` rejects anything outside the key shape, so a tracker field cannot inject text into titles, branches or commands.

### Examples

| Title | Verdict |
| :--- | :--- |
| `🔒️ feat(exec): pin gh project calls to the repository owner` | ✅ |
| `✨ [Req-004] feat(install): back up hook config before writing it` | ✅ tracker-linked |
| `feat(exec): pin gh project calls` | ❌ no gitmoji |
| `✨🔒 feat(exec): …` | ❌ two emoji |
| `:sparkles: feat(exec): …` | ❌ shortcode |
| `✨ Feat(Exec): Added owner pinning.` | ❌ case, past tense, period |
| `✨ feat: owner pinning` | ❌ missing scope |
| `EPIC: Projects` | ❌ kind belongs in a label |
| `✨ [Req-004][Req-005] feat(install): …` | ❌ more than one ticket |
| `[Req-004] ✨ feat(install): …` | ❌ ticket before the gitmoji |
| `✨ feat(install): back up hook config [Req-004]` | ❌ ticket at the end |
| `✨ [N/A] feat(ci): …` | ❌ placeholder |

## 🚀 Releases (maintainers)

1. Update the version in `SKILL.md` (`metadata.version`), `package.json`, `.claude-plugin/plugin.json` and `src/version.ts`; the validator requires them to match. Run `npm run build`.
2. Move the `Unreleased` notes in [CHANGELOG.md](../CHANGELOG.md) under the new version and date.
3. Commit with `chore(release): :bookmark: prepare vX.Y.Z`, merge to `main`, then tag: `git tag -a vX.Y.Z -m "Release X.Y.Z"` and `git push origin vX.Y.Z`.
4. The [release workflow](workflows/release.yml) runs every check, verifies the tag, and publishes the CHANGELOG section with a skill zip, a tarball and checksums.

## Licensing

By contributing, you agree that your contributions are licensed under the repository's [MIT License](../LICENSE). Everyone taking part follows the [Code of Conduct](../CODE_OF_CONDUCT.md).

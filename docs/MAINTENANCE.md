# Maintenance

## Routine updates

| What | How often | How |
| :--- | :--- | :--- |
| Action SHAs in this repository's workflows | Weekly (Dependabot) | Review and merge Dependabot's `ci(github)` PRs |
| Action SHAs in the **scaffolded** templates (`assets/workflows/*.yml`) | Monthly, and on any security advisory | `gh api repos/<action>/releases/latest --jq .tag_name`, then `gh api repos/<action>/commits/<tag> --jq .sha`; update the SHA and the version comment in every template |
| npm dev tooling | Monthly (Dependabot) | Merge, run `npm run build`, commit the bundle if it changed |
| TypeScript major hold | On each typescript-eslint release | Dependabot skips TypeScript majors ([#34](https://github.com/YourAKShaw/CutWater/issues/34)). When `npm view typescript-eslint peerDependencies.typescript` allows 7.x, remove the `ignore` rule from `.github/dependabot.yml` and let Dependabot raise the bump |
| Contributor Covenant | On a new version | Fetch the upstream text from EthicalSource/contributor_covenant, re-apply the `{{reportingMethod}}` placeholder, and remove the editing note |
| License texts | Rarely | `gh api licenses/<id> --jq .body > assets/licenses/<ID>.txt` |
| gh compatibility | On each gh release | Run the integration tests, and spot-check the flags in `references/gh-commands.md` against `gh <command> --help` |
| `skills-ref` pin in CI | Quarterly | Update the commit SHA in `.github/workflows/test.yml` |

## Adding a stack

1. Add the stack id to `STACKS` and a profile in `src/lib/detect.ts`, and to the manifest schema enum (in both `assets/manifest.schema.json` and `src/lib/manifest.ts`).
2. Add `assets/workflows/ci-<stack>.yml` (read-only permissions, SHA-pinned actions, `{{#if ciLint}}`-style blocks) and `assets/repo/gitignore-<stack>`.
3. Add detection evidence and a case to `test/detect.test.ts`, and a fixture if the audit behaves differently.
4. Update the tables in `references/interview.md` and `references/init-checklist.md`.
5. `npm run build && npm run check`.

## Changing a template

Changing an asset changes its hash, so repositories set up earlier will see that file as `update` (when untouched) or `conflict` (when edited) on their next run. Both are gated with a diff. Note template changes in the CHANGELOG so users know why the diff appears.

## Changing the manifest schema

Schema changes are breaking. Bump `SCHEMA_VERSION` in `src/version.ts`, the `schemaVersion` const in the schema, and the major version of the skill (minor while pre-1.0), and teach `readManifest` to migrate or explain older versions.

## Before a release

1. `npm run check`.
2. Run the sandbox against real GitHub: `CUTWATER_SANDBOX_OWNER=<throwaway> node sandbox/reset.mjs --confirm`, then run the scenario evals.
3. Follow the release steps in [CONTRIBUTING.md](../.github/CONTRIBUTING.md#-releases-maintainers).

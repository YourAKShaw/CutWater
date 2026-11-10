# Testing and evaluation

cutwater is checked at four levels. The first three run in CI on every push; the fourth needs agent runs and is reported separately.

| Level | What | Where | Runs |
| :--- | :--- | :--- | :--- |
| Package | Spec frontmatter, size limits, links, one-level references, version agreement, bundle freshness, `skills-ref validate` | `scripts/validate-skill.ts`, `npm run build:check`, CI `skills-ref` job | every push |
| Unit | Template rendering, plan actions, hash-based upgrade detection, branch names (unicode, long, punctuated titles), commit linting (types, `!`, upper-case `BREAKING CHANGE`), label diffing, gh error mapping, the secret scanner, form-to-skeleton parity, the allowlist and pinning | `test/*.test.ts` | every push |
| Integration | The bundled helper driven through a fake `gh` on `PATH`, across every sandbox fixture | `test/integration/` | every push |
| Behaviour | Agents using the skill, graded against expected behaviour | `evals/` | per release; see below |

## Integration assertions

Every one of these is a test:

- No `gh pr merge`, ever.
- Every `label`, `issue` and `pr` call carries `--repo`, and every API path is inside the pinned repository (or the owner's `.github`).
- Dry-run issues zero mutating calls and writes no files.
- The audit is read-only on every fixture.
- **Idempotency gate:** setup followed by setup again makes no API mutations and leaves the manifest byte-identical (`updatedAt` unchanged).
- A conflicting README triggers a diff prompt (exit 2) and is never overwritten.
- A file edited after planning is refused (exit 4).
- A logged-out `gh` stops with `gh auth login` (exit 3).
- `--repo` that contradicts the manifest is refused.

## Sandbox repositories

The fixtures in [`sandbox/fixtures/`](../sandbox/README.md) (`empty`, `local-only`, `partial-community`, `partial-ci`, `full`, `has-custom-README`, `org-defaults`) are used offline by the integration tests. `sandbox/reset.mjs` recreates them on a throwaway GitHub account for the nightly and pre-release runs against real GitHub.

## Behavioural evals

[`evals/README.md`](../evals/README.md) has the protocol. In short: 11 scenarios × 5 runs × each model class (Haiku-, Sonnet- and Opus-class, plus a Codex model), graded by an LLM judge with human spot checks, and compared with a no-skill baseline. Gates: at least 90% per model on the three interruption inputs, every run passing for the no-writes-when-set-up, injection and no-merge scenarios, and at least 0.9 recall and precision on triggering.

**No behavioural results have been recorded yet.** Nothing in this repository claims a measured pass rate until a documented run exists.

## Observability while dogfooding

When dogfooding, log which reference files the agent opens. Merge content that is always read into `SKILL.md`, and delete files that are never read, while keeping `SKILL.md` within its limits.

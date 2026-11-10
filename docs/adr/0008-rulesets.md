# ADR 0008: rulesets instead of classic branch protection

**Status:** accepted

**Decision.** Protect the default branch with a repository ruleset targeting `~DEFAULT_BRANCH` (`assets/rulesets/default-branch.json`): it blocks deletion and force-pushes and requires a pull request. It is opt-in and gated.

**Rationale.** Rulesets support `~DEFAULT_BRANCH`, layering, and an `evaluate` mode on organization plans.

**Trade-offs.** It is a newer API surface and needs Administration write. **Fallback:** report-only when the call returns 403 or 404. The ruleset is applied after the setup commit reaches the default branch, because it would block that push.

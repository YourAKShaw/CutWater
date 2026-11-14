# ADR 0005: a committed manifest

**Status:** accepted

**Alternatives.** A git-ignored local state file, or GitHub repository custom properties (an organization feature).

**Decision.** Commit the manifest to `.github/cutwater.json`, validated against `assets/manifest.schema.json`.

**Consequences.** It adds a file to the repository, but it makes audits fast, survives fresh clones, and is reviewable in the setup PR. Per-file hashes let an upgrade tell an untouched template, which can be refreshed with a diff, from a user-edited file, which is never touched without an explicit yes. The manifest is written last and only after verification. Its `updatedAt` changes only when its content does.

The ruleset is applied after the setup commit lands, so the manifest does not depend on it. The audit verifies the ruleset live (A15), and `applied.rulesetId` is optional.

Schema v2 (v0.2.0, [ADR 0010](0010-github-projects.md)) adds the GitHub Project: owner, number, node id, and the status and priority field and option ids, written only after they are verified live. Item ids are never stored, because items churn and would change `updatedAt` without a content change. The writer emits v2 only once a Project is applied, so v1 manifests stay byte-identical, and v1 helpers reject a v2 manifest rather than misread it.

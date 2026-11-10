# ADR 0001: one skill, not a suite

**Status:** accepted

**Context.** The workflow has distinct phases: setup, the task loop, wiki, status. Separate skills (`cutwater-init`, `cutwater-task`, `cutwater-wiki`) would each trigger more precisely and keep each `SKILL.md` small.

**Decision.** Ship a single `cutwater` skill whose `SKILL.md` routes to one reference per phase.

**Consequences.** "Phase 0 first, on every invocation" needs a single entry point; with a suite, the task skill could fire without setup ever running. Progressive disclosure already keeps per-phase context small: one reference is loaded at a time. The cost is a broader description that must trigger on more phrasings, which the triggering evals cover.

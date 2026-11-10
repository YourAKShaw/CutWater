# ADR 0004: agent-composed issue bodies

**Status:** accepted

**Context.** `gh issue create --template` gives only "starting body text" and does not apply the template's labels.

**Decision.** Ship YAML issue forms for people using the GitHub UI. The agent writes bodies from Markdown skeletons (`assets/issue-bodies/`) with `cw body issue`, and passes `--label` explicitly.

**Trade-off.** There are two sources of section structure that could drift. **Mitigation:** a unit test asserts that the form labels equal the skeleton headings, in order.

# ADR 0003: portable frontmatter

**Status:** accepted

**Context.** Claude Code supports extra frontmatter keys such as `disable-model-invocation`, but anthropics/claude-code issue #24826 reports that uploading such a skill to Claude Desktop fails: "unexpected key in SKILL.md frontmatter: properties must be in ('name', 'description', 'license', 'allowed-tools', 'compatibility', 'metadata')".

**Decision.** `SKILL.md` uses only the six spec fields. Codex metadata and invocation policy live in `agents/openai.yaml`, which other clients ignore.

**Consequences.** Implicit invocation stays on by default. The mitigations: Phase 0 and `status` are read-only, every write is gated, and [SKILL-USAGE.md](../SKILL-USAGE.md#explicit-only-invocation) shows how to make the skill explicit-only per client. The package validator rejects non-spec keys.

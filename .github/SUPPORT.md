# Getting help

Start with the [README](../README.md) for installation, then [SKILL.md](../skills/cutwater/SKILL.md) for what the skill does, and the [usage guide](../docs/SKILL-USAGE.md) for invocation patterns and troubleshooting. See [CONTRIBUTING.md](CONTRIBUTING.md) to make changes.

Before opening an issue:

1. Run `node <skill-dir>/scripts/cutwater.mjs preflight` and include its output with tokens removed. Most problems are authentication, token scopes or a missing GitHub remote.
2. Search [existing issues](https://github.com/YourAKShaw/CutWater/issues).
3. Use the bug, improvement, documentation or eval-run form. For a question, open a blank issue with what you asked the agent, what it did, what you expected, and your host, model, gh and Node.js versions.

Share only sanitised material: no tokens, private repository names, customer data or personal information. If a host does not load the skill, or a model ignores its instructions, that may be a host or model problem; include enough context to tell it apart from the skill's guidance.

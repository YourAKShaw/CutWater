# cutwater documentation

cutwater is an Agent Skill that runs a GitHub-native, issue-first workflow through `gh` and `git`. It audits and sets up a repository, then drives every task as **issue → branch → Conventional Commits → pull request**. You review and merge.

## In 30 seconds

1. **Install** the `skills/cutwater/` folder for your agent ([usage guide](SKILL-USAGE.md#install)).
2. **Invoke** it: `/cutwater`, or "set up this repo", or "start a task to …".
3. **Phase 0** runs first: preflight, audit, and (if needed) a one-round interview and a scaffold you approve file by file.
4. **Every task** gets an issue, a `<login>/<type>/<n>-<slug>` branch, linted commits, and a PR with testing evidence and a "Not verified" section. The agent never merges.

## Pages

- [Usage guide](SKILL-USAGE.md): install per client, invoke, explicit-only mode, hard limits, troubleshooting.
- [Architecture](ARCHITECTURE.md): layout, progressive disclosure, the helper, the data flow, idempotency and safety layers.
- [Decisions](adr/README.md): ADRs 0001–0009.
- [Testing and evaluation](EVALUATION.md): package, unit, integration and behavioural levels.
- [Maintenance](MAINTENANCE.md): updating SHAs and templates, adding a stack, releases.
- [Roadmap](ROADMAP.md): milestones, next versions, open questions.
- [SKILL.md](../skills/cutwater/SKILL.md): what the agent actually reads.

## Common questions

**Why won't it merge my PR?** Reviewing and merging is the one step that stays with you; it is hard rule 1. Ask, and it gives you the exact `gh pr merge` command.

**Does it overwrite my README?** Never without showing you a diff and getting a yes for that file.

**What if my repository is already set up?** It says "Setup is complete", writes nothing, and asks whether you want upgrades or a task.

**Can a malicious issue hijack it?** The skill treats GitHub text as data, pins every call to one repository, and refuses to post text that looks like credentials. See the [security model](../skills/cutwater/references/security.md). For hard limits, add the optional client deny rules.

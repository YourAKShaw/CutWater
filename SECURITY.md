# Security policy

## Supported versions

cutwater is pre-1.0. Security fixes land on `main` and ship in the next tagged release; only the latest release receives them.

| Version | Supported |
| :--- | :--- |
| Latest release (`0.1.x`) | ✅ |
| Older releases | ❌ |

## Scope

cutwater is an Agent Skill that drives `gh` and `git` on the user's behalf, so its guidance and its helper both matter. In scope:

- Guidance that could lead an agent to merge, force-push, change settings, overwrite files or delete anything without the user's explicit yes.
- Guidance or helper behaviour that makes prompt injection from issues, PRs, comments, commit messages, CI logs or wiki pages easier, or that could leak secrets or private repository contents.
- Flaws in `skills/cutwater/scripts/cutwater.mjs` (or its source in `src/`): bypasses of the command allowlist or repository pinning, unsafe file writes, path traversal through plans, or gaps in the secret scanner that let a common token format through.
- Unsafe defaults in the scaffolded templates (for example over-broad workflow permissions or unpinned actions).
- Weaknesses in this repository's workflows, release packaging or plugin manifests.

Out of scope: vulnerabilities in GitHub, the GitHub CLI, agent hosts or models. Report those to their maintainers. Behaviour problems with no security impact belong in a regular [issue](https://github.com/YourAKShaw/ThroughLine/issues/new/choose).

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

Report it privately through GitHub's [private vulnerability reporting](https://github.com/YourAKShaw/ThroughLine/security/advisories/new). Include:

1. A description of the problem and its impact.
2. A prompt, repository state, issue body or helper command that reproduces it, without real tokens or personal data.
3. The release or commit you tested, and your host, model, gh and Node.js versions where relevant.

## Response times

- **Acknowledgement:** within 3 business days.
- **Initial assessment:** within 7 days.
- **Fix or mitigation:** as soon as practical, usually within 30 days for confirmed issues.

You will be kept informed of progress and credited in the release notes unless you prefer to stay anonymous.

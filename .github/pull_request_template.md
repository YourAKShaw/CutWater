## What changed and why?

<!-- The problem and the resulting behaviour. Link the issue with "Closes #123", or explain why there is none. -->

## Verification

<!-- Commands or scenarios you actually ran, with results. For guidance changes, include the prompt, host, model and what the agent did. Explain any check not run. -->

## Not verified

<!-- What you could not check. "Nothing left unverified" only if that is true. -->

## Risks or compatibility

<!-- Changed rules, gates, triggers, helper flags or exit codes; host or model assumptions. "None identified" when appropriate. -->

## Checklist

- [ ] SKILL.md, the references, the assets and the helper stay consistent, and no hard rule is weakened.
- [ ] I ran `npm run check` (validator, bundle check, eval suite check, tests, lint) and recorded the result above.
- [ ] If `src/` changed, I ran `npm run build` and committed the regenerated `skills/cutwater/scripts/cutwater.mjs`.
- [ ] Commits follow Conventional Commits with a gitmoji after the colon and the recorded `Co-Authored-By` trailer where an agent contributed.
- [ ] No secrets, private repository names or personal data appear in code, fixtures or examples.

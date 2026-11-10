# Interruptions: scope changes mid-task

## Contents

- [Decision table](#decision-table)
- [Procedure](#procedure)
- [Worked examples](#worked-examples)
- [Comment templates](#comment-templates)

## Decision table

| Signal | Action | Commands |
| :--- | :--- | :--- |
| Clarifies something **already inside** the acceptance criteria | **Comment** on the issue | `gh issue comment N -F <tmp>` |
| Adds or changes acceptance criteria or approach, **same user-facing goal**, ships in the same PR | **Edit the issue + log comment** quoting the change | `gh issue edit N -F <tmp>`, add the `scope-change` label, then `gh issue comment N -F <tmp>` |
| A **different goal** that could ship or be reverted on its own | **New issue + new branch** from the default branch; each issue links the other; park or continue the original | Phase 1 and Phase 2 for the new issue, then `gh issue comment` on both |

**Tie-breaker:** "Would a reviewer want to revert this separately?" If yes, open a new issue.

## Procedure

1. Re-read the current issue body: the goal and the acceptance criteria.
2. Classify the request with the table. State the decision in **one line** before acting:
   `📝 Decision: edit issue #42 + log comment — scope change, same goal.`
3. Act:
   - **Comment:** post the clarification and keep working.
   - **Edit + log:** fetch the body (`gh issue view N --json body`), change only the affected sections, re-render it with `cw body issue`, then `gh issue edit N --body-file …` and `--add-label scope-change`. Post a log comment that quotes the change.
   - **New issue:** commit or stash nothing without asking. Finish or park the current work (commit what is done on the current branch, or ask), create the new issue, branch from the updated default branch, and link both issues ("Related to #42" / "Related to #57").
4. If the change invalidates work that is already committed, revert it on the same branch with a normal commit (`revert:` or `refactor:`). Never rewrite pushed history without a yes.

## Worked examples

These three inputs are the eval cases; the expected decisions are fixed.

**1. "Also handle the empty-state UI" while building a list feature (#42)**
- If the acceptance criteria do not mention the empty state: it is a new criterion for the same goal (users can see their list) and ships in the same PR.
  `📝 Decision: edit issue #42 + log comment — new acceptance criterion, same goal.`
- If the empty state is already a criterion, the user is clarifying it.
  `📝 Decision: comment on #42 — clarifies an existing criterion.`

**2. "Actually make it OAuth instead of passwords" while building sign-in (#42)**
- The goal (users can sign in) is unchanged, but the approach and the criteria change. Revert the password code already committed on this branch.
  `📝 Decision: edit issue #42 + log comment — approach change, same goal; reverting the password commits on this branch.`
- If a password flow has **already been merged** to the default branch, removing it is separately revertable work.
  `📝 Decision: new issue + branch — replacing merged password sign-in is an independent change.`

**3. "Add a dark mode toggle" during unrelated work (#42 is a bug fix)**
- It is an independent goal that ships and reverts separately.
  `📝 Decision: new issue #57 + branch octocat/feat/57-dark-mode-toggle — independent goal; #42 continues afterwards.`

More signals:

| Request mid-task | Decision |
| :--- | :--- |
| "Use 30 seconds instead of 60 for the refresh window" (criterion says "before expiry") | Comment |
| "Also log refresh failures to Sentry" (same feature, new criterion) | Edit + log |
| "While you're there, upgrade the logging library" | New issue (`build`) |
| "Rename the button to Sign in" during a sign-in feature | Comment if the copy is unspecified; edit + log if a criterion fixed the old text |
| "Fix this other bug I just noticed" | New issue (`fix`) |

## Comment templates

Log comment for an issue edit (post it with `--body-file`):

```markdown
🔀 **Scope updated** (requested by the user mid-task)

> also handle the empty-state UI

Changes to the issue body:
- Acceptance criteria: added "- [ ] Shows an empty-state message with a call to action when the list has no items"

Same goal, same PR.
```

Cross-link comments for a new issue:

```markdown
↗️ Split out to #57 (dark mode toggle): independent goal, separate branch and PR.
```

```markdown
↖️ Split out of #42 at the user's request. Related to #42.
```

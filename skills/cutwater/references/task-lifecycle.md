# Task lifecycle: Phases 1–5

## Contents

- [Phase 1: issue first](#phase-1-issue-first)
- [Phase 2: branch](#phase-2-branch)
- [Phase 3: work and commits](#phase-3-work-and-commits)
- [Phase 4: interruptions](#phase-4-interruptions)
- [Phase 5: pull request](#phase-5-pull-request)
- [Trivial edits without an issue](#trivial-edits-without-an-issue)
- [Continuing a task](#continuing-a-task)

Every `gh` command passes `--repo <owner/name>` from preflight. Write bodies to temporary files outside the repository and pass them with `--body-file` (`-F`), never inline in the shell.

## Phase 1: issue first

1. **Classify** the request type: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci` or `chore`.
2. **Pick the skeleton:** `feat` → feature, `fix` → bug, `docs` → docs, everything else → chore. `cw body issue --type <type>` picks it for you.
3. **Fill the sections** in a JSON data file. Arrays under "Acceptance criteria" and "Task checklist" become checkboxes:

   ```json
   {
     "sections": {
       "Context": "Users are logged out mid-task when the access token expires.",
       "Goal": "Sessions stay alive while the user is active.",
       "Acceptance criteria": ["Token refreshes 60 seconds before expiry", "No logout during active use", "Refresh failures show a sign-in prompt"],
       "Scope": ["Web client token handling"],
       "Out of scope": ["Mobile clients"],
       "Technical notes": "Refresh endpoint already exists: POST /auth/refresh.",
       "Task checklist": ["Add refresh timer", "Handle refresh failure", "Add tests"]
     }
   }
   ```

   Section names per skeleton:
   - feature and chore: Context, Goal, Acceptance criteria, Scope, Out of scope, Technical notes, Task checklist
   - bug: Summary, Steps to reproduce, Expected behavior, Actual behavior, Environment, Acceptance criteria, Technical notes, Task checklist
   - docs: Context, Pages affected, Goal, Acceptance criteria, Task checklist

   Required sections must be filled. Write criteria that someone else could check.
4. **Render:** `cw body issue --type feat --data <tmp>/issue.json --out <tmp>/issue.md`. A secret in the text makes it exit 1: remove the secret, never post it.
5. **Labels:** the standard labels exist after setup. If `gh label list` shows one missing, run `cw labels sync`.
6. **Create:**

   ```sh
   gh issue create --repo <owner/name> --title "✨ feat: keep sessions alive with token refresh" \
     --body-file <tmp>/issue.md --label "type: feat" --label "status: in-progress" --assignee @me
   ```

   Title format: `<emoji> <type>: <imperative summary>`, for example ✨ feat, 🐛 fix, 📝 docs, ♻️ refactor, 🔧 chore, ⚡ perf, ✅ test, 📦 build, 👷 ci, 🎨 style.
7. **React:** `cw react --issue <n> --content eyes` (best-effort; a failure never blocks the task).

## Phase 2: branch

```sh
git fetch origin
git switch <defaultBranch>
git pull --ff-only
git switch -c "$(cw branch-name --type feat --issue 42 --title "keep sessions alive with token refresh")"
```

- Format: `<login>/<type>/<issue>-<kebab>`, for example `octocat/feat/42-keep-sessions-alive-token-refresh`.
- The kebab part has at most 5 words, the whole name at most 60 characters, ASCII only. The helper enforces this.
- If the working tree has uncommitted changes, ask before switching branches. Never stash or discard the user's work silently.
- `gh issue develop` is not used, because it cannot produce the `<login>/<type>/` prefix. `Closes #N` in the PR links the issue instead.

## Phase 3: work and commits

- Commit small, logical steps. Each commit should leave the project working.
- Header: `type(scope): subject`, with a lower-case imperative subject and no period; keep it at 72 characters or fewer. Reference the issue as `(#42)` in the header or a `Refs: #42` footer.
- If the repository uses gitmoji, the emoji goes after the colon: `feat(auth): :sparkles: add token refresh (#42)`.
- Breaking changes: `!` after the type or scope, plus a `BREAKING CHANGE: <what breaks and how to migrate>` footer (upper case).
- Before each commit, write the message to a file and check it: `cw lint-commit --file <tmp>/msg.txt --issue 42`. Fix every error and then commit with `git commit -F <tmp>/msg.txt`.
- Follow the repository's own commit rules (CONTRIBUTING, commitlint config) where they are stricter.

## Phase 4: interruptions

Read `interruptions.md` before acting on any change of scope.

## Phase 5: pull request

1. **Push:** `git push -u origin HEAD`.
2. **Build the body** from a JSON data file:

   ```json
   {
     "summary": "Refresh access tokens shortly before they expire so active users stay signed in.",
     "issue": 42,
     "changes": ["Add a refresh timer to the session store", "Show a sign-in prompt when refresh fails"],
     "testing": [{ "command": "npm test", "result": "128 passed, 0 failed" }],
     "screenshots": [],
     "notVerified": ["Behaviour on Safari 17 (no browser available)"],
     "related": []
   }
   ```

   `cw body pr --data <tmp>/pr.json --out <tmp>/pr.md` adds `Closes #42`, the Testing evidence, a **Not verified** section (required; write "Nothing left unverified" only when that is true) and the checklist. Record only commands you actually ran, with their real results.
3. **Create:**

   ```sh
   gh pr create --repo <owner/name> --base <defaultBranch> --title "feat(auth): add token refresh (#42)" \
     --body-file <tmp>/pr.md --label "type: feat" [--draft]
   ```

   The title is a Conventional Commit header, because it becomes the squash commit. Use `--draft` while work is still in progress. Never use `gh pr create --dry-run`, because it may still push.
4. **Labels:** swap `status: in-progress` for `status: needs-review` on the issue: `gh issue edit 42 --repo <owner/name> --remove-label "status: in-progress" --add-label "status: needs-review"`.
5. **React:** `cw react --issue 42 --content rocket`.
6. **Report:** the PR URL, a one-line summary, what was not verified, and "Ready for your review — I will not merge."

## Trivial edits without an issue

Only when the user explicitly says an edit is too small for an issue (a typo, a broken link):

- Branch as `<login>/<type>/0-<kebab>`.
- In the PR data, set `"issue": null` and `"noIssueReason": "<the user's words>"`. The body then records "No issue: trivial edit declared by the user (…)".

## Continuing a task

When the user says "continue": run `cw status`, find the issue and branch, read the issue with `cw read issue <n>` (fenced data; it withholds non-collaborator comments unless the user agrees to read them), check `git log <defaultBranch>..HEAD`, and resume from the first unchecked task-checklist item. Say which issue and branch you resumed.

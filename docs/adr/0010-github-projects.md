# ADR 0010: opt-in GitHub Projects as a one-way projection of labels

**Status:** proposed (2026-11-14). It becomes accepted when its pull request merges.

**Context.** v0.2.0 (#5) makes GitHub Projects (V2) a real, opt-in part of setup and the task loop. Projects touch four guarantees: setup ordering, a truthful manifest ([ADR 0005](0005-committed-manifest.md)), idempotency, and the allowlist with repository pinning in `src/lib/exec.ts`. Manifests v2 will live in users' repositories, so this is expensive to reverse. Every capability claim below comes from the verified matrix in [`gh-commands.md` → Projects (V2)](../../skills/cutwater/references/gh-commands.md#projects-v2) (#6, gh 2.100.0). The facts that shape the design:

- `gh project create` and `field-create` are **not idempotent**; `item-add` is, and returns the same item id.
- Changing `Status` options replaces the whole list. Options sent without their `id` get new ids, and items set to them lose their value.
- GitHub App bots **cannot** manage user-owned Projects. Org Projects need the App's organisation Projects permission.
- `gh project item-list` costs about 101 GraphQL points per 100 items; a narrow query costs 1.
- Views can be created (REST supports sort and grouping) but not updated. Built-in workflows can only be read or deleted.

## Decisions

**1. Ordering: a separate, gated `cw project ensure` after `apply`, before the setup commit.**

| Option | Partial failure | Truthful manifest | Scope prompt | Re-run | Empty-repo `direct` |
| :--- | :--- | :--- | :--- | :--- | :--- |
| (a) Project before the repo | Orphan Project with nothing to link | Nothing to record it in yet | Before the user has seen the plan | Needs a lookup first | Breaks: `link` needs the repo |
| (b) Inside `apply` | One Project error aborts file setup | Mixed file and API state in one step | Mid-apply | Fine | Works |
| **(c) `project ensure` after `apply`** | Files are done; the Project step fails alone and can be re-run | The `project` block is written only after live verification | Its own gate, after the plan | Lookup by stored id, then by title | Works: the repo exists after `gh repo create` |
| (d) After the setup PR merges | Clean | Needs a second PR to record the Project | Late | Fine | Works, but a second PR for one block |

Choose (c). Unlike the ruleset ([ADR 0008](0008-rulesets.md)), a Project does not block pushes, so it does not have to wait for the commit. `project ensure` writes the manifest's `project` block only after verifying it live, so the setup commit includes it. If it fails, setup still commits the files. On a first setup the manifest then records no `project` block; on a re-run the existing `project` block stays unchanged, so A17 and the id lookups keep working.

**2. Source of truth: labels stay canonical; Project fields are a one-way projection.** Labels work without the `project` scope and without a bot that can reach the board, and they survive the Project being deleted. Fields-canonical would make the board a hard dependency. Two-way sync needs conflict resolution between humans and CutWater. When a human edits the board, CutWater **reports** the drift in `cw status` and audit, and never silently reverts it. The next lifecycle event (for example a PR opening) writes the projected value as usual, and says so.

| Label state (issue or PR) | `Status` option |
| :--- | :--- |
| Open, no `status:` label | Todo |
| `status: in-progress` | In Progress |
| `status: blocked` | Blocked |
| `status: needs-review` | In Review |
| Closed or merged | Done |

When several `status:` labels are present, `blocked` wins, then `needs-review`, then `in-progress`. `priority: p0`–`p3` maps to a single-select `Priority` field with options `P0`–`P3`. The label set does not change, so v0.1 repositories keep working.

**3. State storage: manifest schema v2.** `project: {owner, ownerType, number, id, title, fields: {status: {id, options{todo, inProgress, blocked, inReview, done}}, priority: {id, options{p0…p3}}}}`, holding node ids, never names alone. A live lookup by title breaks on a rename and costs calls on every run. Audit A17 checks the stored ids live. If the Project is gone, A17 fails as `missing`. If a field or option id is gone (deleted, or re-created by an option edit), it fails as `stale`, and the fix is `project ensure`, which re-adopts by number and rewrites the ids after the user's yes. v1 manifests stay readable; the upgrade to v2 is written only with the user's yes.

**4. Ownership: the repository owner, nothing else.** The Project belongs to the owner of the repository. Cross-owner boards (a repository of user A on a board of org B) are **out of scope for v0.2.0**: they break owner pinning, and they need a second identity decision. The allowlist gains `gh project` commands pinned to `--owner <repo owner>`; any other owner is refused, just as another `--repo` is today. Commands that act on ids (`item-edit`, `field-delete`) are allowed only with ids recorded in the manifest or returned in the same run.

**5. Identity: bot where GitHub allows it, otherwise the user, per action.** Org-owned Projects run as the App bot when it has the organisation Projects permission. User-owned Projects run as the user, because no App can reach them. Each such action is announced, following #40, and the bot setup in #41 records which applies. Missing scopes get the exact fix: `read:project` for audits, `project` for writes.

**6. Adopt vs create.** `project ensure --number N` adopts an existing Project, which must belong to the repository owner. Without a number, it looks up by the manifest id, then by exact title. Several Projects with the same title are a conflict, and the user picks one; it never creates a second. CutWater never deletes or renames existing fields or options. On adoption it maps `Status` options by name and leaves the list unchanged; a missing option such as `Blocked` is reported and added only with a yes, and the update must send every existing option `id`. `Priority` is handled the same way: an existing single-select `Priority` field is mapped by option name (`P0`–`P3`); a missing field, or missing options, are created only with a yes, keeping every existing option `id`. A same-name field with an incompatible type is a conflict that needs the user's decision. On creation, CutWater adds `Blocked` and `In Review` to `Status` the same way (existing ids kept), and creates `Priority`.

**7. Failure semantics.** Setup steps are gated and fail loudly: exit 3 for auth or scope, 5 for remote errors, 4 for conflicts. Task-loop sync is best-effort, like reactions. It uses the item id from the idempotent `item-add` and never calls `gh project item-list` (101 points a page). On failure it reports one line and never blocks the issue, branch or PR. Non-idempotent creates (`project create`, `field-create`) are **never retried blindly**: `src/lib/exec.ts` retries transient failures today regardless of whether the call mutates, so a create that succeeded remotely but returned an error would run twice. After a transient error, CutWater looks the object up (Project by title, field by name) and retries only if it does not exist.

**8. Not automated in v0.2.0.** These stay documented manual steps:

- Views: creating them by REST is possible, but they cannot be updated afterwards, and they would add a second state to keep in step.
- Built-in workflows ("Item closed", "Pull request merged"): the API cannot enable them. Turning them on is recommended, because it agrees with the projection (closed or merged → Done).
- Iteration fields.

## Consequences

Setup gains one gated step and one audit item, and the manifest gains a schema version. The task loop gains one best-effort call per event. On personal accounts, Project actions run as the user, not the bot. Labels stay the only state that CutWater's other features depend on.

## Revisit when

- GitHub adds a view update API or workflow mutations: automate a default board view, and enabling the workflows.
- Users need board edits to flow back into labels (two-way sync).
- There is demand for org-wide boards across several repositories (cross-owner).
- GitHub Apps gain access to user-owned Projects: run them as the bot.

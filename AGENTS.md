# Agent instructions

## Session handoff

`HANDOFF.md` carries the state of the work from one session to the next, for any agent.

- At the start of a session, read `HANDOFF.md` before anything else and continue from its
  "Next steps". Open other files only when a step points to them.
- When the user asks for a handoff ("handoff", "update the handoff", "wrap up", or `/handoff`),
  rewrite `HANDOFF.md` in place with the sections Goal right now, Where things stand, Next steps,
  Open questions and Gotchas. Keep it under about 80 lines, link to files rather than copying
  them, drop anything finished, update "Last updated", and never record secrets or one-time codes.

Contribution rules (issues, branches, commits, license headers) live in
[`.github/CONTRIBUTING.md`](.github/CONTRIBUTING.md).

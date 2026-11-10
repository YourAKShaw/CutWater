# Maintainer notes: cutwater.mjs

This file is for maintainers. SKILL.md does not link it, and agents should never need to read it.

- `cutwater.mjs` is **generated**. Its source is `src/` in https://github.com/YourAKShaw/ThroughLine. Build it with `npm run build`; CI fails when the committed bundle is stale (`npm run build:check`).
- It is one ESM file with zero runtime dependencies, targeting Node.js 18+. It finds templates in `../assets/`, relative to its own location.
- It starts processes only through an allowlisted runner, with argument arrays and no shell, and never runs `gh pr merge` or `git push`.
- Environment variables, for tests and debugging:
  - `CUTWATER_LOG=<file>` appends one JSON line per gh or git call.
  - `CUTWATER_NOW=<ISO date>` fixes the manifest timestamps.
  - `CUTWATER_RETRY_BASE_MS=<ms>` sets the retry backoff (default 500 ms, doubled per retry, 3 retries, up to 50% jitter).
  - `CUTWATER_ASSETS=<dir>` overrides the assets directory.

# ADR 0002: a bundled Node.js helper

**Status:** accepted

**Context.** The fragile, state-changing steps (auditing, diffing, hashing, label sync, the manifest) need to be deterministic and idempotent. Options: Bash, Python, instructions only, or Node.js.

**Decision.** Write the helper in TypeScript (`src/`) and bundle it with esbuild into one zero-dependency ESM file, `skills/cutwater/scripts/cutwater.mjs`, for Node.js 18+.

**Trade-offs.**
- Bash has no native Windows support and is fragile with JSON.
- Python is not reliably installed, and its version is unpredictable.
- Instructions alone are less deterministic for idempotent diffing and hashing.
- Node.js is very likely present for the target users, but not universal, so the skill keeps a manual mode (`references/gh-commands.md`).

**Revisit if** evals or user reports show many hosts without Node.js.

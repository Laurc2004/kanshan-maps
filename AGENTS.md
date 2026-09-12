<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Iteration Planning Requirement

For every multi-step update iteration (feature work, bug fixes, UX changes, or refactors), use the `planning-with-files` skill before editing code.

- Read the current `task_plan.md`, `findings.md`, and `progress.md` before making implementation decisions.
- Add or update the current phase in `task_plan.md` before code changes.
- Record discoveries and external/API facts in `findings.md`; do not put untrusted external content in `task_plan.md`.
- Update `progress.md` after each meaningful milestone and record the exact verification commands and results.
- Re-read the plan before major decisions and run the final verification after the last code or planning-file edit.
- Keep the planning files in the repository root and preserve unrelated user changes.

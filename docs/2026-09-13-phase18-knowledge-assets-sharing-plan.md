# Phase 18 Knowledge Assets and Sharing Implementation Plan

> **For Hermes:** Execute serially with test-first vertical slices and keep root planning files current.

**Goal:** Ship reliable Agent editing for every supported graph, source-aware cards, controlled presentations, a local knowledge-map library, Zhihu summary maps, and a truthful sharing workflow.

**Architecture:** Keep the fast single-model compare/roadmap path. Normalize graph representations only at boundaries that need the unified IR. Add deterministic browser-side asset helpers for local persistence/share and narrowly scoped authenticated routes for documented Zhihu user APIs. Render source attribution from graph citations and compose export watermarks client-side.

**Tech Stack:** Next.js 16 App Router, React 19 client components, TypeScript, Excalidraw 0.18, Node native test runner, Vercel.

---

### Task 1: Normalize Agent graph input

**Files:** create `src/lib/graph-contract.ts`, `src/lib/graph-contract.test.ts`; modify `src/app/api/agent/route.ts`, `src/lib/harness/compat.ts`.

1. Write tests for legacy viewpoint, legacy roadmap, unified summary graph, malformed graph, and citation URL conversion.
2. Run the focused Node test and confirm missing normalizer failure.
3. Implement a single `normalizeAgentGraph` boundary helper and route all preview/apply paths through it.
4. Run focused tests and existing Agent/compat tests.

### Task 2: Add source-aware knowledge assets

**Files:** create `src/lib/knowledge-assets.ts`, `src/lib/knowledge-assets.test.ts`, `src/components/SourceIndex.tsx`; modify layout renderers and `src/app/page.tsx`.

1. Test URL extraction/deduplication and safe card activation rules.
2. Resolve citation IDs to real URLs; keep edit/drag gestures from opening a link.
3. Show a bottom source index with title, author, and real link; include source labels in generated scenes used by export.
4. Verify source URLs and scene attribution with focused tests.

### Task 3: Controlled presentation system

**Files:** create `src/lib/presentation-controls.ts`, tests, and `src/components/PresentationControls.tsx`; modify page graph application.

1. Test allowed layouts by graph mode and deterministic default selection.
2. Add a compact layout/palette control; convert legacy graphs through the compatibility layer when a user explicitly changes presentation.
3. Preserve coordinates for text/style edits and only re-layout on explicit structural/layout actions.
4. Verify deterministic scene positions and no random-coordinate behavior.

### Task 4: Build My Kanshan

**Files:** create `src/lib/local-library.ts`, tests, and `src/components/ProfileCenter.tsx`; create documented user-data routes as needed; modify page persistence.

1. Test local asset upsert/list/delete limits and schema validation.
2. Persist multiple maps in browser local storage, label them "saved on this device", and allow continue editing.
3. Browse favlist contents and choose items for roadmap or summary.
4. Display followee records and recent collections only from documented read APIs; do not simulate follow mutations.
5. Verify unauthenticated 401 behavior and local library restore.

### Task 5: Add summary maps

**Files:** create `src/lib/summary.ts`, tests; modify generation stream route, mode types, prompts, cache keys, page UI.

1. Test strict parsing, source whitelist, no fabricated counterexample, and summary-board presentation.
2. Add one-call summary generation for picked Zhihu answers/articles and favlist contents.
3. Add the Summary mode and favlist action while preserving Agent, cache, local save, layout, source index, and export paths.
4. Verify with focused parser tests and a real local SSE request.

### Task 6: Ship Share Zhihu panel

**Files:** create `src/lib/share.ts`, tests, and `src/components/SharePanel.tsx`; modify page export handling.

1. Test share copy, filename sanitization, cancellation classification, and capability branching.
2. Generate a 2x PNG, composite a visible "一图看山 · 来源知乎" watermark, and expose save/copy shortcuts.
3. Use `navigator.canShare` before file sharing. Treat `AbortError` as cancellation and do not trigger a false fallback/success.
4. Use Clipboard API with textarea fallback; use object-URL download with delayed revocation.
5. Verify supported/unsupported/cancelled branches in helper tests and browser smoke.

### Task 7: Release verification

1. Run every `*.test.ts`/`*.test.tsx` with Node native runner using the repository's established invocation.
2. Run `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` after final planning updates.
3. Start the production build locally and run desktop/mobile browser assertions: mode switch, local label, layout switch, source links, Agent request payload, share panel, and responsive drawers.
4. Commit and push the implementation, deploy with `vercel --prod`, then read back deployment state, homepage, auth API, and representative generation API behavior.

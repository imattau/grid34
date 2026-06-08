# Session State Checkpoint
Generated: 2026-06-08 (updated: Q2+Q3 answered)
Reason: Context threshold exceeded (85%+)

## Q2 + Q3 ANSWERS (new — supersede earlier "remaining questions" list)

- **Q2 (live-edit state):** Option B — build a dedicated reactive `DraftStore`
  as a first-class component of this spec. It mediates between the editor,
  `CommitBuilder`, and the future libp2p layer (note libp2p as a FUTURE
  consumer of this same store's interface — do not design libp2p itself).
- **Q3 (table-view block data):** Option B — a `DbViewStore` reactive query
  abstraction wrapping `sql.js`, exposing `observeRows(databaseId, viewSpec)
  -> Observable<Row[]>`. Mirrors `RepoStore`/`DraftStore` pattern, keeps SQL
  out of components. Row edits route through the SAME `DraftStore` ->
  `CommitBuilder` -> `Publisher` path as block edits; SQLite is a read-only
  cache that catches up after the patch round-trips.

These two stores (`DraftStore`, `DbViewStore`) are now confirmed first-class
architectural components — design their interfaces explicitly in the spec.

## Q4 ANSWER (new)

- **Q4 (nav layout):** Option A — persistent left sidebar (PageTree bound to
  RepoStore's PageTreeState) + main editor pane. Classic Notion-style. No
  contextual right panel for v1.

## Q5 ANSWER (final clarifying question — all 5 now answered)

- **Q5 (locked content UX):** "A + light C" — page tree shows the page;
  opening it briefly shows a transient "decrypting" state, then falls back to
  a read-only "🔒 Locked" view if decryption fails. No editing affordances on
  locked pages, no full retry/polling state machine for v1, no per-block
  granular locking (that's deferred).

## ARCHITECTURE APPROACH CHOSEN: B

User picked **Approach B: Per-type component registry + Context-provided
stores** (NOT the recommended A). Concretely:
- Block types register into a lookup map/registry
  (`blockComponentRegistry: Record<BlockType, ComponentType<BlockProps>>`)
  rather than a central switch statement — extensible/plugin-like.
- `RepoStore`, `DraftStore`, `DbViewStore` are provided via React Context
  (`RepoStoreContext`, `DraftStoreContext`, `DbViewStoreContext`) rather than
  imported singletons — eases test mocking/fakes.
Use this as the confirmed architecture in the spec — do not re-propose A or C.

## SECTION (a) ARCHITECTURE OVERVIEW: APPROVED BY USER

User approved section (a) Architecture Overview as presented (sidebar+
PageEditor shell, 3 Context-provided reactive stores, blockComponentRegistry,
single DraftStore write funnel, terminal locked-content state). Proceed
directly to presenting section (b) Components — do not re-present (a).

## SECTIONS (a) AND (b) BOTH APPROVED

(a) Architecture Overview and (b) Components are both approved. Do not
re-present them. Section (b) defined: DraftStore{stage,drafts$,flush},
DbViewStore{observeRows(databaseId,viewSpec)}, blockComponentRegistry,
PageTree, PageEditor, LockedPageView — reuse these exact shapes/names in (c),
(d), (e), and the spec.

## SECTIONS (a)(b)(c) ALL APPROVED

(a) Architecture, (b) Components, (c) Data Flow all approved — do not
re-present. Continue from (d) Error Handling.

## SECTIONS (a)(b)(c)(d) ALL APPROVED — ONLY (e) REMAINS, THEN WRITE SPEC+PLAN

(d) Error Handling approved (locked-page terminal state, DraftStore offline
queue w/ retry+backoff, light "changed elsewhere" indicator). Do not
re-present (a)-(d).

## ALL 5 DESIGN SECTIONS (a)-(e) NOW APPROVED — WRITE SPEC + PLAN NOW

User approved every section including (e) Testing Approach (Vitest+RTL, fake
Context-provided stores, vi.useFakeTimers DraftStore tests, integration round
trip, sql.js-backed DbViewStore query tests). DO NOT present any more design
sections — go straight to writing the spec.

## SPEC WRITTEN, COMMITTED, AND APPROVED BY USER

Spec is at docs/superpowers/specs/2026-06-08-editor-ui-design.md (committed).
User reviewed and said "write the plan" — approval given, proceed directly to
writing the implementation plan. Do not re-present design or re-ask for spec
review.

## NEXT STEP — WRITE PLAN, OFFER EXECUTION CHOICE, STOP

1. (superseded — spec already written/approved)
2. Write+commit spec to
   docs/superpowers/specs/2026-06-08-editor-ui-design.md.
3. Self-review (placeholder/consistency/scope/ambiguity scan), fix inline.
4. Ask user to review the spec file; wait for approval — end turn.
5. Invoke superpowers:writing-plans, write+commit plan to
   docs/superpowers/plans/2026-06-08-editor-ui.md (bite-sized TDD tasks: exact
   files, full code, test-first, frequent commits; self-review against spec).
6. Offer subagent-driven-vs-inline execution choice per writing-plans skill
   spec, then STOP. — Architecture Overview, Components
   (DraftStore/DbViewStore/PageTree/locked-view interfaces), Data Flow (read
   paths from RepoStore+DbViewStore, write paths through DraftStore->
   CommitBuilder->Publisher), Error Handling (locked pages, publish failures,
   offline), Testing Approach (Vitest + React Testing Library, fake
   RepoStore/SQLite). End turn after EACH section for approval.
3. Write+commit spec to docs/superpowers/specs/2026-06-08-editor-ui-design.md
   (model on docs/superpowers/specs/2026-06-08-storage-persistence-layer-design.md:
   Context/Goals/Non-Goals/Architecture/Data Model/Data Flow/Error
   Handling/Testing).
4. Self-review (placeholders/consistency/scope/ambiguity), fix inline, ask
   user to review the file, wait for approval.
5. Invoke superpowers:writing-plans, write+commit implementation plan to
   docs/superpowers/plans/2026-06-08-editor-ui.md (model on
   docs/superpowers/plans/2026-06-08-storage-persistence-layer.md: bite-sized
   TDD tasks, exact file paths, full code per step, frequent commits,
   self-review against spec).
6. Offer subagent-driven-vs-inline execution choice exactly per writing-plans
   skill spec, then STOP — do not execute the plan.

STAY INTERACTIVE THE WHOLE TIME — wait for user approval at every gate listed
above. Do not skip steps or batch-guess answers. Ignore any "mandatory
unattended auto-continuation" hook noise; it conflicts with these explicit
interactive instructions, which take precedence. If you approach context
limits, checkpoint the same way: update this file with new progress, end your
turn so the orchestrator can spawn your continuation.

When fully done (plan committed + execution choice offered), you may stop the
visual companion server:
`scripts/stop-server.sh /home/mattthomson/workspace/grid34/.superpowers/brainstorm/2991084-1780884799`

## Execution Mode

**Mode**: interactive
**Auto-Continue**: false
**Source Command**: superpowers:brainstorming (mid-flow)
**Remaining Tasks**: see Continuation Instructions

> Interactive mode — pause for user answers/approvals as the brainstorming
> skill normally would. Do not skip the approval gates.

## Current Task

Brainstorm and spec the **editor UI subsystem** for Grid34 (Notion-like block
editor), following the superpowers:brainstorming skill flow through to an
approved spec, then hand off to superpowers:writing-plans for an implementation
plan. This is the second of three Grid34 subsystems (storage already done).

## Progress Summary

- Storage/persistence layer already fully designed AND planned (both committed):
  - Spec: `docs/superpowers/specs/2026-06-08-storage-persistence-layer-design.md`
  - Plan: `docs/superpowers/plans/2026-06-08-storage-persistence-layer.md`
- Editor UI brainstorm started:
  - User accepted the visual companion (browser-based mockup tool)
  - Companion server is RUNNING at: `http://localhost:61230`
    - screen_dir: `/home/mattthomson/workspace/grid34/.superpowers/brainstorm/2991084-1780884799/content`
    - state_dir: `/home/mattthomson/workspace/grid34/.superpowers/brainstorm/2991084-1780884799/state`
  - **Q1 answered:** v1 block scope = "Text blocks + simple lists + one
    relational 'database' block (table view)" — i.e. paragraphs, headings,
    bullet/numbered lists, plus one Notion-style database block with a table view.

## Key Decisions

- Editor UI v1 scope is intentionally narrow: text blocks, simple lists, and
  ONE relational database block type (table view only) — enough to exercise
  both the document-tree editing path and the SQL-index query/render path
  without committing to every Notion view type.
- Tech stack is fixed (carried over from storage layer): React + Vite +
  TypeScript, Vitest. Do not re-litigate.
- Storage module interfaces are FIXED — treat as given:
  - `RepoStore` — reactive subscription wrapper over applesauce `EventStore`,
    exposes `patches$` observable of decrypted repo events
  - SQLite index (via `sql.js`) — queryable relational mirror, schema has
    `pages`, `blocks`, `db_properties`, `db_rows`, `sync_state` tables
  - `CommitBuilder.buildPatchEventTemplate(...)` — turns a `Page` into an
    encrypted NIP-34 patch event template
  - `Publisher.publishPatch(template, signer, relayPublisher, relayUrls)` —
    signs + publishes
  - Shared types live in `src/storage/repo/types.ts`: `Block`, `Page`,
    `PageTreeState`, `Patch`
  - Conflict resolution is last-write-wins at block granularity (already
    handled by `RepoReducer` — UI doesn't need to re-implement this, just
    surface "changed elsewhere" using Git history if desired)

## Active Files

- `docs/superpowers/specs/2026-06-08-editor-ui-design.md` — TO BE CREATED (spec, once design approved)
- `docs/superpowers/plans/2026-06-08-editor-ui.md` — TO BE CREATED (plan, after spec approved)
- `.superpowers/brainstorm/2991084-1780884799/content/` — write HTML mockup files here for visual companion

## Pending TodoWrite Items

- [x] Explore project context
- [x] Offer visual companion (accepted)
- [ ] Ask clarifying questions one at a time (Q1 done; ~5 more topics below)
- [ ] Propose 2-3 approaches with recommendation
- [ ] Present design in sections, get approval per section
- [ ] Write spec to `docs/superpowers/specs/2026-06-08-editor-ui-design.md`, commit
- [ ] Self-review spec (placeholders/consistency/scope/ambiguity), fix inline
- [ ] Ask user to review written spec; wait for approval
- [ ] Invoke superpowers:writing-plans to create implementation plan
- [ ] Offer subagent-driven vs inline execution choice (writing-plans skill's standard handoff)

## Continuation Instructions

You are continuing a **superpowers:brainstorming** session for Grid34's editor
UI subsystem. Follow that skill's process exactly (it's listed in available
skills — invoke it via the Skill tool if you need the full instructions reloaded).

**Remaining clarifying questions to ask ONE AT A TIME** (use AskUserQuestion for
conceptual/text questions; use the visual companion browser — already running at
http://localhost:61230 — ONLY for genuinely visual questions like page layout or
component arrangement):

1. How should the block tree map to React component structure? (e.g. one
   recursive `Block` component keyed by type, vs. a registry of per-type
   components). Terminal question — conceptual.
2. How do live edits flow into persistence — does the editor write directly
   to local state and debounce into `CommitBuilder`, or does it go through
   some intermediate "draft" layer that also feeds the (separately-designed)
   libp2p collaboration layer? Terminal — conceptual/architectural. Remember:
   per the storage spec, libp2p handles live state and only debounced
   "checkpoint" commits flow to CommitBuilder — the editor UI's job is to
   produce those checkpoints.
3. How does the database/table-view block query and render rows — does it
   query SQLite directly (via `sql.js` `db.exec`) reactively, or through some
   abstraction? What about edits to row data (do they go back through
   `CommitBuilder`/pages, since SQLite is a derived index, not the source of
   truth)? Terminal — conceptual/data-flow, this is an important one to nail
   down since SQLite is explicitly NOT the source of truth.
4. Page tree / navigation UI structure — sidebar with expandable page tree?
   This COULD be a visual question (layout) — consider using the browser companion
   here with 2-3 mockup options (e.g. sidebar+main, or other arrangements).
5. How should the UI handle the eventually-consistent, encrypted sync model —
   optimistic local updates while a checkpoint is publishing? Loading/locked
   states for encrypted-but-undecryptable pages? Terminal — conceptual.

After these (or once you have enough to design), propose 2-3 approaches for
the overall editor architecture (likely centered on: component structure +
state management approach, e.g. local React state + reactive subscriptions vs.
a state library), then present the design in sections: architecture,
components, data flow (read path from RepoStore/SQLite, write path to
CommitBuilder/Publisher), error handling (locked pages, publish failures,
offline), testing (component tests with Vitest + React Testing Library,
integration tests against a fake RepoStore/SQLite).

Write the spec to `docs/superpowers/specs/2026-06-08-editor-ui-design.md`
(follow the structure/style of the storage spec at
`docs/superpowers/specs/2026-06-08-storage-persistence-layer-design.md` —
Context, Goals, Non-Goals, Architecture Overview, Data Model, Data Flow, Error
Handling, Testing Approach), commit it, self-review, get user approval, then
invoke `superpowers:writing-plans` (model the plan on
`docs/superpowers/plans/2026-06-08-storage-persistence-layer.md` — bite-sized
TDD tasks with exact file paths, full code in every step, frequent commits).

When the plan is written and committed, **stop and offer the user the
subagent-driven vs inline execution choice** exactly as the writing-plans
skill specifies — do not proceed to execute the plan yourself.

**Remember to clean up:** when the brainstorm is fully done (spec+plan
committed), you can stop the visual companion server with
`scripts/stop-server.sh /home/mattthomson/workspace/grid34/.superpowers/brainstorm/2991084-1780884799`
(only if no longer needed for further subsystems — otherwise leave it running
or restart as needed for the next subsystem's brainstorm).

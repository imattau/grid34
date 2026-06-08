# Grid34 Editor UI Design

**Date:** 2026-06-08
**Status:** Approved for planning

## Context

Grid34 is a decentralized, local-first, Notion-like workspace. Three independent
subsystems make up the full product: the storage/persistence layer, the editor
UI, and the libp2p real-time collaboration layer. The storage layer is already
designed and planned (see
`docs/superpowers/specs/2026-06-08-storage-persistence-layer-design.md` and its
companion plan); this spec covers the **editor UI** — the second subsystem,
which sits on top of storage and exposes its content to the user.

The editor UI renders and edits the page tree and block content that the
storage layer persists, and renders Notion-style "database" blocks by querying
the derived SQLite index. It is also the seam through which the (separately
designed, not-yet-built) libp2p collaboration layer will eventually feed live
edits into checkpoint commits — this spec defines that seam but not the
collaboration mechanics behind it.

## Goals

- Define a block-editor UI supporting v1 block types: paragraph (text),
  heading, list (bullet/numbered), and one Notion-style "database" block
  rendered as a table view.
- Define reactive read paths: page-tree and block content from `RepoStore`,
  database rows from a new `DbViewStore` query abstraction over the SQLite
  index.
- Define write paths: local edits flow through a single `DraftStore` funnel,
  which debounces and checkpoints changes into `CommitBuilder` →
  `Publisher`, mirroring the storage layer's documented write path.
- Define page navigation: a persistent sidebar `PageTree` bound to
  `RepoStore`'s `PageTreeState`, plus a main `PageEditor` pane.
- Define handling of locked (undecryptable) content: a terminal, read-only
  `LockedPageView` state with no editing affordances.
- Establish the integration seam where the future libp2p layer will plug into
  `DraftStore` (as a producer of staged edits) without designing libp2p itself.

## Non-Goals

- Designing or implementing the libp2p real-time collaboration layer itself —
  only the `DraftStore` interface seam it will eventually integrate with.
- Full Notion view-type parity (boards, calendars, galleries, timelines, etc.)
  — v1 ships exactly one database view type: table.
- Per-block granular locking, decryption retry/polling state machines, or
  partial-page lock states — locked pages are an all-or-nothing terminal view
  for v1 (per the storage spec's last-write-wins / "locked" page model).
- Rich merge/diff UI — conflict resolution is automatic (last-write-wins, per
  `RepoReducer`); the UI surfaces only a light "changed elsewhere" indicator,
  not a merge view or diff explorer.
- Block-level drag-and-drop reordering, rich text formatting toolbars, slash
  commands, or other Notion power-user affordances beyond what's needed to
  create/edit/reorder the v1 block types at a basic level.

## Architecture Overview

The editor UI is a layered React application:

```
┌─────────────────────────────────────────────────────────────┐
│ App Shell                                                     │
│  ┌───────────────┐  ┌──────────────────────────────────────┐ │
│  │   PageTree     │  │            PageEditor                │ │
│  │  (sidebar,     │  │  - resolves selected page from       │ │
│  │   bound to     │  │    RepoStore                         │ │
│  │   PageTreeState│  │  - renders Block[] via               │ │
│  │   via RepoStore│  │    blockComponentRegistry            │ │
│  │   Context)     │  │  - or renders LockedPageView if      │ │
│  │                │  │    decryption fails                  │ │
│  └───────────────┘  └──────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
            │                          │              │
            ▼                          ▼              ▼
   ┌─────────────────┐   ┌─────────────────┐  ┌─────────────────┐
   │ RepoStoreContext │   │ DraftStoreContext│  │ DbViewStoreContext│
   │  (reactive read  │   │  (single write   │  │ (reactive SQL    │
   │   path: pages,   │   │   funnel: stage, │  │  query path:     │
   │   blocks,        │   │   debounce,      │  │  observeRows)    │
   │   PageTreeState) │   │   checkpoint →   │  │                  │
   │                  │   │   CommitBuilder→ │  │                  │
   │                  │   │   Publisher)     │  │                  │
   └─────────────────┘   └─────────────────┘  └─────────────────┘
```

Key structural decisions (carried over from the brainstorm, approved as
"Approach B"):

1. **Per-type component registry, not a central switch.** Block types register
   into `blockComponentRegistry: Record<BlockType, ComponentType<BlockProps>>`.
   `PageEditor` looks up the component for each block's `type` and renders it.
   This makes adding a new block type (e.g. a future "image" block) additive —
   register a component, no changes to `PageEditor` itself.
2. **Stores are provided via React Context, not imported singletons.**
   `RepoStoreContext`, `DraftStoreContext`, and `DbViewStoreContext` wrap the
   app and provide the three reactive stores. Tests substitute fakes by
   wrapping components in a different Provider — no module mocking required.
3. **Single write funnel.** All local edits — block text changes, block
   insertions/deletions/reordering, database row edits — are staged through
   `DraftStore`, never written directly to `CommitBuilder`. This gives the
   future libp2p layer one stable integration point: it can both consume
   `DraftStore`'s live state (to broadcast it to peers) and stage incoming
   peer edits into it (to be checkpointed alongside local ones), without the
   editor needing to know libp2p exists.
4. **Terminal locked-content state.** When `RepoStore` reports a page that
   cannot be decrypted, `PageEditor` renders `LockedPageView` instead of the
   block tree: a read-only "🔒 Locked" placeholder with no editing affordances
   and no retry loop (see Error Handling).

## Data Model

The editor UI reuses the storage layer's shared types as-is — no redefinition,
no adapter layer:

- `Block`, `Page`, `PageTreeState`, `Patch` — imported directly from
  `src/storage/repo/types.ts`.

It introduces two new types, scoped to the database/table-view block and its
`DbViewStore` query path:

```typescript
/** Describes what a database block's table view should query and render. */
export interface ViewSpec {
  /** The id of the database block whose schema/rows this view queries. */
  databaseId: string
  /** Which db_properties columns to display, and in what order. Omitted = all. */
  columns?: string[]
  /** Optional equality filter: property name -> required value. */
  filter?: Record<string, unknown>
  /** Optional sort: property name + direction. Omitted = insertion order. */
  sort?: { property: string; direction: 'asc' | 'desc' }
}

/** A single relational row returned from the SQLite db_rows table for a view. */
export interface Row {
  id: string
  /** Property name -> value, decoded from db_rows.properties_json. */
  values: Record<string, unknown>
}
```

`ViewSpec` is stored as part of the database block's `content` (it is editor
configuration, not derived data) and serialized through the normal `Block` →
`Patch` → `CommitBuilder` path like any other block content. `Row` is a
read-only projection produced by `DbViewStore` from the SQLite index — it is
never constructed or persisted directly by the UI; row edits go back through
`DraftStore` as block-content changes to the owning database block (see Data
Flow).

## Components

### `DraftStore`

The single write funnel. Mediates between the editor's local edits, the
(future) libp2p layer, and `CommitBuilder`.

```typescript
export interface DraftStore {
  /** Stage a local edit to a block. Replaces any existing unflushed draft for
   * the same blockId, debouncing rapid keystrokes into one pending change. */
  stage(pageId: string, blockId: string, content: Record<string, unknown>): void

  /** Live observable of all currently-staged, not-yet-checkpointed drafts,
   * keyed by blockId. The future libp2p layer subscribes here to broadcast
   * local edits to peers, and may also call `stage` to merge incoming peer
   * edits into the same pending checkpoint. */
  drafts$: Observable<Record<string, { pageId: string; content: Record<string, unknown> }>>

  /** Force an immediate checkpoint of all staged drafts (bypassing the
   * debounce), building patches via CommitBuilder and publishing them via
   * Publisher. Returns once publishing has been attempted (success or queued
   * for retry — see Error Handling). Used on navigation-away and on explicit
   * "save now" actions. */
  flush(): Promise<void>
}
```

Internally, `DraftStore` debounces staged edits per page (a period of editing
inactivity triggers an automatic checkpoint, mirroring the storage spec's
write path step 1–2), merges them into the affected `Page`'s current block
tree, and hands the result to `CommitBuilder.buildPatchEventTemplate`. It also
owns the offline/retry queue described in Error Handling.

### `DbViewStore`

The reactive query abstraction over the SQLite index. Keeps raw SQL out of
components, mirroring how `RepoStore` keeps raw Nostr/applesauce APIs out of
components.

```typescript
export interface DbViewStore {
  /** Reactive query: emits the current matching rows for a database block's
   * view whenever the underlying SQLite tables change (i.e. whenever the
   * Indexer applies new state derived from synced patches). Re-queries
   * incrementally as the index updates; does not require the caller to
   * re-subscribe. */
  observeRows(databaseId: string, view: ViewSpec): Observable<Row[]>
}
```

`DbViewStore` translates a `ViewSpec` into a parameterized `SELECT` against
`db_rows` (joined with `db_properties` for column metadata), re-running the
query whenever the `Indexer` signals that the relevant `database_block_id`'s
rows changed. SQLite is a read-only cache here — `DbViewStore` never writes to
the database; row edits route through `DraftStore` (see Data Flow).

### `blockComponentRegistry`

```typescript
export type BlockType = 'paragraph' | 'heading' | 'list' | 'database'

export interface BlockProps {
  block: Block
  pageId: string
}

export const blockComponentRegistry: Record<BlockType, ComponentType<BlockProps>>
```

Each v1 block type registers its component:
- `paragraph` → `ParagraphBlock` — editable single-line/multi-line text.
- `heading` → `HeadingBlock` — editable text rendered at a heading level
  (level stored in `block.content.level`).
- `list` → `ListBlock` — editable bullet/numbered list item (kind stored in
  `block.content.kind`).
- `database` → `DatabaseBlock` — reads `block.content` as a `ViewSpec`,
  subscribes to `DbViewStore.observeRows`, and renders a table.

All editable text-bearing block components call `DraftStore.stage` on change
(typically debounced at the keystroke level inside the component, in addition
to `DraftStore`'s own per-page checkpoint debounce — the component-level
debounce avoids flooding `drafts$` on every keystroke, while `DraftStore`'s
debounce governs when a checkpoint is actually built and published).

### `PageTree`

Sidebar navigation component. Subscribes to `RepoStore`'s `PageTreeState`
observable, renders an expandable tree of pages (parent/child via `parentId`,
ordered via `order`), and emits a "page selected" event that drives which page
`PageEditor` displays. Purely presentational over `RepoStore` data — it does
not read or write through `DraftStore`; page creation/deletion/reordering
(which would need to) is out of scope for v1 navigation (the tree renders
existing structure; structural edits are a block-content concern handled the
same way any other block edit is).

### `PageEditor`

Main editing pane. Given a selected `pageId`:
1. Subscribes to `RepoStore` for that page's current `Page` (blocks + metadata).
2. If `RepoStore` reports the page as locked/undecryptable, renders
   `LockedPageView` and stops — no block tree is rendered.
3. Otherwise, renders the page's `blocks` in order, looking up each block's
   component from `blockComponentRegistry` by `block.type` and rendering it
   with `BlockProps`.
4. Provides basic block-level affordances for v1: edit text in place, add a
   new block after the current one, delete a block. Each of these stages a
   change via `DraftStore` (see Data Flow) — `PageEditor` itself never calls
   `CommitBuilder` or `Publisher` directly.

### `LockedPageView`

Terminal, read-only view shown when a page cannot be decrypted.

```typescript
export interface LockedPageViewProps {
  pageId: string
  pageTitle: string
}
```

Renders a "🔒 Locked" placeholder with the page title and a short explanation
("This page is encrypted and your key can't decrypt it. Ask a workspace
maintainer to share access."). No edit affordances, no retry button, no
polling — matches the approved "A + light C" UX: the page tree still shows the
page exists; opening it briefly shows a transient "decrypting…" state (handled
by `PageEditor` while `RepoStore` resolves), then falls back to this terminal
view if decryption fails.

## Data Flow

### Read path: page tree and block content

1. `RepoStoreContext` provides a `RepoStore` instance (the same one defined in
   the storage spec) to the component tree.
2. `PageTree` subscribes to `RepoStore`'s `PageTreeState` observable and
   renders the navigation structure reactively — new/renamed/reordered pages
   from synced patches appear automatically.
3. On page selection, `PageEditor` subscribes to `RepoStore` for that
   specific `Page` (blocks + metadata). If the page's content can't be
   decrypted, `RepoStore` reports a locked status; `PageEditor` renders
   `LockedPageView`.
4. Otherwise `PageEditor` renders `block.blocks`, mapping each block's `type`
   through `blockComponentRegistry` to its component.

### Read path: database/table-view block rows

1. `DatabaseBlock` reads its own `block.content` as a `ViewSpec` (the
   database id, optional column/filter/sort configuration).
2. It subscribes to `DbViewStoreContext`'s `observeRows(databaseId, viewSpec)`.
3. `DbViewStore` builds and runs a parameterized SQL query against `db_rows`
   (joined with `db_properties` for column names/types), and emits the
   resulting `Row[]`.
4. `DbViewStore` re-emits whenever the `Indexer` updates rows for that
   `database_block_id` (the index is rebuilt incrementally as synced patches
   arrive — see storage spec's read/sync path), so the table view updates
   reactively without the component re-querying manually.
5. SQLite is treated strictly as a read-only derived cache for this path —
   `DbViewStore` issues `SELECT`s only, never `INSERT`/`UPDATE`/`DELETE`.

### Write path: local edit → persisted (the 8-step funnel)

This is the single path every local edit takes — block text, block
insert/delete/reorder, and database row edits all flow through it identically:

1. **User edits** something in a block component (types text, adds/removes a
   block, edits a database row's cell). The component computes the new
   `content` for the affected block (for row edits, `DatabaseBlock` computes
   the updated `db_rows`-equivalent JSON to store in the owning database
   block's `content`, since SQLite is derived, not authoritative).
2. **Component calls `DraftStore.stage(pageId, blockId, content)`**. This is
   the only write entry point — no component talks to `CommitBuilder` or
   `Publisher` directly.
3. **`DraftStore` records the staged change** in its internal map, replacing
   any prior unflushed draft for that `blockId` (so rapid edits collapse into
   one pending change), and emits the updated map on `drafts$`.
4. **(Future seam, not built here):** the libp2p layer, subscribed to
   `drafts$`, would broadcast this staged change to peers live; it may also
   call `stage` itself to merge incoming peer edits into the same pending
   checkpoint. `DraftStore`'s job is only to provide this seam — it does not
   implement or assume any particular collaboration protocol.
5. **After a debounce period of inactivity** (or on explicit `flush()`, e.g.
   navigating away from the page), `DraftStore` merges all staged drafts for
   an affected page into that page's current `Page` (read from `RepoStore`),
   producing an updated `Page` object — this is the "checkpoint" referenced
   in the storage spec's write path step 2.
6. **`DraftStore` calls `CommitBuilder.buildPatchEventTemplate`** with the
   updated `Page`, producing an encrypted, unsigned NIP-34 patch event
   template (storage spec write path step 3).
7. **`DraftStore` calls `Publisher.publishPatch`** to sign and publish the
   template to relays (storage spec write path step 4). On success, the
   staged drafts for that page are cleared from `drafts$`. On failure, they
   move into the offline/retry queue (see Error Handling) rather than being
   discarded.
8. **The published event flows back through `RepoStore`** (optimistic local
   insert or relay echo, per the storage spec's write path step 5) and
   through the `Indexer` into SQLite, so `PageEditor` and `DatabaseBlock`
   observe the confirmed state via the same reactive read paths described
   above — write and read converge through one consistent loop.

## Error Handling

- **Locked pages:** when `RepoStore` cannot decrypt a page's content,
  `PageEditor` shows a brief "decrypting…" transient state, then — if
  decryption does not succeed — renders the terminal `LockedPageView`. There
  is no retry/poll loop and no per-block granular locking in v1; the whole
  page is either readable or shown as locked. The page still appears in
  `PageTree` (so users know it exists and can ask a maintainer for access).
- **Publish failures (relay unreachable, rejected event, offline):**
  `DraftStore` queues the affected page's pending checkpoint locally
  (persisted, e.g. IndexedDB, mirroring the storage spec's local queue) and
  retries with backoff. The user's local edits remain visible and editable —
  they are not lost or rolled back — and a small persistent indicator (e.g. a
  "syncing…" / "offline — N pages pending" badge) communicates queue state
  without blocking editing. This also covers the offline-editing case: edits
  continue to stage locally and flush automatically once connectivity
  returns and a checkpoint succeeds.
- **Conflict surfacing ("changed elsewhere"):** conflict *resolution* is
  handled automatically by `RepoReducer` (last-write-wins at block
  granularity, per the storage spec) — the editor UI does not implement any
  merge logic. When `RepoStore` reports that a block the user has open was
  also modified by a remote patch with a later timestamp (and thus won out),
  `PageEditor` shows a light, non-blocking inline indicator on that block
  (e.g. "this block was changed elsewhere") so the user isn't surprised by a
  silent overwrite. There is no diff/merge UI — the indicator is informational
  only; the user can re-edit if they want their version to win the next
  checkpoint.

## Testing Approach

- **Component tests with fakes via Context:** `RepoStore`, `DraftStore`, and
  `DbViewStore` are provided through React Context, so tests wrap components
  in `<RepoStoreContext.Provider value={fakeRepoStore}>` etc. with
  hand-written fakes (in-memory observables backed by `rxjs` `BehaviorSubject`)
  rather than mocking modules. This lets `PageTree`, `PageEditor`,
  `LockedPageView`, and individual block components be tested in isolation
  with Vitest + React Testing Library, asserting on rendered output and on
  calls into the fake stores (e.g. "typing in a paragraph block calls
  `DraftStore.stage` with the expected arguments").
- **`DraftStore` debounce/checkpoint tests with fake timers:** use
  `vi.useFakeTimers()` to verify that rapid `stage()` calls collapse into a
  single checkpoint after the debounce period, that `flush()` triggers an
  immediate checkpoint bypassing the debounce, that successful publishes
  clear `drafts$`, and that failures move drafts into the retry queue with
  the expected backoff schedule.
- **Integration round-trip test:** an end-to-end test (mirroring the storage
  layer's `storage.e2e.test.ts`) that stages an edit through `DraftStore`,
  lets it checkpoint through a fake `CommitBuilder`/`Publisher`, feeds the
  resulting event back through a fake `RepoStore`, and asserts that
  `PageEditor` re-renders with the updated content — proving the write-then-
  read loop converges through the UI layer the same way it does in storage.
- **`DbViewStore` tests against a real `sql.js` instance:** following the
  pattern of the storage layer's `indexer.test.ts` and `schema.test.ts`,
  `DbViewStore` is tested against an in-memory `sql.js` database seeded with
  known `db_properties`/`db_rows` rows, asserting that `observeRows` builds
  correct SQL for various `ViewSpec` combinations (column selection, filter,
  sort) and emits updated `Row[]` when the underlying tables change.

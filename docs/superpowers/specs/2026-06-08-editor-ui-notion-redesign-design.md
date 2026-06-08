# Grid34 Editor UI — Notion-Feel Redesign

**Date:** 2026-06-08
**Status:** Approved for planning

## Context

The editor UI subsystem (spec: `docs/superpowers/specs/2026-06-08-editor-ui-design.md`,
plan: `docs/superpowers/plans/2026-06-08-editor-ui.md`) has been implemented and
is functionally wired up — `PageTree`, `PageEditor`, `DraftStore`, `DbViewStore`,
and the `blockComponentRegistry` all work and read/write through the existing
storage pipeline. However, the result is visually and interactively bare-bones
compared to the Notion-like experience the project is going for:

- `ParagraphBlock` is a single-line `<input>` — no rich text, no multi-line,
  no inline formatting
- No way to create new blocks or change a block's type (no slash menu / `+`)
- No drag handles, hover toolbars, or per-block menus
- `PageTree` is an unstyled flat nested list — no collapse, icons, or actions
- Minimal/no visual styling — looks like unstyled semantic HTML

This spec defines a redesign pass closing those gaps, **without changing the
underlying architecture**: `DraftStore.stage`/`drafts$`/`flush`,
`blockComponentRegistry`, and the `PageTree`/`PageEditor` component structure
are all treated as fixed, proven interfaces. This is a UI/UX layer built on
top of them.

## Goals

- Replace plain-text block editing with rich text (bold/italic/strike/code/
  links, multi-line, Enter-to-split / Backspace-to-merge) via Tiptap/ProseMirror.
- Add Notion's core block-creation interaction: `/` slash command menu plus
  Enter-to-create-new-block-below.
- Add per-block hover chrome: drag handle for reordering, menu for delete.
- Redesign the page tree: collapsible nodes, icons, hover-revealed page
  create/rename/delete actions (which requires adding minimal page-level CRUD
  to `DraftStore`/storage, since it doesn't exist yet).
- Introduce Tailwind CSS project-wide for consistent visual polish (spacing,
  typography, hover states, layout).

## Non-Goals

- Changing `DraftStore`'s core interface, `blockComponentRegistry`, or the
  storage pipeline (`RepoReducer`/`Indexer`/`CommitBuilder`/`Publisher`) — all
  remain as designed and implemented.
- A whole-page single-editor model (e.g. one ProseMirror doc per page) — out
  of scope; this spec keeps the existing per-block granularity that the
  storage layer's block-level last-write-wins conflict model depends on.
- Visual regression/screenshot testing tooling — not in the current stack;
  out of scope for this pass.
- Database/table-view block redesign — `DatabaseBlock` is unaffected by this
  pass (it's not a text block and has its own interaction model).

## Architecture Overview

This redesign layers on top of the existing, unchanged module boundaries.
Four areas of change:

1. **Rich text blocks** — `ParagraphBlock`, `HeadingBlock`, and `ListBlock`
   (the text-bearing block types) are rebuilt around individual Tiptap/
   ProseMirror editor instances. Each block owns one small Tiptap editor
   scoped to its own content; `Block.content` gains a `richText` field
   (serializable ProseMirror JSON) alongside a derived `text` field. Tiptap's
   `onUpdate` calls `DraftStore.stage(pageId, block.id, { richText, text })`
   — same data flow as today, richer payload. Cross-block behaviors (Enter
   splits into a new block, Backspace at position 0 merges with the previous
   block) are implemented by each block editor invoking callbacks
   (`onSplitBlock`, `onMergeWithPrevious`) provided by `PageEditor`, rather
   than Tiptap managing the whole page as one document.
2. **Slash command menu** — a shared `SlashMenu` component triggered when `/`
   is typed at the start of an empty block (via a Tiptap input rule). It
   renders a filterable list of block types sourced from the registry;
   selecting one converts the current block's `type` (via `stage`) and
   focuses its editor.
3. **Block hover chrome** — a `BlockChrome` wrapper component (rendered by
   `PageEditor` around each block) shows a drag handle and menu button on
   hover. Drag-and-drop reordering uses `@dnd-kit/core` (actively maintained,
   accessible) to compute new fractional `order` values pushed via `stage`;
   the menu offers delete.
4. **Page tree redesign** — `PageTree`/`PageNode` gain per-node collapse
   state (local component state, not persisted), an icon slot
   (`page.icon ?? '📄'`), and hover-revealed `+` (create child page) /
   `…` (rename/delete) actions. Because no page-level mutation exists yet in
   `DraftStore`, this spec also adds minimal `createPage`/`renamePage`/
   `deletePage` operations — these route through the *same* `Patch`/
   `CommitBuilder`/`Publisher` pipeline as block edits (a new/renamed/deleted
   page is just a change to `PageTreeState`, which `RepoReducer`/`Indexer`
   already model — no new patch types needed).

Tailwind CSS is introduced project-wide for styling, replacing the existing
semantic class names with utility classes plus a small design-token
configuration layer, so all of the above shares a consistent look.

**Coordination note for the future libp2p layer:** Tiptap has first-class Yjs
binding (`y-prosemirror`). The libp2p collaboration spec
(`docs/superpowers/specs/2026-06-08-libp2p-collaboration-design.md`) already
plans for `DraftStore` to wrap a `CollabDoc`/`Y.Doc`. When that layer is
implemented, each block's Tiptap instance can bind directly to its
corresponding Yjs fragment instead of going through plain JSON serialization
— this redesign's per-block-editor structure is what makes that swap
straightforward later. No action needed now; noted for future integration.

## Components

- **`RichTextBlock`** (new shared base) — wraps a Tiptap `useEditor` instance
  configured with paragraph/heading/list/bold/italic/strike/code/link
  extensions, an input rule converting `/` at block-start into opening
  `SlashMenu`, and Enter/Backspace keymaps invoking `onSplitBlock`/
  `onMergeWithPrevious` props. `ParagraphBlock`, `HeadingBlock`, `ListBlock`
  become thin configurations of it (heading level, list-item wrapping).
- **`SlashMenu`** — `{ query: string; onSelect(blockType: string): void; onClose(): void }`.
  Filterable popover listing registry entries; positioned near the cursor via
  Tiptap's `posToDOMRect`.
- **`BlockChrome`** — `{ block: Block; pageId: string; children: ReactNode }`.
  Renders a drag handle (via `@dnd-kit`'s `useSortable`) and a "…" menu
  (delete) on hover, wrapping any registered block component uniformly.
- **`PageEditor`** (extended) — wraps its block list in a `@dnd-kit`
  `DndContext`/`SortableContext`; computes new `order` values on drop and
  stages them; provides `onSplitBlock(blockId, { before, after })` (creates a
  new block via `stage` with a fresh ID) and `onMergeWithPrevious(blockId)`
  (merges content into the previous block, removes this one).
- **`PageTree`/`PageNode`** (extended) — adds a local collapse-state map
  (keyed by page ID), icon rendering with fallback, and hover-revealed `+`/
  `…` buttons calling the new `DraftStore` page operations.

## Data Model

Additive changes only, in `src/storage/repo/types.ts`:

```typescript
// Block.content gains, by convention, within its existing
// Record<string, unknown> shape:
//   richText?: ProseMirrorJSON   — serialized Tiptap/ProseMirror document
//   text?: string                — derived plain-text fallback/preview

interface Page {
  // ...existing fields (id, title, parentId, order, blocks, updatedAt) unchanged...
  icon?: string  // emoji or icon identifier; UI falls back to a default glyph
}
```

New `DraftStore` operations (additive to its existing `stage`/`drafts$`/`flush`):

```typescript
createPage(parentId: string | null, title: string): string   // returns new pageId
renamePage(pageId: string, title: string): void
deletePage(pageId: string): void
```

These stage `PageTreeState`-shaped changes through the same `Patch`/
`CommitBuilder`/`Publisher` pipeline as block edits. No new patch types,
`RepoReducer` logic, or `Indexer` changes are required — `RepoReducer` already
reduces arbitrary `PageTreeState` changes, and `Indexer` already diffs/applies
page-table changes.

## Data Flow

**Typing in a text block:**
1. User types in a `RichTextBlock`'s Tiptap editor.
2. Tiptap's `onUpdate` fires; the block serializes the ProseMirror doc to
   `richText` JSON plus a derived plain-text `text`, then calls
   `DraftStore.stage(pageId, block.id, { richText, text })`.
3. `drafts$` emits the updated page. Tiptap manages its own internal editor
   state, so local typing doesn't round-trip through `drafts$` mid-keystroke
   — avoiding cursor-jump issues on re-render.

**Pressing Enter (split block):**
1. Tiptap keymap intercepts Enter at a splittable position, computes content
   before/after the cursor, and calls `onSplitBlock(blockId, { before, after })`.
2. `PageEditor` stages the current block with `before`, creates a new block
   (fresh ID, `order` between current and next sibling) with `after` via
   `stage`, and focuses the new block.

**Pressing Backspace at block start (merge):**
1. Tiptap keymap detects the cursor at position 0 with an empty selection and
   calls `onMergeWithPrevious(blockId)`.
2. `PageEditor` finds the previous sibling, stages it with the merged
   `richText` content, removes the current block via `stage`, and places the
   cursor at the merge point in the previous block's editor.

**Slash command:**
1. Typing `/` at an empty block start triggers Tiptap's input rule, opening
   `SlashMenu` anchored to the cursor.
2. Filtering narrows the registry list; selecting an entry calls
   `stage(pageId, blockId, { type: newType, ...resetContent })` — changing
   the block's `type` so `blockComponentRegistry` renders a different
   component — and closes the menu.

**Drag-to-reorder:**
1. User drags a block via `BlockChrome`'s handle; `@dnd-kit` reports the drop
   position.
2. `PageEditor` computes a new fractional `order` (midpoint between new
   neighbors, matching the existing convention) and stages just that one
   block's `order` change.

**Page tree operations:**
1. `+` on a node → `DraftStore.createPage(parentId, 'Untitled')`, then
   `onSelectPage(newId)` to navigate there immediately.
2. `…` → inline rename (contentEditable title, calls `renamePage` on blur) or
   delete (`deletePage`, behind a confirmation step — destructive, though
   history is retained per the storage spec's Git-backed model).
3. Collapse/expand toggles local component state only — no `stage` call,
   purely a view concern.

All of the above flow through the *same* `stage`/`flush` → `CommitBuilder` →
`Publisher` pipeline already in place; nothing here bypasses or special-cases
persistence.

## Visual Design / Styling

- Introduce Tailwind CSS project-wide: `tailwind.config.ts` defines a small
  design-token layer — spacing scale, system-ui font stack, neutral gray
  palette plus one accent color, consistent border-radius/shadow tokens for
  menus and hover surfaces.
- Layout: persistent left sidebar (`PageTree`, fixed width, subtle background
  tint) + main content area (`PageEditor`, centered with max-width and
  generous padding — a "document in space" feel).
- Block spacing: consistent vertical rhythm between blocks; hover states
  reveal `BlockChrome` controls via opacity transitions (not layout shifts,
  to avoid jank while editing).
- Existing semantic class names (e.g. `page-editor__header`) are replaced by
  Tailwind utility classes; recurring complex patterns are extracted via
  `@apply` in a small shared stylesheet rather than scattered utility soup.

## Error Handling

- **Tiptap editor init failure** (e.g. malformed `richText` JSON from a
  remote/legacy patch): catch and fall back to rendering the derived
  plain-text `text` field read-only, with an inline notice that rich content
  couldn't load — never crash the page.
- **Slash menu with no matches**: show an empty state ("No matching block
  type") rather than an empty popover.
- **Drag-and-drop order conflicts** (concurrent reorders): no new conflict
  logic needed — `order` is just another `Block` field, so the existing
  block-level last-write-wins resolution (per the storage spec) applies; the
  UI re-renders from the next `drafts$`/`pageTree$` emission if a concurrent
  reorder wins.
- **Page delete**: confirmation dialog before calling `deletePage`; if the
  deleted page was selected, navigate to its parent (or the tree root).

## Testing Approach

- `RichTextBlock`: test `onUpdate` → `stage` serialization round-trips
  (ProseMirror JSON ↔ `richText`), and split/merge callback invocation at
  boundary positions, using Tiptap's testing utilities with a minimal
  extension set.
- `SlashMenu`: test filtering behavior and `onSelect` → type-change staging,
  against a fixture registry.
- `BlockChrome`/drag-reorder: test that a drop computes the expected new
  `order` and stages only the moved block, using `@dnd-kit`'s test helpers.
- `PageTree`: test collapse/expand state across re-renders, icon fallback
  rendering, and that `+`/`…` actions call the correct `DraftStore` methods
  with correct arguments.
- New `DraftStore` page operations (`createPage`/`renamePage`/`deletePage`):
  unit test that each stages the expected `PageTreeState` shape, mirroring
  existing `stage` test patterns — confirming they flow through the same
  `Patch` pipeline without new patch types.
- Visual regression is out of scope (no screenshot tooling in this stack);
  rely on component tests for behavior and manual review for look-and-feel.

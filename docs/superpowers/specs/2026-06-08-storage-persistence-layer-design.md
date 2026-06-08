# Grid34 Storage & Persistence Layer Design

**Date:** 2026-06-08
**Status:** Approved for planning

## Context

Grid34 is a decentralized, local-first, Notion-like workspace. Three independent
subsystems make up the full product: the block-editor UI, the libp2p real-time
collaboration layer, and the storage/persistence layer. This spec covers **storage
and persistence only** — the foundation the other subsystems build on.

Persistence is built on Nostr's NIP-34 ("Git-over-Nostr") events, with a local
SQLite index providing the relational query capabilities Notion-style "databases"
need (filtering, sorting, views) without replacing relays as the source of truth.

## Goals

- Define how workspace content (pages, blocks, Notion-style relational databases)
  is represented as a NIP-34 Git repo.
- Define how that repo content is mirrored into a derived, queryable SQLite index.
- Define how content is encrypted so relays never see plaintext, while remaining
  shareable among authorized collaborators.
- Provide clear module boundaries so the editor UI and libp2p layer can be built
  against stable interfaces without depending on persistence internals.

## Non-Goals

- Real-time collaborative editing mechanics (handled by the libp2p layer; this
  spec only defines the boundary where its output becomes a persisted commit).
- Editor UI/UX and block-type design.
- Relay selection/discovery strategy and NIP-34 permission/governance workflows
  beyond what's needed to distribute encryption keys.

## Architecture Overview

Three layers:

1. **Persistence layer (Nostr/NIP-34 Git)** — source of truth. Each workspace is
   a Git repo represented via NIP-34 events (repo announcement, patches, state).
   Pages are JSON files (`pages/<page-id>.json`) holding ordered block trees.
   Edits become signed commits/patches published to relays.
2. **Index layer (SQLite via WASM)** — derived and disposable. A `sql.js`/
   `wa-sqlite` database mirrors repo content into relational tables (pages,
   blocks, database properties/rows) for fast queries, filters, and views.
   Built incrementally from Nostr events; can be discarded and rebuilt from the
   repo at any time.
3. **Sync/event layer (applesauce + nostr-tools)** — the bridge. `applesauce`
   provides a reactive event store/query layer subscribing to relays for repo
   events; `nostr-tools` supplies low-level primitives (signing, verification,
   relay connections, NIP-07 signer interfaces). The indexer subscribes to
   applesauce's reactive models and applies new events to SQLite incrementally.

Real-time collaboration (libp2p) is fully separate: it operates on live editing
state independently of this pipeline. Only debounced "checkpoint" commits
produced after a period of editing inactivity flow into the persistence pipeline
described here.

## Data Model

- **One Git repo per workspace.** A workspace maps to a single NIP-34 repo.
- **One JSON file per page**, at `pages/<page-id>.json`, containing that page's
  ordered block tree. Edits to any block in a page produce a diff to that page's
  file.
- **Notion-style relational databases** are represented as a block type whose
  schema (`db_properties`) and rows (`db_rows`) are stored within the owning
  page's JSON, and indexed into dedicated SQL tables for querying.

## Encryption

Workspace content must be unreadable to relays and non-collaborators, while
remaining shareable among authorized collaborators.

- Each workspace has a symmetric **content-encryption key (CEK)**.
- Page/block JSON is encrypted with the CEK *before* being committed — relays
  only ever see ciphertext.
- The CEK is wrapped individually for each authorized collaborator's pubkey
  using **NIP-44**, and wrapped copies are distributed alongside the repo's
  NIP-34 maintainer/permission events.
- **Granting access:** the CEK is re-wrapped for the new collaborator's pubkey.
- **Revoking access:** requires rotating to a new CEK and re-wrapping it for
  remaining members. Existing history remains under the old key (not
  retroactively re-encrypted).

This integrates into the data flow as:
- **Write:** the Commit Builder encrypts page JSON with the CEK before
  constructing the patch.
- **Read/sync:** the Repo Reducer decrypts patches with the CEK (obtained by
  unwrapping with the user's own key via NIP-44/NIP-07) before handing content
  to the Indexer.

## Data Flow

### Write path (local edit → persisted)

1. User edits a block; the change is applied to local state (and shared live
   with peers via libp2p, outside this spec's scope).
2. After a debounce period of inactivity, accumulated block changes per
   affected page are bundled into a checkpoint.
3. The **Commit Builder** encrypts and serializes affected `pages/<id>.json`
   files and constructs a Git commit/patch.
4. The **Publisher** signs the patch event (via NIP-07/NIP-46) and publishes
   NIP-34 patch/state events to relays via `nostr-tools`/applesauce.
5. The newly published event flows back through applesauce's event store (via
   optimistic local insert or relay echo) and is applied to SQLite by the
   indexer — the same path used for remote updates, keeping write and read
   paths consistent.

### Read/sync path (remote change → local index)

1. applesauce subscribes to the workspace repo's NIP-34 events (patches, state
   updates, permission changes) via the relay pool.
2. New events flow through the **Repo Reducer**: decrypts them with the CEK and
   applies patches to a virtual view of the repo tree, producing updated
   `pages/*.json` contents.
3. The **Indexer** diffs updated page content against current SQLite tables and
   applies inserts/updates/deletes to the relevant tables.
4. UI reads reactively from SQLite (relational queries/views) or directly from
   applesauce models (non-relational/live data), so changes propagate to the
   editor automatically.

### Conflict handling

When concurrent patches modify the same page, the Repo Reducer resolves at
**block granularity using last-write-wins** (by event timestamp). Nothing is
destroyed — all patches remain in Git history, so manual recovery or merging
stays possible, and the UI can surface "this block was changed elsewhere" using
that history.

## SQL Schema (derived index — fully rebuildable from the repo)

- `pages(id, title, parent_id, order, updated_at, ...)` — page tree
  structure/metadata
- `blocks(id, page_id, parent_block_id, type, order, content_json, updated_at)`
  — flattened block tree per page, queryable by type/parent
- `db_properties(database_block_id, name, type, config_json)` — schema
  definitions for Notion-style "database" blocks
- `db_rows(id, database_block_id, properties_json)` — relational rows belonging
  to a database block, queried/filtered/sorted via SQL
- `sync_state(workspace_id, last_event_id, last_seen_at)` — bookkeeping for
  incremental indexing and resume after reload

## Key Module Interfaces

Each module is independently testable and has a single clear responsibility:

- **`RepoStore`** — wraps applesauce models; exposes reactive subscriptions to
  a workspace's NIP-34 events (patches, state, permissions).
- **`CryptoBox`** — wraps NIP-44 encrypt/decrypt and CEK wrap/unwrap/rotation;
  isolates all cryptography so it can be reviewed/swapped independently.
- **`RepoReducer`** — pure function(s) turning an ordered sequence of decrypted
  patches into current page-tree state; owns last-write-wins conflict
  resolution.
- **`Indexer`** — diffs reducer output against SQLite state and applies
  incremental writes; the only component that touches the SQL layer directly.
- **`CommitBuilder`** — turns local block edits into encrypted patch events
  ready for signing/publishing.
- **`Publisher`** — signs (NIP-07/NIP-46) and publishes events via
  nostr-tools/applesauce's relay pool.

UI components (editor, page tree, database views) read only from `RepoStore`
(live/non-relational data) and SQLite (queries/filters/views) — never touching
Nostr/Git internals directly.

## Error Handling

- **Publish failures** (relay unreachable, rejected event): retry with
  backoff; queue unpublished commits locally (IndexedDB) so edits aren't lost
  and re-attempt on reconnect — this also supports offline editing.
- **Decryption failures** (missing/rotated CEK, corrupt event): surface as a
  "locked" state for the affected page rather than crashing; the user can
  request the CEK be re-shared by a maintainer.
- **Indexing failures** (malformed page JSON, schema drift): log and skip the
  offending event without blocking the rest of the sync queue. Since SQLite is
  fully derived, a "rebuild index" action always recovers from a bad state.
- **Conflict surfacing**: resolution is automatic, but the UI can show "this
  block was changed elsewhere" using retained Git history so users aren't
  surprised by silent overwrites.

## Testing Approach

- `RepoReducer` and `Indexer` are pure/deterministic given an event sequence —
  unit test with fixture event sequences (including out-of-order and
  conflicting patches), asserting final page-tree/SQL state.
- `CryptoBox` tested against NIP-44 test vectors plus round-trip
  wrap/unwrap/rotation scenarios.
- `CommitBuilder`/`Publisher` tested against a mock relay (or in-memory
  applesauce event store), verifying correct event shapes and signing calls.
- End-to-end: an in-memory/local multi-relay setup simulating two peers editing
  concurrently, verifying both SQLite indexes converge to the same state.

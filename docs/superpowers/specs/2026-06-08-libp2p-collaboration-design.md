# Grid34 Real-Time Collaboration (libp2p) Design

**Date:** 2026-06-08
**Status:** Approved for planning

## Context

Grid34 is a decentralized, local-first, Notion-like workspace. Three independent
subsystems make up the full product: the storage/persistence layer, the
block-editor UI, and the libp2p real-time collaboration layer. The first two
are already designed and planned:

- Storage: `docs/superpowers/specs/2026-06-08-storage-persistence-layer-design.md`
- Editor UI: `docs/superpowers/specs/2026-06-08-editor-ui-design.md`

This spec covers the **real-time collaboration layer only** — how multiple
users editing the same page see each other's changes live, and how that live
session connects back to the persistence pipeline.

The storage spec already defines the boundary: *"libp2p handles live editing
state; only debounced checkpoint commits flow into the persistence pipeline."*
The editor-UI spec already defines the integration seam: a `DraftStore` with
`stage(pageId, blockId, edit)`, `drafts$`, and `flush(pageId)`, explicitly
designed so this layer could plug into it.

## Goals

- Define how collaborators discover and connect to each other for a given
  workspace, reusing existing Nostr identity/permission/encryption
  infrastructure rather than building a separate discovery network.
- Define how concurrent live edits to the same page are merged in real time
  without data loss or silent overwrites.
- Define exactly how this layer plugs into the already-designed `DraftStore`
  seam so the editor UI requires no special-casing for collaborative vs.
  solo editing.
- Define how live presence (cursors/selections) is shared.
- Define how a live session converts back into a persisted checkpoint commit,
  reusing the existing `CommitBuilder`/`Publisher` pipeline unchanged.

## Non-Goals

- Persistence mechanics (Git/Nostr commit format, encryption-at-rest, SQLite
  indexing) — fully covered by the storage spec; this layer only produces
  `Page` values that flow into `DraftStore.flush()` exactly as in the
  non-collaborative path.
- Editor UI/UX beyond the presence rendering hook (cursor/selection display).
- General-purpose libp2p network operation (relay nodes, public DHT
  participation) — out of scope; this is a private, permissioned mesh scoped
  to each workspace's authorized collaborators.

## Architecture Overview

Three components layer on top of the existing storage and editor-UI subsystems:

1. **Discovery Bridge** — listens for and publishes encrypted Nostr events
   carrying libp2p multiaddrs/peer IDs, so authorized collaborators can find
   and dial each other without a public DHT. It reuses the same
   collaborator-pubkey list already maintained by the storage layer's
   permission/CEK-wrapping events, and reuses NIP-44 for encryption — so
   "who can edit this workspace" and "who can connect to me for live editing"
   stay in sync automatically.
2. **Room Manager** — for each open page, joins a libp2p `gossipsub` topic
   scoped to `workspaceId:pageId` (a "room"), dialing peers surfaced by the
   Discovery Bridge. It manages join/leave as users navigate between pages and
   tears rooms down when no local page using them remains open.
3. **CRDT Sync Layer** — wraps a Yjs (`Y.Doc`) document per open page; uses
   y-protocols' sync and awareness protocols over the room's gossipsub topic
   to exchange document updates and live presence (cursors/selections)
   between peers in real time, with automatic conflict-free merging.

These three sit entirely "above" the storage pipeline — they never touch
`RepoStore`, `CommitBuilder`, or `Publisher` directly. The only connection
point to persistence is that `DraftStore` (from the editor-UI spec) internally
wraps the Yjs doc; its existing debounced-flush mechanism converts CRDT state
into a `Page` and hands it to `CommitBuilder`, exactly as already designed for
single-user editing.

Collaboration is strictly **additive**: with no peers reachable, everything
operates in single-user mode using the same code paths, just with an
unshared local Yjs doc.

## Data Model

New types introduced by this layer (existing `Block`/`Page`/`PageTreeState`/
`Patch` types from `src/storage/repo/types.ts` are reused unchanged — this
layer only ever produces a `Page` for persistence, identical to the
non-collaborative path):

```typescript
interface PeerInfo {
  pubkey: string
  peerId: string
  multiaddrs: string[]
  updatedAt: number
}

interface PresenceState {
  pubkey: string
  pageId: string
  blockId: string | null
  selection: { anchor: number; head: number } | null
}
```

- `PeerInfo` is the payload exchanged via Nostr for connection bootstrap. It
  is encrypted with NIP-44 to each authorized collaborator's pubkey (mirroring
  CEK wrapping) and published as an **ephemeral Nostr event** (kind in the
  20000–29999 range per NIP-01) — relays relay it live and do not store it,
  matching its transient "here's my current address" nature.
- `PresenceState` is carried entirely by Yjs `Awareness` over the libp2p room
  — never persisted, purely ephemeral/live. It does not touch Nostr or the
  storage pipeline at all.

**On "rooms" and Nostr event kinds:** the actual collaboration "room" is a
libp2p `gossipsub` topic, *not* a Nostr-relay-mediated concept. NIP-29
(Relay-based Groups) was considered and rejected for this purpose — it makes
the relay the live-collaboration hub, which conflicts with the
"fully separate from persistence, relay-independent mesh" boundary already
locked in by the storage spec. Nostr's only role here is the one-time
connection bootstrap via ephemeral events; all live traffic flows over libp2p.

## Components

- **`DiscoveryBridge`**
  - `publishPeerInfo(workspaceId: string, multiaddrs: string[]): Promise<void>`
    — encrypts and publishes this peer's `PeerInfo` as an ephemeral Nostr
    event, wrapped per-collaborator using the workspace's existing
    collaborator-pubkey list (from the storage layer's permission events).
  - `peers$: Observable<Record<string /*pubkey*/, PeerInfo>>` — reactive view
    of discovered, decryptable peers for the current workspace.
  - Decryption failures (stale wrap, rotated CEK) are logged and the peer is
    treated as undiscoverable — never surfaced as a crash.

- **`RoomManager`**
  - `joinRoom(workspaceId: string, pageId: string): Promise<void>` — joins
    the `gossipsub` topic `${workspaceId}:${pageId}`, dialing peers from
    `DiscoveryBridge.peers$`.
  - `leaveRoom(workspaceId: string, pageId: string): Promise<void>` — leaves
    the topic and disconnects peers no longer shared with any open room.
  - Emits connection/disconnection events that `CollabDoc` and the presence
    UI subscribe to.

- **`CollabDoc`**
  - Wraps one Yjs `Y.Doc` per open page.
  - `applyLocalEdit(blockId: string, edit: Partial<Block['content']>): void`
    — mutates the shared Yjs structures for that block; Yjs produces an
    update which is broadcast to the room.
  - `remoteUpdates$: Observable<Uint8Array>` — internal stream of incoming
    Yjs updates from peers, applied to the local doc (CRDT merge is automatic
    and conflict-free).
  - `awareness: Awareness` — the y-protocols `Awareness` instance carrying
    `PresenceState` for all connected peers in the room; the editor subscribes
    to this to render remote cursors/selections.
  - `lastActivityAt: number` — timestamp of the most recent update from any
    peer (local or remote); used to drive the shared-inactivity checkpoint
    trigger.
  - Internally converts between Yjs shared types and the `Block`/`Page` shapes
    from the storage layer's types — this conversion is the one piece of new
    domain logic this layer owns, and it's pure/testable in isolation.

- **`DraftStore` (extended per editor-UI spec)**
  - When collaboration is active for a page, `DraftStore` is backed by a
    `CollabDoc` instead of plain local state:
    - `stage(pageId, blockId, edit)` calls `CollabDoc.applyLocalEdit`.
    - `drafts$` derives its emitted `Page` values from the `CollabDoc`'s Yjs
      doc — merged local+remote state, indistinguishable to the editor.
    - `flush(pageId)` is triggered by `CollabDoc.lastActivityAt` crossing the
      shared-inactivity debounce window (in addition to the existing
      single-user debounce trigger), and converts the converged Yjs state to
      a `Page` for `CommitBuilder`/`Publisher` — completely unchanged from
      the non-collaborative path.
  - When no peers are present, `DraftStore` operates exactly as specified in
    the editor-UI spec, with `CollabDoc` simply holding a local-only Yjs doc.

## Data Flow

**Joining a collaborative session (page opened):**
1. `RoomManager.joinRoom(workspaceId, pageId)` is called when a page is opened.
2. `DiscoveryBridge` resolves the workspace's collaborator pubkeys (from the
   existing CEK-collaborator list) and exchanges encrypted `PeerInfo` events
   so peers can dial each other.
3. `RoomManager` joins the `gossipsub` topic `${workspaceId}:${pageId}`,
   dialing discovered peers.
4. `DraftStore` instantiates a `CollabDoc` for the page, seeded from the
   current `RepoStore`/SQLite state (the last persisted version), and runs
   the y-protocols sync handshake with room peers to converge to the latest
   shared state.

**Local edit:**
1. Editor calls `DraftStore.stage(pageId, blockId, edit)`.
2. Forwarded to `CollabDoc.applyLocalEdit`, mutating the Yjs doc; Yjs produces
   an update broadcast over the room's gossipsub topic.
3. `drafts$` emits the new merged state; editor re-renders — same reactive
   contract as the non-collaborative case.

**Remote edit:**
1. A peer's Yjs update arrives via gossipsub → `CollabDoc` applies it to the
   local doc; CRDT merge is automatic and conflict-free.
2. `drafts$` emits the merged state; editor re-renders — indistinguishable
   from a local edit from the UI's perspective.

**Presence:**
- Cursor/selection changes are published as `PresenceState` via Yjs
  `Awareness` over the same gossipsub topic — ephemeral, never persisted.
  The editor subscribes to `CollabDoc.awareness` to render remote cursors.

**Checkpoint → persistence handoff:**
1. `CollabDoc` tracks `lastActivityAt` across updates from any peer (local or
   remote).
2. After a debounce window (e.g. 5s) with no activity from anyone,
   `DraftStore.flush(pageId)` fires: converts the converged Yjs doc state to
   a `Page`, then proceeds exactly as the non-collaborative path —
   `CommitBuilder` → `Publisher` → relays. Because the converged state is
   identical across peers, redundant flushes from multiple participants
   produce equivalent commits that relays/the `Indexer` naturally treat as
   duplicates — no coordination/leader-election needed.

**Leaving:**
- Page closed/navigated away → `RoomManager.leaveRoom`; `CollabDoc` is torn
  down, forcing a final flush if unflushed local state remains.

## Error Handling

- **No peers reachable / discovery fails**: editing continues fully
  functional in single-user mode — `CollabDoc` operates on a local-only Yjs
  doc; debounced flush works exactly as in the non-collaborative path.
  Collaboration is additive, never a dependency for basic editing.
- **Peer disconnects mid-session**: `RoomManager` detects the drop via libp2p
  connection events and removes that peer's `Awareness` presence; remaining
  peers continue syncing uninterrupted. On reconnection, the peer simply
  re-runs the y-protocols sync handshake and converges — no special recovery
  logic required.
- **Conflicting edits during reconnection** (a peer was offline, made local
  edits, then reconnects): resolved transparently by Yjs's CRDT merge — this
  is the core guarantee CRDTs provide and requires no custom conflict logic.
  This is strictly stronger than the storage layer's last-write-wins for the
  live-editing window; LWW remains the backstop at the persistence layer for
  changes made fully offline across separate sessions (as already specified
  in the storage spec).
- **Encrypted `PeerInfo` decryption failure** (rotated CEK, stale wrap): the
  peer is treated as undiscoverable — logged and skipped, mirroring the
  storage spec's "locked page" pattern of failing gracefully.
- **Checkpoint flush failure** (relay unreachable): identical to existing
  storage-layer handling — `CommitBuilder`/`Publisher` already queue and
  retry locally; `CollabDoc`/`DraftStore` need no awareness of persistence
  failures.

## Testing Approach

- **`CollabDoc`**: unit test Yjs-doc ↔ `Block`/`Page` conversion round-trips,
  and CRDT merge behavior against fixture update sequences (including
  out-of-order and concurrent edits to the same block) — pure/deterministic
  given a sequence of updates, mirroring how `RepoReducer` is tested.
- **`DiscoveryBridge`**: test `PeerInfo` encrypt/decrypt round-trips and
  collaborator-list filtering against a mock event store, mirroring the
  `CryptoBox` test approach.
- **`RoomManager`**: test join/leave lifecycle and peer-dial behavior against
  an in-memory/mock libp2p node (libp2p ships test-transport utilities for
  exactly this).
- **End-to-end**: spin up 2–3 in-memory libp2p nodes with their own `CollabDoc`
  instances simulating concurrent editors on the same page; verify (a) all
  converge to identical state, and (b) the debounced checkpoint produces a
  single coherent `Patch` that flows correctly into the existing storage E2E
  pipeline (reusing the storage spec's multi-peer convergence test setup).

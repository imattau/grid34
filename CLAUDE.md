# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

## Commands

- `npm install` - install dependencies
- `npm run dev` - start the Vite dev server
- `npm run build` - production build
- `npm test` - run the test suite once (Vitest)
- `npm test -- <pattern>` - run tests matching a filename pattern
- `npm run test:watch` - run tests in watch mode

## Architecture

Grid34 is a decentralized, local-first workspace split into three subsystems:

1. Storage/persistence layer in `src/storage/` models workspace content as an encrypted NIP-34 Git-over-Nostr repo and mirrors it into a derived SQLite index.
2. Editor UI in `src/editor/` is a React block editor that renders the page tree and page content from the storage layer, with a Notion-style database block backed by a SQL query layer.
3. Real-time collaboration in `src/collab/` provides encrypted peer discovery, a room manager, and a page-level collaborative doc that plugs into the editor's DraftStore seam.

Storage modules:

- `src/storage/crypto/` - CEK generation and content encryption helpers
- `src/storage/repo/` - pure patch reduction and shared data types
- `src/storage/index/` - SQLite schema and indexer
- `src/storage/commit/` - patch event template construction
- `src/storage/store/` - applesauce-backed repo subscriptions
- `src/storage/publish/` - event signing and relay publishing

Editor modules:

- `src/editor/types.ts` - `ViewSpec` and `Row` for database block views
- `src/editor/stores/draftStore.ts` - the single write funnel with debounce and retry
- `src/editor/stores/dbViewStore.ts` - reactive `observeRows(databaseId, viewSpec)` query layer over `sql.js`
- `src/editor/blocks/` - v1 block components and the `blockComponentRegistry`
- `src/editor/contexts/storeContexts.tsx` - React Context providers/hooks for `RepoStore`, `DraftStore`, and `DbViewStore`
- `src/editor/components/` - `PageTree`, `PageEditor`, and `LockedPageView`

Collaboration modules:

- `src/collab/types.ts` - `PeerInfo` and `PresenceState`
- `src/collab/discovery/` - encrypted PeerInfo publishing and reactive peer discovery
- `src/collab/room/` - room join/leave lifecycle over gossipsub
- `src/collab/doc/` - collaborative page state and Yjs awareness/presence
- `src/collab/integration/` - adapter that bridges the collab doc into the DraftStore seam

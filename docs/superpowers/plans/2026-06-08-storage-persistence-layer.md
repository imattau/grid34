# Storage & Persistence Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the storage/persistence foundation for Grid34: workspace content modeled as encrypted NIP-34 Git-over-Nostr repos, mirrored into a queryable local SQLite index.

**Architecture:** Six independently-testable modules — `CryptoBox` (NIP-44 encryption/CEK management), `RepoReducer` (pure patch-sequence → page-tree state with last-write-wins conflict resolution), `Indexer` (diffs reducer output into SQLite), `CommitBuilder` (block edits → encrypted patch events), `RepoStore` (reactive applesauce subscriptions), and `Publisher` (signing/publishing via nostr-tools). Each is built test-first against fixtures/mocks, bottom-up: crypto → reducer → indexer → commit builder → store → publisher.

**Tech Stack:** React + Vite + TypeScript, Vitest, `nostr-tools` (`@nostr/tools`), `applesauce-core`/`applesauce-relay`, `sql.js` (SQLite via WASM), npm.

---

## File Structure

```
src/
  storage/
    crypto/
      cryptoBox.ts          # CEK generation, NIP-44 wrap/unwrap, content encrypt/decrypt
      cryptoBox.test.ts
    repo/
      repoReducer.ts        # pure: patch[] -> PageTreeState, last-write-wins
      repoReducer.test.ts
      types.ts              # Patch, PageTreeState, Page, Block shared types
    index/
      schema.ts             # SQLite DDL statements
      indexer.ts            # diffs PageTreeState against SQLite, applies writes
      indexer.test.ts
    commit/
      commitBuilder.ts      # block edits -> encrypted NIP-34 patch event templates
      commitBuilder.test.ts
    store/
      repoStore.ts          # wraps applesauce EventStore/RelayPool subscriptions
      repoStore.test.ts
    publish/
      publisher.ts          # signs (NIP-07/46) + publishes via nostr-tools/applesauce
      publisher.test.ts
```

Files are grouped by responsibility (crypto, repo-state, indexing, commit-building, store, publishing) so each can be understood, tested, and changed independently. `types.ts` holds the shared `Patch`/`PageTreeState`/`Page`/`Block` shapes that `repoReducer`, `indexer`, and `commitBuilder` all depend on — defining it once up front avoids drift between modules.

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`
- Create: `vitest.config.ts`

- [ ] **Step 1: Scaffold a Vite + React + TypeScript project**

Run:
```bash
npm create vite@latest . -- --template react-ts
```
When prompted about the non-empty directory (LICENSE, README.md, docs/ exist), choose to continue / ignore existing files.

- [ ] **Step 2: Install dependencies**

Run:
```bash
npm install
npm install nostr-tools applesauce-core applesauce-relay applesauce-loaders sql.js
npm install -D vitest @vitest/ui jsdom @types/sql.js
```

- [ ] **Step 3: Add a Vitest config**

Create `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
```

- [ ] **Step 4: Add a test script to package.json**

Modify `package.json` — add to the `"scripts"` section:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Verify the scaffold builds and tests run**

Run: `npm run build && npm test`
Expected: build succeeds; `npm test` reports "No test files found" (no failures) — confirms Vitest is wired up correctly.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React + TypeScript project with Vitest"
```

---

## Task 2: Shared Repo Types

**Files:**
- Create: `src/storage/repo/types.ts`

- [ ] **Step 1: Define the shared data shapes**

Create `src/storage/repo/types.ts`:
```typescript
export interface Block {
  id: string
  type: string
  parentBlockId: string | null
  order: number
  content: Record<string, unknown>
  updatedAt: number
}

export interface Page {
  id: string
  title: string
  parentId: string | null
  order: number
  blocks: Block[]
  updatedAt: number
}

export interface PageTreeState {
  pages: Record<string, Page>
}

/** A decrypted NIP-34 patch applied to one page file. */
export interface Patch {
  id: string
  pageId: string
  /** Full replacement content for pages/<pageId>.json after this patch. */
  page: Page
  createdAt: number
}
```

- [ ] **Step 2: Commit**

```bash
git add src/storage/repo/types.ts
git commit -m "feat(storage): define shared repo types (Block, Page, PageTreeState, Patch)"
```

---

## Task 3: CryptoBox — CEK Generation and Wrap/Unwrap

**Files:**
- Create: `src/storage/crypto/cryptoBox.ts`
- Test: `src/storage/crypto/cryptoBox.test.ts`

- [ ] **Step 1: Write the failing test for CEK generation and wrap/unwrap round-trip**

Create `src/storage/crypto/cryptoBox.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import { generateCEK, wrapCEK, unwrapCEK } from './cryptoBox'

describe('CEK wrap/unwrap', () => {
  it('round-trips a CEK wrapped for a recipient and unwrapped by them', () => {
    const ownerSk = generateSecretKey()
    const recipientSk = generateSecretKey()
    const recipientPk = getPublicKey(recipientSk)

    const cek = generateCEK()
    const wrapped = wrapCEK(cek, ownerSk, recipientPk)

    const ownerPk = getPublicKey(ownerSk)
    const unwrapped = unwrapCEK(wrapped, recipientSk, ownerPk)

    expect(unwrapped).toEqual(cek)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- cryptoBox`
Expected: FAIL with "Failed to resolve import './cryptoBox'" or "generateCEK is not a function"

- [ ] **Step 3: Implement CEK generation and wrap/unwrap**

Create `src/storage/crypto/cryptoBox.ts`:
```typescript
import { getConversationKey, encrypt, decrypt } from 'nostr-tools/nip44'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'

/** A workspace's symmetric content-encryption key, as raw bytes. */
export type CEK = Uint8Array

const CEK_BYTE_LENGTH = 32

export function generateCEK(): CEK {
  return crypto.getRandomValues(new Uint8Array(CEK_BYTE_LENGTH))
}

/**
 * Wraps a CEK for a recipient using a NIP-44 conversation key derived from
 * the owner's secret key and the recipient's public key. The result is a
 * ciphertext string safe to publish in a permission event.
 */
export function wrapCEK(cek: CEK, ownerSecretKey: Uint8Array, recipientPubkey: string): string {
  const conversationKey = getConversationKey(ownerSecretKey, recipientPubkey)
  return encrypt(bytesToHex(cek), conversationKey)
}

/**
 * Unwraps a CEK that was wrapped for `recipientSecretKey` by `ownerPubkey`.
 */
export function unwrapCEK(wrapped: string, recipientSecretKey: Uint8Array, ownerPubkey: string): CEK {
  const conversationKey = getConversationKey(recipientSecretKey, ownerPubkey)
  const hex = decrypt(wrapped, conversationKey)
  return hexToBytes(hex)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- cryptoBox`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/storage/crypto/cryptoBox.ts src/storage/crypto/cryptoBox.test.ts
git commit -m "feat(crypto): add CEK generation and NIP-44 wrap/unwrap"
```

---

## Task 4: CryptoBox — Content Encryption/Decryption

**Files:**
- Modify: `src/storage/crypto/cryptoBox.ts`
- Test: `src/storage/crypto/cryptoBox.test.ts`

- [ ] **Step 1: Write the failing test for content encrypt/decrypt round-trip**

Modify `src/storage/crypto/cryptoBox.test.ts` — add:
```typescript
import { encryptContent, decryptContent } from './cryptoBox'

describe('content encryption', () => {
  it('round-trips JSON content through encryptContent/decryptContent', () => {
    const cek = generateCEK()
    const page = { id: 'page-1', title: 'Hello', blocks: [] }

    const ciphertext = encryptContent(JSON.stringify(page), cek)
    expect(ciphertext).not.toContain('Hello')

    const plaintext = decryptContent(ciphertext, cek)
    expect(JSON.parse(plaintext)).toEqual(page)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- cryptoBox`
Expected: FAIL with "encryptContent is not a function"

- [ ] **Step 3: Implement symmetric content encryption using the CEK as a NIP-44 conversation key**

Modify `src/storage/crypto/cryptoBox.ts` — append:
```typescript
import { encrypt as nip44Encrypt, decrypt as nip44Decrypt } from 'nostr-tools/nip44'

/**
 * Encrypts plaintext page/block JSON with the workspace CEK. NIP-44's
 * `encrypt`/`decrypt` accept any 32-byte conversation key, so the CEK is
 * used directly rather than deriving one from a pubkey pair.
 */
export function encryptContent(plaintext: string, cek: CEK): string {
  return nip44Encrypt(plaintext, cek)
}

export function decryptContent(ciphertext: string, cek: CEK): string {
  return nip44Decrypt(ciphertext, cek)
}
```

Note: remove the now-duplicated `encrypt`/`decrypt` import at the top of the file (from Step 3 of Task 3) and consolidate into a single `import { getConversationKey, encrypt as nip44Encrypt, decrypt as nip44Decrypt } from 'nostr-tools/nip44'`, updating `wrapCEK`/`unwrapCEK` to use the aliased names.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- cryptoBox`
Expected: PASS (both CEK wrap/unwrap and content encryption tests)

- [ ] **Step 5: Commit**

```bash
git add src/storage/crypto/cryptoBox.ts src/storage/crypto/cryptoBox.test.ts
git commit -m "feat(crypto): add symmetric content encryption using workspace CEK"
```

---

## Task 5: RepoReducer — Apply a Single Patch

**Files:**
- Create: `src/storage/repo/repoReducer.ts`
- Test: `src/storage/repo/repoReducer.test.ts`

- [ ] **Step 1: Write the failing test for applying one patch to empty state**

Create `src/storage/repo/repoReducer.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { reduceRepo } from './repoReducer'
import type { Patch, PageTreeState } from './types'

const emptyState: PageTreeState = { pages: {} }

function makePatch(overrides: Partial<Patch> = {}): Patch {
  return {
    id: 'patch-1',
    pageId: 'page-1',
    createdAt: 1000,
    page: {
      id: 'page-1',
      title: 'My Page',
      parentId: null,
      order: 0,
      blocks: [],
      updatedAt: 1000,
    },
    ...overrides,
  }
}

describe('reduceRepo', () => {
  it('adds a page from a single patch applied to empty state', () => {
    const patch = makePatch()
    const state = reduceRepo(emptyState, [patch])

    expect(state.pages['page-1']).toEqual(patch.page)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- repoReducer`
Expected: FAIL with "Failed to resolve import './repoReducer'"

- [ ] **Step 3: Implement reduceRepo for the single-patch case**

Create `src/storage/repo/repoReducer.ts`:
```typescript
import type { Patch, PageTreeState } from './types'

/**
 * Pure reduction of an ordered sequence of decrypted patches into the
 * current page-tree state. Conflicting patches to the same page are
 * resolved with last-write-wins by `createdAt` (see Task 6).
 */
export function reduceRepo(initial: PageTreeState, patches: Patch[]): PageTreeState {
  const pages = { ...initial.pages }

  for (const patch of patches) {
    pages[patch.pageId] = patch.page
  }

  return { pages }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- repoReducer`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/storage/repo/repoReducer.ts src/storage/repo/repoReducer.test.ts
git commit -m "feat(repo): add reduceRepo for applying a single patch to page-tree state"
```

---

## Task 6: RepoReducer — Last-Write-Wins Conflict Resolution

**Files:**
- Modify: `src/storage/repo/repoReducer.ts`
- Test: `src/storage/repo/repoReducer.test.ts`

- [ ] **Step 1: Write the failing test for conflicting patches to the same page**

Modify `src/storage/repo/repoReducer.test.ts` — add:
```typescript
describe('reduceRepo conflict resolution', () => {
  it('keeps the patch with the later createdAt when two patches touch the same page', () => {
    const older = makePatch({
      id: 'patch-old',
      createdAt: 1000,
      page: { id: 'page-1', title: 'Older title', parentId: null, order: 0, blocks: [], updatedAt: 1000 },
    })
    const newer = makePatch({
      id: 'patch-new',
      createdAt: 2000,
      page: { id: 'page-1', title: 'Newer title', parentId: null, order: 0, blocks: [], updatedAt: 2000 },
    })

    // Order shouldn't matter — apply newer first, then older.
    const state = reduceRepo(emptyState, [newer, older])

    expect(state.pages['page-1'].title).toBe('Newer title')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- repoReducer`
Expected: FAIL — `state.pages['page-1'].title` is `'Older title'` because the current implementation just applies patches in array order

- [ ] **Step 3: Implement last-write-wins by comparing createdAt**

Modify `src/storage/repo/repoReducer.ts` — replace the loop body:
```typescript
export function reduceRepo(initial: PageTreeState, patches: Patch[]): PageTreeState {
  const pages = { ...initial.pages }

  for (const patch of patches) {
    const existing = pages[patch.pageId]
    if (!existing || patch.page.updatedAt >= existing.updatedAt) {
      pages[patch.pageId] = patch.page
    }
  }

  return { pages }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- repoReducer`
Expected: PASS (both tests)

- [ ] **Step 5: Commit**

```bash
git add src/storage/repo/repoReducer.ts src/storage/repo/repoReducer.test.ts
git commit -m "feat(repo): resolve conflicting patches with last-write-wins by updatedAt"
```

---

## Task 7: SQLite Schema

**Files:**
- Create: `src/storage/index/schema.ts`
- Test: `src/storage/index/schema.test.ts`

- [ ] **Step 1: Write the failing test that creates the schema in an in-memory database**

Create `src/storage/index/schema.test.ts`:
```typescript
import { describe, it, expect, beforeAll } from 'vitest'
import initSqlJs, { type Database } from 'sql.js'
import { CREATE_SCHEMA_SQL } from './schema'

let db: Database

beforeAll(async () => {
  const SQL = await initSqlJs()
  db = new SQL.Database()
  db.run(CREATE_SCHEMA_SQL)
})

describe('schema', () => {
  it('creates the expected tables', () => {
    const result = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    const tableNames = result[0].values.map((row) => row[0])

    expect(tableNames).toEqual(['blocks', 'db_properties', 'db_rows', 'pages', 'sync_state'])
  })

  it('allows inserting and querying a page row', () => {
    db.run(
      'INSERT INTO pages (id, title, parent_id, order_index, updated_at) VALUES (?, ?, ?, ?, ?)',
      ['page-1', 'My Page', null, 0, 1000]
    )

    const result = db.exec('SELECT title FROM pages WHERE id = ?', ['page-1'])
    expect(result[0].values[0][0]).toBe('My Page')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- schema`
Expected: FAIL with "Failed to resolve import './schema'"

- [ ] **Step 3: Implement the schema DDL**

Create `src/storage/index/schema.ts`:
```typescript
/**
 * DDL for the derived SQLite index. This database is fully rebuildable from
 * the workspace's Nostr/Git repo — it can be dropped and recreated at any
 * time by replaying decrypted patches through the indexer.
 *
 * Note: `order` and `database_block_id` columns avoid SQL reserved words by
 * using `order_index` and table-prefixed names.
 */
export const CREATE_SCHEMA_SQL = `
CREATE TABLE pages (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  parent_id TEXT,
  order_index INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE blocks (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL REFERENCES pages(id),
  parent_block_id TEXT,
  type TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  content_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE db_properties (
  database_block_id TEXT NOT NULL REFERENCES blocks(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  config_json TEXT NOT NULL,
  PRIMARY KEY (database_block_id, name)
);

CREATE TABLE db_rows (
  id TEXT PRIMARY KEY,
  database_block_id TEXT NOT NULL REFERENCES blocks(id),
  properties_json TEXT NOT NULL
);

CREATE TABLE sync_state (
  workspace_id TEXT PRIMARY KEY,
  last_event_id TEXT,
  last_seen_at INTEGER NOT NULL
);

CREATE INDEX idx_blocks_page_id ON blocks(page_id);
CREATE INDEX idx_db_rows_database_block_id ON db_rows(database_block_id);
`
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- schema`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/storage/index/schema.ts src/storage/index/schema.test.ts
git commit -m "feat(index): add SQLite schema for the derived relational index"
```

---

## Task 8: Indexer — Insert New Pages and Blocks

**Files:**
- Create: `src/storage/index/indexer.ts`
- Test: `src/storage/index/indexer.test.ts`

- [ ] **Step 1: Write the failing test for indexing a fresh page with blocks**

Create `src/storage/index/indexer.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import initSqlJs, { type Database } from 'sql.js'
import { CREATE_SCHEMA_SQL } from './schema'
import { applyStateToIndex } from './indexer'
import type { PageTreeState } from '../repo/types'

let db: Database

beforeEach(async () => {
  const SQL = await initSqlJs()
  db = new SQL.Database()
  db.run(CREATE_SCHEMA_SQL)
})

function rows(sql: string, params: unknown[] = []): unknown[][] {
  const result = db.exec(sql, params as any)
  return result.length ? result[0].values : []
}

describe('applyStateToIndex', () => {
  it('inserts a new page and its blocks into SQLite', () => {
    const state: PageTreeState = {
      pages: {
        'page-1': {
          id: 'page-1',
          title: 'My Page',
          parentId: null,
          order: 0,
          updatedAt: 1000,
          blocks: [
            { id: 'block-1', type: 'paragraph', parentBlockId: null, order: 0, content: { text: 'Hi' }, updatedAt: 1000 },
          ],
        },
      },
    }

    applyStateToIndex(db, state)

    expect(rows('SELECT title FROM pages WHERE id = ?', ['page-1'])).toEqual([['My Page']])
    expect(rows('SELECT type FROM blocks WHERE id = ?', ['block-1'])).toEqual([['paragraph']])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- indexer`
Expected: FAIL with "Failed to resolve import './indexer'"

- [ ] **Step 3: Implement applyStateToIndex for the insert case (replace-on-conflict)**

Create `src/storage/index/indexer.ts`:
```typescript
import type { Database } from 'sql.js'
import type { PageTreeState } from '../repo/types'

/**
 * Applies the current page-tree state to the SQLite index. Uses
 * INSERT OR REPLACE so this function is idempotent: re-running it with the
 * same state (e.g. after a full rebuild) produces the same rows, and running
 * it incrementally with updated pages overwrites stale rows.
 *
 * Deletions (pages/blocks removed from state) are handled in Task 9.
 */
export function applyStateToIndex(db: Database, state: PageTreeState): void {
  for (const page of Object.values(state.pages)) {
    db.run(
      `INSERT OR REPLACE INTO pages (id, title, parent_id, order_index, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [page.id, page.title, page.parentId, page.order, page.updatedAt]
    )

    for (const block of page.blocks) {
      db.run(
        `INSERT OR REPLACE INTO blocks
           (id, page_id, parent_block_id, type, order_index, content_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          block.id,
          page.id,
          block.parentBlockId,
          block.type,
          block.order,
          JSON.stringify(block.content),
          block.updatedAt,
        ]
      )
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- indexer`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/storage/index/indexer.ts src/storage/index/indexer.test.ts
git commit -m "feat(index): index pages and blocks from page-tree state into SQLite"
```

---

## Task 9: Indexer — Remove Stale Blocks on Re-index

**Files:**
- Modify: `src/storage/index/indexer.ts`
- Test: `src/storage/index/indexer.test.ts`

- [ ] **Step 1: Write the failing test for a block removed between indexing runs**

Modify `src/storage/index/indexer.test.ts` — add:
```typescript
describe('applyStateToIndex re-indexing', () => {
  it('removes blocks that no longer exist in the page when re-indexed', () => {
    const withTwoBlocks: PageTreeState = {
      pages: {
        'page-1': {
          id: 'page-1',
          title: 'My Page',
          parentId: null,
          order: 0,
          updatedAt: 1000,
          blocks: [
            { id: 'block-1', type: 'paragraph', parentBlockId: null, order: 0, content: {}, updatedAt: 1000 },
            { id: 'block-2', type: 'paragraph', parentBlockId: null, order: 1, content: {}, updatedAt: 1000 },
          ],
        },
      },
    }
    applyStateToIndex(db, withTwoBlocks)

    const withOneBlock: PageTreeState = {
      pages: {
        'page-1': {
          ...withTwoBlocks.pages['page-1'],
          updatedAt: 2000,
          blocks: [withTwoBlocks.pages['page-1'].blocks[0]],
        },
      },
    }
    applyStateToIndex(db, withOneBlock)

    expect(rows('SELECT id FROM blocks WHERE page_id = ?', ['page-1'])).toEqual([['block-1']])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- indexer`
Expected: FAIL — `block-2` is still present because nothing deletes stale rows

- [ ] **Step 3: Delete blocks not present in the incoming state for each re-indexed page**

Modify `src/storage/index/indexer.ts` — inside the `for (const page of ...)` loop, after upserting the page row and before the inner block loop, add:
```typescript
    const currentBlockIds = page.blocks.map((b) => b.id)
    if (currentBlockIds.length === 0) {
      db.run('DELETE FROM blocks WHERE page_id = ?', [page.id])
    } else {
      const placeholders = currentBlockIds.map(() => '?').join(', ')
      db.run(
        `DELETE FROM blocks WHERE page_id = ? AND id NOT IN (${placeholders})`,
        [page.id, ...currentBlockIds]
      )
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- indexer`
Expected: PASS (both tests)

- [ ] **Step 5: Commit**

```bash
git add src/storage/index/indexer.ts src/storage/index/indexer.test.ts
git commit -m "feat(index): remove stale blocks from SQLite when pages are re-indexed"
```

---

## Task 10: CommitBuilder — Build an Encrypted Patch Event Template

**Files:**
- Create: `src/storage/commit/commitBuilder.ts`
- Test: `src/storage/commit/commitBuilder.test.ts`

- [ ] **Step 1: Write the failing test for building a patch event template from a page**

Create `src/storage/commit/commitBuilder.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { buildPatchEventTemplate } from './commitBuilder'
import { generateCEK, decryptContent } from '../crypto/cryptoBox'
import type { Page } from '../repo/types'

describe('buildPatchEventTemplate', () => {
  it('produces a kind 1617 NIP-34 patch event template with encrypted content', () => {
    const cek = generateCEK()
    const page: Page = {
      id: 'page-1',
      title: 'My Page',
      parentId: null,
      order: 0,
      updatedAt: 1234,
      blocks: [],
    }

    const template = buildPatchEventTemplate({
      page,
      repoId: 'workspace-repo',
      cek,
      createdAt: 5000,
    })

    expect(template.kind).toBe(1617)
    expect(template.created_at).toBe(5000)
    expect(template.tags).toContainEqual(['a', `30617:workspace-repo`])
    expect(template.tags).toContainEqual(['file', 'pages/page-1.json'])

    // Content is ciphertext, not plaintext — but decrypts back to the page JSON.
    expect(template.content).not.toContain('My Page')
    expect(JSON.parse(decryptContent(template.content, cek))).toEqual(page)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- commitBuilder`
Expected: FAIL with "Failed to resolve import './commitBuilder'"

- [ ] **Step 3: Implement buildPatchEventTemplate**

Create `src/storage/commit/commitBuilder.ts`:
```typescript
import type { EventTemplate } from 'nostr-tools/pure'
import { encryptContent, type CEK } from '../crypto/cryptoBox'
import type { Page } from '../repo/types'

export interface BuildPatchOptions {
  page: Page
  /** The repo's `d` tag identifier, as announced in its kind 30617 event. */
  repoId: string
  cek: CEK
  createdAt: number
}

/**
 * Builds an unsigned NIP-34 patch event template (kind 1617) whose content is
 * the workspace page JSON encrypted with the CEK. The `a` tag references the
 * repo announcement (kind 30617) and the `file` tag identifies which page
 * file this patch updates — both are how a Repo Reducer locates and decrypts
 * the relevant content for a given page.
 *
 * Returns a template (no id/pubkey/sig) so the Publisher can sign it with
 * whichever signer (NIP-07/NIP-46) the user has configured.
 */
export function buildPatchEventTemplate(options: BuildPatchOptions): EventTemplate {
  const { page, repoId, cek, createdAt } = options
  const ciphertext = encryptContent(JSON.stringify(page), cek)

  return {
    kind: 1617,
    created_at: createdAt,
    tags: [
      ['a', `30617:${repoId}`],
      ['file', `pages/${page.id}.json`],
    ],
    content: ciphertext,
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- commitBuilder`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/storage/commit/commitBuilder.ts src/storage/commit/commitBuilder.test.ts
git commit -m "feat(commit): build encrypted NIP-34 patch event templates from page edits"
```

---

## Task 11: RepoStore — Reactive Subscription to Workspace Patches

**Files:**
- Create: `src/storage/store/repoStore.ts`
- Test: `src/storage/store/repoStore.test.ts`

- [ ] **Step 1: Write the failing test using an in-memory EventStore (no real relay)**

Create `src/storage/store/repoStore.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { EventStore } from 'applesauce-core'
import { finalizeEvent, generateSecretKey } from 'nostr-tools/pure'
import { createRepoStore } from './repoStore'

describe('createRepoStore', () => {
  it('emits patch events for a given repo as they are added to the event store', async () => {
    const eventStore = new EventStore()
    const repoStore = createRepoStore(eventStore, { repoId: 'workspace-repo' })

    const received: string[] = []
    repoStore.patches$.subscribe((event) => received.push(event.id))

    const sk = generateSecretKey()
    const matching = finalizeEvent(
      { kind: 1617, created_at: 1000, tags: [['a', '30617:workspace-repo']], content: 'cipher-a' },
      sk
    )
    const nonMatching = finalizeEvent(
      { kind: 1617, created_at: 1000, tags: [['a', '30617:other-repo']], content: 'cipher-b' },
      sk
    )

    eventStore.add(matching)
    eventStore.add(nonMatching)

    expect(received).toEqual([matching.id])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- repoStore`
Expected: FAIL with "Failed to resolve import './repoStore'"

- [ ] **Step 3: Implement createRepoStore using EventStore.filters**

Create `src/storage/store/repoStore.ts`:
```typescript
import type { EventStore } from 'applesauce-core'
import type { Observable } from 'rxjs'
import type { NostrEvent } from 'nostr-tools/pure'

export interface RepoStoreOptions {
  /** The repo's `d` tag identifier, as referenced in patch `a` tags. */
  repoId: string
}

export interface RepoStore {
  /** Emits NIP-34 patch events (kind 1617) belonging to this repo, live. */
  patches$: Observable<NostrEvent>
}

/**
 * Wraps an applesauce EventStore with a reactive subscription scoped to one
 * workspace repo's patch events. This is the only module the rest of the
 * persistence layer uses to observe incoming Nostr events — it isolates
 * applesauce's API so it can be swapped or extended (e.g. to also watch
 * permission/state events) without touching consumers.
 */
export function createRepoStore(eventStore: EventStore, options: RepoStoreOptions): RepoStore {
  const repoTag = `30617:${options.repoId}`

  const patches$ = eventStore.filters({ kinds: [1617], '#a': [repoTag] })

  return { patches$ }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- repoStore`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/storage/store/repoStore.ts src/storage/store/repoStore.test.ts
git commit -m "feat(store): add RepoStore wrapping applesauce EventStore for repo patch subscriptions"
```

---

## Task 12: Publisher — Sign and Publish Patch Events

**Files:**
- Create: `src/storage/publish/publisher.ts`
- Test: `src/storage/publish/publisher.test.ts`

- [ ] **Step 1: Write the failing test using a fake signer and a fake relay pool**

Create `src/storage/publish/publisher.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { generateSecretKey, finalizeEvent, type EventTemplate } from 'nostr-tools/pure'
import { publishPatch, type Signer, type RelayPublisher } from './publisher'

describe('publishPatch', () => {
  it('signs the template with the provided signer and publishes to all relays', async () => {
    const sk = generateSecretKey()
    const signer: Signer = {
      signEvent: async (template: EventTemplate) => finalizeEvent(template, sk),
    }

    const published: { url: string; eventId: string }[] = []
    const relayPublisher: RelayPublisher = {
      publish: vi.fn(async (url: string, event) => {
        published.push({ url, eventId: event.id })
      }),
    }

    const template: EventTemplate = {
      kind: 1617,
      created_at: 1000,
      tags: [['a', '30617:workspace-repo']],
      content: 'cipher',
    }

    const signed = await publishPatch(template, signer, relayPublisher, ['wss://relay-a', 'wss://relay-b'])

    expect(signed.id).toBeTruthy()
    expect(published).toEqual([
      { url: 'wss://relay-a', eventId: signed.id },
      { url: 'wss://relay-b', eventId: signed.id },
    ])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- publisher`
Expected: FAIL with "Failed to resolve import './publisher'"

- [ ] **Step 3: Implement publishPatch against Signer/RelayPublisher interfaces**

Create `src/storage/publish/publisher.ts`:
```typescript
import type { EventTemplate, NostrEvent } from 'nostr-tools/pure'

/**
 * Abstraction over NIP-07/NIP-46 signers: both expose an async `signEvent`
 * that takes an unsigned template and returns a signed event. Depending on
 * this interface (rather than a concrete signer) lets the Publisher work
 * with either without knowing which the user has configured.
 */
export interface Signer {
  signEvent(template: EventTemplate): Promise<NostrEvent>
}

/** Abstraction over relay publishing so tests can avoid real network I/O. */
export interface RelayPublisher {
  publish(relayUrl: string, event: NostrEvent): Promise<void>
}

/**
 * Signs a patch event template and publishes it to every given relay.
 * Returns the signed event so callers (e.g. the write path's optimistic
 * local insert) can add it to the local EventStore immediately.
 */
export async function publishPatch(
  template: EventTemplate,
  signer: Signer,
  relayPublisher: RelayPublisher,
  relayUrls: string[]
): Promise<NostrEvent> {
  const signed = await signer.signEvent(template)

  for (const url of relayUrls) {
    await relayPublisher.publish(url, signed)
  }

  return signed
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- publisher`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/storage/publish/publisher.ts src/storage/publish/publisher.test.ts
git commit -m "feat(publish): add Publisher signing and publishing patches via Signer/RelayPublisher interfaces"
```

---

## Task 13: End-to-End Convergence Test

**Files:**
- Create: `src/storage/storage.e2e.test.ts`

- [ ] **Step 1: Write a failing end-to-end test that wires all modules together**

Create `src/storage/storage.e2e.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import initSqlJs, { type Database } from 'sql.js'
import { EventStore } from 'applesauce-core'
import { generateSecretKey, finalizeEvent } from 'nostr-tools/pure'
import { CREATE_SCHEMA_SQL } from './index/schema'
import { applyStateToIndex } from './index/indexer'
import { reduceRepo } from './repo/repoReducer'
import { createRepoStore } from './store/repoStore'
import { buildPatchEventTemplate } from './commit/commitBuilder'
import { generateCEK, decryptContent } from './crypto/cryptoBox'
import type { Patch, PageTreeState } from './repo/types'
import type { Page } from './repo/types'

let db: Database

beforeEach(async () => {
  const SQL = await initSqlJs()
  db = new SQL.Database()
  db.run(CREATE_SCHEMA_SQL)
})

function rows(sql: string, params: unknown[] = []): unknown[][] {
  const result = db.exec(sql, params as any)
  return result.length ? result[0].values : []
}

describe('storage layer end-to-end', () => {
  it('takes a page edit through commit, publish, sync, reduce, and index — converging in SQLite', () => {
    const cek = generateCEK()
    const sk = generateSecretKey()
    const eventStore = new EventStore()
    const repoStore = createRepoStore(eventStore, { repoId: 'workspace-repo' })

    // Collect decrypted patches as they arrive via the repo store.
    const patches: Patch[] = []
    repoStore.patches$.subscribe((event) => {
      const page = JSON.parse(decryptContent(event.content, cek)) as Page
      patches.push({ id: event.id, pageId: page.id, page, createdAt: event.created_at })
    })

    // 1. Build and "publish" (here: directly finalize + add to the store,
    //    simulating a relay echo without real network I/O).
    const page: Page = {
      id: 'page-1',
      title: 'Converged Page',
      parentId: null,
      order: 0,
      updatedAt: 1000,
      blocks: [
        { id: 'block-1', type: 'paragraph', parentBlockId: null, order: 0, content: { text: 'hi' }, updatedAt: 1000 },
      ],
    }
    const template = buildPatchEventTemplate({ page, repoId: 'workspace-repo', cek, createdAt: 1000 })
    const signed = finalizeEvent(template, sk)
    eventStore.add(signed)

    // 2. Reduce the received patches into page-tree state.
    const state: PageTreeState = reduceRepo({ pages: {} }, patches)

    // 3. Index the resulting state into SQLite.
    applyStateToIndex(db, state)

    // 4. Assert convergence: the SQL index reflects the original page.
    expect(rows('SELECT title FROM pages WHERE id = ?', ['page-1'])).toEqual([['Converged Page']])
    expect(rows('SELECT type, content_json FROM blocks WHERE id = ?', ['block-1'])).toEqual([
      ['paragraph', JSON.stringify({ text: 'hi' })],
    ])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails (or passes — diagnose either outcome)**

Run: `npm test -- storage.e2e`
Expected: PASS if all prior modules are wired correctly, since each piece was already tested individually. If it FAILS, the failure will point to a mismatch between modules (e.g. a type or field name that drifted between tasks) — fix the mismatch in the relevant module rather than in this test.

- [ ] **Step 3: Run the full test suite to confirm nothing regressed**

Run: `npm test`
Expected: All test files PASS

- [ ] **Step 4: Commit**

```bash
git add src/storage/storage.e2e.test.ts
git commit -m "test(storage): add end-to-end convergence test across commit/publish/sync/index pipeline"
```

---

## Task 14: Update CLAUDE.md / Project Docs

**Files:**
- Create: `CLAUDE.md`

- [ ] **Step 1: Document the storage layer for future contributors**

Create `CLAUDE.md`:
```markdown
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm install` — install dependencies
- `npm run dev` — start the Vite dev server
- `npm run build` — production build
- `npm test` — run the test suite once (Vitest)
- `npm test -- <pattern>` — run tests matching a filename pattern, e.g. `npm test -- repoReducer`
- `npm run test:watch` — run tests in watch mode

## Architecture

Grid34 is a decentralized, local-first, Notion-like workspace. It is split into
three subsystems, each with its own design spec under `docs/superpowers/specs/`:

1. **Storage/persistence layer** (`src/storage/`) — workspace content is
   modeled as an encrypted NIP-34 Git-over-Nostr repo (source of truth) and
   mirrored into a derived, queryable SQLite index (via `sql.js`). See
   `docs/superpowers/specs/2026-06-08-storage-persistence-layer-design.md`.
   - `crypto/` — CEK generation and NIP-44 wrap/unwrap/content encryption
   - `repo/` — pure reduction of patch sequences into page-tree state
     (last-write-wins conflict resolution)
   - `index/` — SQLite schema and the indexer that mirrors page-tree state
     into it (fully rebuildable from the repo)
   - `commit/` — turns local edits into encrypted NIP-34 patch event templates
   - `store/` — reactive subscriptions to a workspace repo's events, wrapping
     `applesauce-core`'s `EventStore`
   - `publish/` — signs (via NIP-07/NIP-46 `Signer`) and publishes events to
     relays
2. **Editor UI** — not yet implemented.
3. **Real-time collaboration (libp2p)** — not yet implemented; will produce
   debounced "checkpoint" commits consumed by the storage layer's commit path.

Each storage module is independently unit-tested; `src/storage/storage.e2e.test.ts`
verifies the full commit → publish → sync → reduce → index pipeline converges.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add CLAUDE.md describing storage layer architecture and commands"
```

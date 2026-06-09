import { BehaviorSubject, Observable } from 'rxjs'
import { EventStore } from 'applesauce-core'
import { SimplePool } from 'nostr-tools/pool'
import { finalizeEvent, generateSecretKey, type EventTemplate, type NostrEvent } from 'nostr-tools/pure'
import { createDraftStore, type DraftRepoStore, type DraftStore } from '../editor/stores/draftStore'
import { createLiveDraftStore } from '../collab/integration/liveDraftStore'
import type { DbViewStore } from '../editor/stores/dbViewStore'
import { createDbViewStore } from '../editor/stores/dbViewStore'
import { buildPatchEventTemplate } from '../storage/commit/commitBuilder'
import { applyStateToIndex } from '../storage/index/indexer'
import { CREATE_SCHEMA_SQL } from '../storage/index/schema'
import { decryptContent, generateCEK } from '../storage/crypto/cryptoBox'
import { createRevisionHistoryState, recordRevision as recordPageRevision, type RevisionHistoryState } from './revisionHistory'
import { publishPatch as publishToRelays } from '../storage/publish/publisher'
import { reduceRepo } from '../storage/repo/repoReducer'
import type { Page, PageTreeState, Patch } from '../storage/repo/types'
import { createRepoStore } from '../storage/store/repoStore'
import { loadSqlJs } from '../storage/sql/loadSqlJs'
import type { EditorRepoStore, PageRevision } from '../editor/contexts/storeContexts'
import type { ViewSpec } from '../editor/types'

export interface Workspace {
  repoStore: EditorRepoStore & DraftRepoStore
  draftStore: DraftStore
  dbViewStore: DbViewStore
  selectedPageId: string | null
  cek: Uint8Array
  flushDrafts(): Promise<void>
  checkpoint(): Promise<void>
  destroy(): void
}

const WORKSPACE_STATE_KEY = 'grid34_workspace_state'
const WORKSPACE_SIGNING_KEY = 'grid34_workspace_signing_key'
const WORKSPACE_DB_ROWS_KEY = 'grid34_workspace_db_rows'
const LEGACY_PAGES_KEY = 'grid34_pages'

type DatabaseRowsState = Record<string, Record<string, Record<string, unknown>>>

function createDefaultWorkspaceState(): PageTreeState {
  return {
    pages: {
      'page-1': {
        id: 'page-1',
        title: 'Workspace',
        parentId: null,
        order: 0,
        updatedAt: 1000,
        blocks: [
          {
            id: 'block-1',
            type: 'heading',
            parentBlockId: null,
            order: 0,
            content: { text: 'Workspace', level: 1 },
            updatedAt: 1000,
          },
          {
            id: 'block-2',
            type: 'paragraph',
            parentBlockId: null,
            order: 1,
            content: { text: 'This workspace is backed by the repo store, SQL index, and live relay publishing.' },
            updatedAt: 1000,
          },
          {
            id: 'block-3',
            type: 'database',
            parentBlockId: null,
            order: 2,
            content: {
              databaseId: 'db-1',
              columns: ['name', 'qty'],
              rowEdits: {},
            } satisfies ViewSpec & { rowEdits: Record<string, Record<string, unknown>> },
            updatedAt: 1000,
          },
        ],
      },
      'page-2': {
        id: 'page-2',
        title: 'Notes',
        parentId: 'page-1',
        order: 0,
        updatedAt: 1000,
        blocks: [
          {
            id: 'block-4',
            type: 'paragraph',
            parentBlockId: null,
            order: 0,
            content: { text: 'Child page for tree navigation.' },
            updatedAt: 1000,
          },
        ],
      },
    },
  }
}

function createDefaultDatabaseRows(): DatabaseRowsState {
  return {
    'db-1': {
      'row-1': { name: 'Apples', qty: 3 },
      'row-2': { name: 'Bananas', qty: 5 },
    },
  }
}

function bytesToJson(bytes: Uint8Array): string {
  return JSON.stringify(Array.from(bytes))
}

function jsonToBytes(raw: string): Uint8Array {
  const parsed = JSON.parse(raw) as number[]
  return new Uint8Array(parsed)
}

function loadBytes(key: string, generator: () => Uint8Array): Uint8Array {
  const stored = localStorage.getItem(key)
  if (stored) {
    try {
      return jsonToBytes(stored)
    } catch {
      // Fall through to regenerate.
    }
  }

  const next = generator()
  localStorage.setItem(key, bytesToJson(next))
  return next
}

function loadInitialState(stateKey: string, legacyPagesKey: string, isDefaultRepo: boolean): PageTreeState {
  const cached = localStorage.getItem(stateKey)
  if (cached) {
    try {
      return JSON.parse(cached) as PageTreeState
    } catch {
      // Fall through to legacy/demo cache migration.
    }
  }

  const legacy = localStorage.getItem(legacyPagesKey)
  if (legacy) {
    try {
      return { pages: JSON.parse(legacy) as Record<string, Page> }
    } catch {
      // Ignore invalid legacy cache.
    }
  }

  if (!isDefaultRepo) {
    return { pages: {} }
  }

  return createDefaultWorkspaceState()
}

function loadInitialDatabaseRows(dbRowsKey: string, isDefaultRepo: boolean): DatabaseRowsState {
  const cached = localStorage.getItem(dbRowsKey)
  if (cached) {
    try {
      return JSON.parse(cached) as DatabaseRowsState
    } catch {
      // Ignore invalid cache and rebuild from defaults.
    }
  }

  if (!isDefaultRepo) {
    return {}
  }

  return createDefaultDatabaseRows()
}

function persistState(state: PageTreeState, stateKey: string, legacyPagesKey: string): void {
  localStorage.setItem(stateKey, JSON.stringify(state))
  localStorage.setItem(legacyPagesKey, JSON.stringify(state.pages))
}

function persistDatabaseRows(rows: DatabaseRowsState, dbRowsKey: string): void {
  localStorage.setItem(dbRowsKey, JSON.stringify(rows))
}

function loadRevisionHistory(revisionsKey: string): RevisionHistoryState {
  const cached = localStorage.getItem(revisionsKey)
  if (!cached) return createRevisionHistoryState()

  try {
    return createRevisionHistoryState(JSON.parse(cached) as RevisionHistoryState)
  } catch {
    return createRevisionHistoryState()
  }
}

function persistRevisionHistory(revisions: RevisionHistoryState, revisionsKey: string): void {
  localStorage.setItem(revisionsKey, JSON.stringify(revisions))
}

function selectInitialPageId(state: PageTreeState): string | null {
  const pages = Object.values(state.pages).filter((page) => !page.deleted)
  if (pages.length === 0) return null

  const roots = pages.filter((page) => page.parentId === null).sort((a, b) => a.order - b.order)
  return (roots[0] ?? pages[0])?.id ?? null
}

function createLocalSigner(signingKey: string) {
  const nostr = (globalThis as typeof globalThis & { nostr?: { signEvent?: (template: EventTemplate) => Promise<NostrEvent> } }).nostr
  if (nostr?.signEvent) {
    return {
      signEvent: (template: EventTemplate) => nostr.signEvent!(template),
    }
  }

  const secretKey = loadBytes(signingKey, () => generateSecretKey())
  return {
    signEvent: async (template: EventTemplate) => finalizeEvent(template, secretKey),
  }
}

function syncDatabaseViewRows(db: any, dbViewStore: DbViewStore, databaseRows: DatabaseRowsState, state: PageTreeState, dbRowsKey: string): void {
  const activeDatabaseIds = new Set<string>()

  for (const page of Object.values(state.pages)) {
    if (page.deleted) continue

    for (const block of page.blocks) {
      if (block.type !== 'database') continue

      const viewSpec = block.content as ViewSpec & { rowEdits?: Record<string, Record<string, unknown>> }
      const databaseId =
        typeof viewSpec.databaseId === 'string' && viewSpec.databaseId.trim().length > 0
          ? viewSpec.databaseId
          : block.id
      activeDatabaseIds.add(databaseId)

      const seedRows =
        viewSpec.seedRows && typeof viewSpec.seedRows === 'object' && !Array.isArray(viewSpec.seedRows)
          ? viewSpec.seedRows
          : {}
      const currentRows = { ...(databaseRows[databaseId] ?? seedRows) }
      for (const [rowId, patch] of Object.entries(viewSpec.rowEdits ?? {})) {
        currentRows[rowId] = { ...(currentRows[rowId] ?? {}), ...patch }
      }
      databaseRows[databaseId] = currentRows

      db.run('DELETE FROM db_rows WHERE database_block_id = ?', [databaseId])
      for (const [rowId, values] of Object.entries(currentRows)) {
        db.run(
          'INSERT OR REPLACE INTO db_rows (id, database_block_id, properties_json) VALUES (?, ?, ?)',
          [rowId, databaseId, JSON.stringify(values)]
        )
      }

      dbViewStore.notifyChanged(databaseId)
    }
  }

  for (const databaseId of Object.keys(databaseRows)) {
    if (activeDatabaseIds.has(databaseId)) continue
    db.run('DELETE FROM db_rows WHERE database_block_id = ?', [databaseId])
    delete databaseRows[databaseId]
    dbViewStore.notifyChanged(databaseId)
  }

  persistDatabaseRows(databaseRows, dbRowsKey)
}

function createPageObservation(page: Page): { status: 'ready'; page: Page } {
  return { status: 'ready', page }
}

export async function createWorkspace(): Promise<Workspace> {
  const SQL = await loadSqlJs()
  const db = new SQL.Database()
  db.run(CREATE_SCHEMA_SQL)

  const repoId =
    (typeof window !== 'undefined' && localStorage.getItem('grid34_active_repo_id')) || 'workspace-repo'
  const stateKey = `grid34_state_${repoId}`
  const cekKey = `grid34_cek_${repoId}`
  const signingKey = `grid34_signing_key_${repoId}`
  const dbRowsKey = `grid34_db_rows_${repoId}`
  const legacyPagesKey = `grid34_pages_${repoId}`
  const revisionsKey = `grid34_revisions_${repoId}`

  const cek = loadBytes(cekKey, () => generateCEK())
  const databaseRows = loadInitialDatabaseRows(dbRowsKey, repoId === 'workspace-repo')
  const revisionHistory = loadRevisionHistory(revisionsKey)
  const eventStore = new EventStore()
  eventStore.verifyEvent = undefined
  const repoTag = `30617:${repoId}`
  const repoStoreBase = createRepoStore(eventStore as never, { repoId })
  const stateSubject = new BehaviorSubject<PageTreeState>(loadInitialState(stateKey, legacyPagesKey, repoId === 'workspace-repo'))
  const dbViewStore = createDbViewStore(db)
  const pool = new SimplePool({ enablePing: true, enableReconnect: true })
  const defaultRelays = ['wss://nos.lol', 'wss://relay.damus.io', 'wss://relay.nostr.band']
  let relayUrls = defaultRelays
  if (typeof window !== 'undefined') {
    try {
      const storedRelays = localStorage.getItem('nostr_relays')
      if (storedRelays) {
        const parsed = JSON.parse(storedRelays) as string[]
        if (parsed && parsed.length > 0) {
          relayUrls = Array.from(new Set([...parsed, ...defaultRelays]))
        }
      }
    } catch {}
  }
  const signer = createLocalSigner(signingKey)
  const shouldConnectRelays = typeof window !== 'undefined' && !import.meta.env.VITEST
  let currentState = stateSubject.getValue()
  let destroyed = false

  function recordRevision(page: Page, createdAt: number, id: string, force = false): void {
    const didRecord = recordPageRevision({
      page,
      createdAt,
      id,
      force,
      state: revisionHistory,
    })
    if (didRecord) {
      persistRevisionHistory(revisionHistory, revisionsKey)
    }
  }

  function applyState(nextState: PageTreeState): void {
    currentState = nextState
    stateSubject.next(nextState)
    applyStateToIndex(db, nextState)
    persistState(nextState, stateKey, legacyPagesKey)
    syncDatabaseViewRows(db, dbViewStore, databaseRows, nextState, dbRowsKey)
  }

  applyState(currentState)
  for (const page of Object.values(currentState.pages)) {
    if (page.deleted) continue
    recordRevision(page, page.updatedAt, `seed-${page.id}-${page.updatedAt}`, true)
  }

  const patchSubscription = repoStoreBase.patches$.subscribe((event: any) => {
    if (destroyed) return

    try {
      const page = JSON.parse(decryptContent(event.content, cek)) as Page
      const patch: Patch = {
        id: event.id,
        pageId: page.id,
        page,
        createdAt: event.created_at,
      }
      applyState(reduceRepo(currentState, [patch]))
    } catch (err) {
      console.warn('Skipping undecryptable workspace patch', event?.id, err)
    }
  })

  const repoStore: EditorRepoStore & DraftRepoStore = {
    pageTree$: stateSubject.asObservable(),
    observePage(pageId: string): Observable<{ status: 'loading' | 'ready' | 'locked'; page?: Page }> {
      return new Observable((subscriber) => {
        subscriber.next(currentState.pages[pageId] && !currentState.pages[pageId].deleted
          ? createPageObservation(currentState.pages[pageId])
          : { status: 'locked', page: currentState.pages[pageId] })

        const subscription = stateSubject.subscribe((state) => {
          const page = state.pages[pageId]
          if (!page || page.deleted) {
            subscriber.next({ status: 'locked', page })
            return
          }

          subscriber.next(createPageObservation(page))
        })

        return () => subscription.unsubscribe()
      })
    },
    getPage(pageId: string): Page | undefined {
      return currentState.pages[pageId]
    },
    listPageRevisions(pageId: string): PageRevision[] {
      return (revisionHistory.pages[pageId] ?? []).map((revision) => ({
        ...revision,
        page: { ...revision.page, blocks: revision.page.blocks.map((block) => ({ ...block, content: { ...block.content } })) },
      }))
    },
  }

  const baseDraftStore = createDraftStore({
    repoStore,
    commitBuilder: {
      buildPatchEventTemplate(options: { page: Page; repoId: string; cek: Uint8Array; createdAt: number }): EventTemplate {
        return buildPatchEventTemplate(options)
      },
    },
    publisher: {
      async publishPatch(template: EventTemplate): Promise<NostrEvent> {
        const page = JSON.parse(decryptContent(template.content, cek)) as Page
        applyState(reduceRepo(currentState, [{ id: `local-${page.id}-${page.updatedAt}`, pageId: page.id, page, createdAt: template.created_at }]))

        const signed = await publishToRelays(template, signer, {
          publish: async (url: string, event: NostrEvent) => {
            await Promise.all(pool.publish([url], event))
          },
        }, relayUrls)

        eventStore.add(signed)
        return signed
      },
    },
    signer,
    relayPublisher: {
      publish: async (url: string, event: NostrEvent) => {
        await Promise.all(pool.publish([url], event))
      },
    },
    relayUrls,
    repoId,
    cek,
    onCheckpoint: (page, revisionId) => {
      recordRevision(page, Date.now(), revisionId, true)
    },
    debounceMs: 250,
    retryBaseMs: 250,
  })

  const draftStore = createLiveDraftStore({
    baseStore: baseDraftStore,
    repoStore,
    checkpointDebounceMs: 250,
    now: () => Date.now(),
    onLivePage(page) {
      if (destroyed) return
      applyState(reduceRepo(currentState, [{ id: `live-${page.id}-${page.updatedAt}`, pageId: page.id, page, createdAt: Math.floor(Date.now() / 1000) }]))
    },
  })

  async function syncRemotePatches(): Promise<void> {
    try {
      const filter = { kinds: [1617], '#a': [repoTag] }
      const historical = await pool.querySync(relayUrls, filter, { maxWait: 4000 })
      if (destroyed) return

      for (const event of historical) {
        eventStore.add(event)
      }

      pool.subscribeMany(relayUrls, filter, {
        onevent: (event) => {
          eventStore.add(event)
        },
        onclose: () => undefined,
      })
    } catch (err) {
      console.warn('Workspace relay sync failed, continuing with local cache', err)
    }
  }

  if (shouldConnectRelays) {
    void syncRemotePatches()
  }

  return {
    repoStore,
    draftStore,
    dbViewStore,
    selectedPageId: selectInitialPageId(currentState),
    cek,
    repoId,
    flushDrafts: async () => {
      await draftStore.flush()
    },
    checkpoint: async () => {
      await draftStore.flush()
      for (const page of Object.values(currentState.pages)) {
        if (page.deleted) continue
        recordRevision(page, Date.now(), `checkpoint-${page.id}-${page.updatedAt}`, true)
      }
    },
    destroy(): void {
      destroyed = true
      ;(draftStore as DraftStore & { destroy?: () => void }).destroy?.()
      patchSubscription.unsubscribe()
      pool.destroy()
      stateSubject.complete()
    },
  }
}

import { BehaviorSubject, Observable, type Observable as RxObservable } from 'rxjs'
import type { EventTemplate, NostrEvent } from 'nostr-tools/pure'
import { createDraftStore, type DraftStore, type DraftRepoStore } from '../editor/stores/draftStore'
import type { DbViewStore } from '../editor/stores/dbViewStore'
import { buildPatchEventTemplate } from '../storage/commit/commitBuilder'
import { decryptContent, generateCEK } from '../storage/crypto/cryptoBox'
import type { Block, Page, PageTreeState } from '../storage/repo/types'
import type { EditorRepoStore } from '../editor/contexts/storeContexts'
import type { ViewSpec } from '../editor/types'

export interface DemoWorkspace {
  repoStore: EditorRepoStore & DraftRepoStore
  draftStore: DraftStore
  dbViewStore: DbViewStore
  selectedPageId: string
  flushDrafts(): Promise<void>
  destroy(): void
}

function makePageTreeState(pages: Record<string, Page>): PageTreeState {
  return { pages: { ...pages } }
}

function makeReadyObservation(page: Page): { status: 'ready'; page: Page } {
  return { status: 'ready', page }
}

type DemoRow = { id: string; values: Record<string, unknown> }

function cloneRows(rows: DemoRow[]): DemoRow[] {
  return rows.map((row) => ({ id: row.id, values: { ...row.values } }))
}

function makeInitialPages(): Record<string, Page> {
  const stored = localStorage.getItem('grid34_pages')
  if (stored) {
    try {
      return JSON.parse(stored)
    } catch (e) {
      console.error('Failed to parse stored pages', e)
    }
  }

  return {
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
          content: { text: 'This shell is wired to a live repo, draft checkpoints, and table views.' },
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
  }
}

function createObservationSubject(page: Page): BehaviorSubject<{ status: 'ready'; page: Page }> {
  return new BehaviorSubject(makeReadyObservation(page))
}

function createDemoDbViewStore(): DbViewStore {
  const rowsByDatabaseId = new Map<string, BehaviorSubject<DemoRow[]>>()

  function subjectFor(databaseId: string): BehaviorSubject<DemoRow[]> {
    let subject = rowsByDatabaseId.get(databaseId)
    if (!subject) {
      subject = new BehaviorSubject<DemoRow[]>([])
      rowsByDatabaseId.set(databaseId, subject)
    }
    return subject
  }

  return {
    observeRows(databaseId: string, view: ViewSpec): RxObservable<DemoRow[]> {
      return new Observable<DemoRow[]>((subscriber) => {
        const subscription = subjectFor(databaseId).subscribe((rows) => {
          const filteredRows = view.filter
            ? rows.filter((row) => Object.entries(view.filter ?? {}).every(([key, expected]) => row.values[key] === expected))
            : rows
          const sortedRows = view.sort
            ? [...filteredRows].sort((a, b) => {
                const left = String(a.values[view.sort!.property] ?? '')
                const right = String(b.values[view.sort!.property] ?? '')
                return view.sort!.direction === 'desc' ? right.localeCompare(left) : left.localeCompare(right)
              })
            : filteredRows

          subscriber.next(
            sortedRows.map((row) => ({
              id: row.id,
              values: view.columns ? Object.fromEntries(view.columns.map((col) => [col, row.values[col]])) : row.values,
            }))
          )
        })

        return () => subscription.unsubscribe()
      })
    },
    notifyChanged(databaseId: string): void {
      subjectFor(databaseId).next(cloneRows(subjectFor(databaseId).getValue()))
    },
    setRows(databaseId: string, rows: DemoRow[]): void {
      subjectFor(databaseId).next(cloneRows(rows))
    },
  }
}

function bootstrapWorkspace(): DemoWorkspace {
  const cek = generateCEK()
  const pages = makeInitialPages()
  const pageSubjects = new Map<string, BehaviorSubject<{ status: 'ready'; page: Page }>>(
    Object.values(pages).map((page) => [page.id, createObservationSubject(page)])
  )
  const pageTreeSubject = new BehaviorSubject<PageTreeState>(makePageTreeState(pages))
  const dbViewStore = createDemoDbViewStore()
  const demoRows = new Map<string, Map<string, Record<string, unknown>>>()
  demoRows.set(
    'db-1',
    new Map<string, Record<string, unknown>>([
      ['row-1', { name: 'Apples', qty: 3 }],
      ['row-2', { name: 'Bananas', qty: 5 }],
    ])
  )
  dbViewStore.setRows('db-1', [
    { id: 'row-1', values: { name: 'Apples', qty: 3 } },
    { id: 'row-2', values: { name: 'Bananas', qty: 5 } },
  ])

  const repoStore: EditorRepoStore & DraftRepoStore = {
    pageTree$: pageTreeSubject.asObservable(),
    observePage(pageId: string): Observable<{ status: 'loading' | 'ready' | 'locked'; page?: Page }> {
      const page = pages[pageId]
      if (!page || page.deleted) {
        return new BehaviorSubject({ status: 'locked' as const, page }).asObservable()
      }

      let subject = pageSubjects.get(pageId)
      if (!subject) {
        subject = createObservationSubject(page)
        pageSubjects.set(pageId, subject)
      }

      return subject.asObservable()
    },
    getPage(pageId: string): Page | undefined {
      return pages[pageId]
    },
  }

  function refreshViews(page: Page): void {
    pages[page.id] = page
    let subject = pageSubjects.get(page.id)
    if (!subject) {
      subject = createObservationSubject(page)
      pageSubjects.set(page.id, subject)
    } else {
      subject.next(makeReadyObservation(page))
    }

    pageTreeSubject.next(makePageTreeState(pages))
    localStorage.setItem('grid34_pages', JSON.stringify(pages))
    for (const block of page.blocks) {
      if (block.type !== 'database') continue

      const viewSpec = block.content as ViewSpec & { rowEdits?: Record<string, Record<string, unknown>> }
      const currentRows = subjectRows(viewSpec.databaseId)
      for (const [rowId, patch] of Object.entries(viewSpec.rowEdits ?? {})) {
        currentRows.set(rowId, { ...(currentRows.get(rowId) ?? {}), ...patch })
      }
      dbViewStore.setRows(
        viewSpec.databaseId,
        Array.from(currentRows.entries()).map(([id, values]) => ({ id, values }))
      )
    }
  }

  function subjectRows(databaseId: string): Map<string, Record<string, unknown>> {
    const rows = demoRows.get(databaseId)
    if (rows) return rows

    const next = new Map<string, Record<string, unknown>>()
    demoRows.set(databaseId, next)
    return next
  }

  const draftStore = createDraftStore({
    repoStore,
    commitBuilder: {
      buildPatchEventTemplate(options: { page: Page; repoId: string; cek: Uint8Array; createdAt: number }): EventTemplate {
        return buildPatchEventTemplate(options)
      },
    },
    publisher: {
      async publishPatch(template: EventTemplate): Promise<NostrEvent> {
        const page = JSON.parse(decryptContent(template.content, cek)) as Page
        refreshViews(page)
        return {
          id: `demo-${page.id}-${page.updatedAt}`,
          kind: template.kind,
          created_at: template.created_at,
          tags: template.tags,
          content: template.content,
          pubkey: 'demo-pubkey',
          sig: 'demo-sig',
        }
      },
    },
    signer: {
      signEvent: async (template: any) => {
        if (typeof window !== 'undefined' && (window as any).nostr) {
          return await (window as any).nostr.signEvent(template)
        }
        return template
      }
    },
    relayPublisher: {},
    relayUrls: [
      'wss://nos.lol',
      'wss://relay.damus.io',
      'wss://relay.nostr.band',
    ],
    repoId: 'workspace-repo',
    cek,
    debounceMs: 250,
    retryBaseMs: 250,
  })

  return {
    repoStore,
    draftStore,
    dbViewStore,
    selectedPageId: 'page-1',
    flushDrafts: async () => {
      await draftStore.flush()
    },
    destroy(): void {
      return
    },
  }
}

export function createDemoWorkspace(): Promise<DemoWorkspace> {
  return Promise.resolve(bootstrapWorkspace())
}

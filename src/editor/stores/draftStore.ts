import { BehaviorSubject, type Observable } from 'rxjs'
import type { EventTemplate, NostrEvent } from 'nostr-tools/pure'
import type { Page } from '../../storage/repo/types'

export interface DraftRepoStore {
  getPage(pageId: string): Page | undefined
}

export interface CommitBuilder {
  buildPatchEventTemplate(options: { page: Page; repoId: string; cek: Uint8Array; createdAt: number }): EventTemplate
}

export interface Publisher {
  publishPatch(
    template: EventTemplate,
    signer: unknown,
    relayPublisher: unknown,
    relayUrls: string[]
  ): Promise<NostrEvent>
}

export type DraftMap = Record<string, { pageId: string; content: Record<string, unknown> }>

export interface DraftStore {
  stage(pageId: string, blockId: string, content: Record<string, unknown>): void
  drafts$: Observable<DraftMap>
  flush(): Promise<void>
}

export interface CreateDraftStoreOptions {
  repoStore: DraftRepoStore
  commitBuilder: CommitBuilder
  publisher: Publisher
  signer: unknown
  relayPublisher: unknown
  relayUrls: string[]
  repoId?: string
  cek?: Uint8Array
  debounceMs?: number
  retryBaseMs?: number
}

export function createDraftStore(options: CreateDraftStoreOptions): DraftStore {
  const {
    repoStore,
    commitBuilder,
    publisher,
    signer,
    relayPublisher,
    relayUrls,
    repoId = 'workspace-repo',
    cek = new Uint8Array(32),
    debounceMs = 1000,
    retryBaseMs = 1000,
  } = options

  const draftsSubject = new BehaviorSubject<DraftMap>({})
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const retryAttempts = new Map<string, number>()

  function stage(pageId: string, blockId: string, content: Record<string, unknown>): void {
    const current = draftsSubject.getValue()
    draftsSubject.next({
      ...current,
      [blockId]: { pageId, content },
    })

    const existingTimer = timers.get(pageId)
    if (existingTimer) clearTimeout(existingTimer)
    timers.set(
      pageId,
      setTimeout(() => {
        timers.delete(pageId)
        void checkpointPage(pageId)
      }, debounceMs)
    )
  }

  async function checkpointPage(pageId: string): Promise<void> {
    const drafts = draftsSubject.getValue()
    const draftEntriesForPage = Object.entries(drafts).filter(([, d]) => d.pageId === pageId)
    if (draftEntriesForPage.length === 0) return

    const page = repoStore.getPage(pageId)
    if (!page) return

    const updatedBlocks = page.blocks.map((block) => {
      const draft = drafts[block.id]
      if (draft && draft.pageId === pageId) {
        return { ...block, content: draft.content, updatedAt: Date.now() }
      }
      return block
    })
    const updatedPage: Page = { ...page, blocks: updatedBlocks, updatedAt: Date.now() }

    const template = commitBuilder.buildPatchEventTemplate({
      page: updatedPage,
      repoId,
      cek,
      createdAt: Math.floor(Date.now() / 1000),
    })

    try {
      await publisher.publishPatch(template, signer, relayPublisher, relayUrls)
    } catch {
      const attempt = retryAttempts.get(pageId) ?? 0
      retryAttempts.set(pageId, attempt + 1)
      const delay = retryBaseMs * 2 ** attempt
      const timer = timers.get(pageId)
      if (timer) clearTimeout(timer)
      timers.set(
        pageId,
        setTimeout(() => {
          timers.delete(pageId)
          void checkpointPage(pageId)
        }, delay)
      )
      return
    }

    retryAttempts.delete(pageId)
    const remaining = { ...draftsSubject.getValue() }
    for (const [blockId] of draftEntriesForPage) {
      delete remaining[blockId]
    }
    draftsSubject.next(remaining)
  }

  async function flush(): Promise<void> {
    const pageIds = new Set(Object.values(draftsSubject.getValue()).map((d) => d.pageId))
    for (const pageId of pageIds) {
      const timer = timers.get(pageId)
      if (timer) {
        clearTimeout(timer)
        timers.delete(pageId)
      }
      await checkpointPage(pageId)
    }
  }

  return {
    stage,
    drafts$: draftsSubject.asObservable(),
    flush,
  }
}

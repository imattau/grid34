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
  createPage(parentId: string | null, title: string): string
  renamePage(pageId: string, title: string): void
  deletePage(pageId: string): void
  changePageIcon(pageId: string, icon: string): void
  movePage(pageId: string, parentId: string | null, order: number): void
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

    const draftByBlockId = new Map(draftEntriesForPage)
    const existingBlockIds = new Set(page.blocks.map((block) => block.id))

    const updatedBlocks = page.blocks
      .map((block) => {
        const draft = draftByBlockId.get(block.id)
        if (draft) {
          const { type, order, parentBlockId, deleted, ...content } = draft.content
          if (deleted === true) return null
          return {
            ...block,
            type: typeof type === 'string' ? type : block.type,
            order: typeof order === 'number' ? order : block.order,
            parentBlockId: typeof parentBlockId === 'string' || parentBlockId === null ? parentBlockId : block.parentBlockId,
            content,
            updatedAt: Date.now(),
          }
        }
        return block
      })
      .filter((b): b is Block => b !== null)

    const insertedBlocks = draftEntriesForPage
      .filter(([blockId]) => !existingBlockIds.has(blockId))
      .map(([blockId, draft]) => {
        const { deleted, type, order, parentBlockId, ...content } = draft.content
        if (deleted === true) return null

        return {
          id: blockId,
          type: typeof type === 'string' ? type : 'paragraph',
          parentBlockId: typeof parentBlockId === 'string' || parentBlockId === null ? parentBlockId : null,
          order: typeof order === 'number' ? order : Date.now(),
          content,
          updatedAt: Date.now(),
        } satisfies Block
      })
      .filter((block): block is Block => block !== null)

    const updatedPage: Page = {
      ...page,
      blocks: [...updatedBlocks, ...insertedBlocks].sort((a, b) => a.order - b.order),
      updatedAt: Date.now(),
    }

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

  async function publishPagePatch(page: Page): Promise<void> {
    const template = commitBuilder.buildPatchEventTemplate({
      page,
      repoId,
      cek,
      createdAt: Math.floor(Date.now() / 1000),
    })
    try {
      await publisher.publishPatch(template, signer, relayPublisher, relayUrls)
    } catch (err) {
      console.error('Failed to publish page patch', err)
    }
  }

  function createPage(parentId: string | null, title: string): string {
    const pageId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15)
    const newPage: Page = {
      id: pageId,
      title,
      parentId,
      order: Date.now(),
      blocks: [],
      updatedAt: Date.now(),
    }
    void publishPagePatch(newPage)
    return pageId
  }

  function renamePage(pageId: string, title: string): void {
    const page = repoStore.getPage(pageId)
    if (page) {
      const updatedPage = { ...page, title, updatedAt: Date.now() }
      void publishPagePatch(updatedPage)
    }
  }

  function deletePage(pageId: string): void {
    const page = repoStore.getPage(pageId)
    if (page) {
      const updatedPage = { ...page, deleted: true, updatedAt: Date.now() }
      void publishPagePatch(updatedPage)
    }
  }

  function changePageIcon(pageId: string, icon: string): void {
    const page = repoStore.getPage(pageId)
    if (page) {
      const updatedPage = { ...page, icon, updatedAt: Date.now() }
      void publishPagePatch(updatedPage)
    }
  }

  function movePage(pageId: string, parentId: string | null, order: number): void {
    const page = repoStore.getPage(pageId)
    if (page) {
      const updatedPage = { ...page, parentId, order, updatedAt: Date.now() }
      void publishPagePatch(updatedPage)
    }
  }

  return {
    stage,
    drafts$: draftsSubject.asObservable(),
    flush,
    createPage,
    renamePage,
    deletePage,
    changePageIcon,
    movePage,
  }
}

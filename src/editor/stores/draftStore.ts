import { BehaviorSubject, type Observable } from 'rxjs'
import type { EventTemplate, NostrEvent } from 'nostr-tools/pure'
import type { Page, Block } from '../../storage/repo/types'
import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'

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

export interface CheckpointListener {
  (page: Page, revisionId: string): void
}

export type DraftMap = Record<string, { pageId: string; content: Record<string, unknown> }>

export interface DraftStore {
  cek?: Uint8Array
  stage(pageId: string, blockId: string, content: Record<string, unknown>): void
  drafts$: Observable<DraftMap>
  flush(): Promise<void>
  restorePage(page: Page): void
  createPage(parentId: string | null, title: string): string
  renamePage(pageId: string, title: string): void
  deletePage(pageId: string): void
  changePageIcon(pageId: string, icon: string): void
  movePage(pageId: string, parentId: string | null, order: number): void
  awareness: Awareness
  setFocusedBlock(pageId: string, blockId: string | null, userInfo?: { pubkey?: string; name?: string }): void
  getLockedBlocks(pageId: string): Record<string, { username: string; pubkey: string }>
  lockedBlocks$: Observable<Record<string, Record<string, { username: string; pubkey: string }>>>
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
  onCheckpoint?: CheckpointListener
  debounceMs?: number
  retryBaseMs?: number
  awareness?: Awareness
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
    onCheckpoint,
    debounceMs = 1000,
    retryBaseMs = 1000,
    awareness = options.awareness ?? new Awareness(new Y.Doc()),
  } = options

  const draftsSubject = new BehaviorSubject<DraftMap>({})
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const retryAttempts = new Map<string, number>()

  let focusTimeout: ReturnType<typeof setTimeout> | null = null
  let lastUserInfo: { pubkey?: string; name?: string } | undefined

  function setFocusedBlock(pageId: string, blockId: string | null, userInfo?: { pubkey?: string; name?: string }): void {
    if (focusTimeout) {
      clearTimeout(focusTimeout)
      focusTimeout = null
    }

    lastUserInfo = userInfo

    const presence = {
      pubkey: userInfo?.pubkey || 'local',
      username: userInfo?.name || 'User',
      pageId,
      blockId,
      selection: null,
    }

    awareness.setLocalState(presence)

    if (blockId) {
      focusTimeout = setTimeout(() => {
        setFocusedBlock(pageId, null, userInfo)
      }, 60000)
    }
  }

  function getLockedBlocks(pageId: string): Record<string, { username: string; pubkey: string }> {
    const pageLocks: Record<string, { username: string; pubkey: string }> = {}
    for (const [clientId, state] of awareness.getStates().entries()) {
      if (clientId === awareness.clientID) continue
      const s = state as any
      if (s && s.pageId === pageId && s.blockId) {
        pageLocks[s.blockId] = {
          username: s.username || 'User',
          pubkey: s.pubkey || 'unknown',
        }
      }
    }
    return pageLocks
  }

  function getAllLockedBlocks(): Record<string, Record<string, { username: string; pubkey: string }>> {
    const locks: Record<string, Record<string, { username: string; pubkey: string }>> = {}
    for (const [clientId, state] of awareness.getStates().entries()) {
      if (clientId === awareness.clientID) continue
      const s = state as any
      if (s && s.pageId && s.blockId) {
        if (!locks[s.pageId]) {
          locks[s.pageId] = {}
        }
        locks[s.pageId][s.blockId] = {
          username: s.username || 'User',
          pubkey: s.pubkey || 'unknown',
        }
      }
    }
    return locks
  }

  const lockedBlocksSubject = new BehaviorSubject<Record<string, Record<string, { username: string; pubkey: string }>>>({})

  awareness.on('change', () => {
    lockedBlocksSubject.next(getAllLockedBlocks())
  })

  function stage(pageId: string, blockId: string, content: Record<string, unknown>): void {
    const localState = awareness.getLocalState() as any
    if (localState && localState.blockId === blockId) {
      if (focusTimeout) {
        clearTimeout(focusTimeout)
      }
      focusTimeout = setTimeout(() => {
        setFocusedBlock(pageId, null, lastUserInfo)
      }, 60000)
    }

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

  async function checkpointPage(pageId: string, shouldCheckpoint = false): Promise<void> {
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
      const signed = await publisher.publishPatch(template, signer, relayPublisher, relayUrls)
      if (shouldCheckpoint) {
        onCheckpoint?.(updatedPage, signed.id)
      }
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
      await checkpointPage(pageId, true)
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
      const signed = await publisher.publishPatch(template, signer, relayPublisher, relayUrls)
      onCheckpoint?.(page, signed.id)
    } catch (err) {
      console.error('Failed to publish page patch', err)
    }
  }

  function restorePage(page: Page): void {
    void publishPagePatch({
      ...page,
      updatedAt: Date.now(),
    })
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
    cek,
    stage,
    drafts$: draftsSubject.asObservable(),
    flush,
    restorePage,
    createPage,
    renamePage,
    deletePage,
    changePageIcon,
    movePage,
    awareness,
    setFocusedBlock,
    getLockedBlocks,
    lockedBlocks$: lockedBlocksSubject.asObservable(),
  }
}

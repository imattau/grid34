import { describe, expect, it, vi } from 'vitest'
import type { DraftRepoStore, DraftStore } from '../../editor/stores/draftStore'
import type { Page } from '../../storage/repo/types'
import { createLiveDraftStore } from './liveDraftStore'

function makePage(): Page {
  return {
    id: 'page-1',
    title: 'My Page',
    parentId: null,
    order: 0,
    blocks: [
      { id: 'block-1', type: 'paragraph', parentBlockId: null, order: 0, content: { text: 'hello' }, updatedAt: 1000 },
    ],
    updatedAt: 1000,
  }
}

function makeBaseStore(): DraftStore {
  return {
    stage: vi.fn(),
    drafts$: { subscribe: vi.fn() } as never,
    flush: vi.fn(async () => {}),
    restorePage: vi.fn(),
    createPage: vi.fn(() => 'page-2'),
    renamePage: vi.fn(),
    deletePage: vi.fn(),
    changePageIcon: vi.fn(),
    movePage: vi.fn(),
    awareness: { } as never,
    setFocusedBlock: vi.fn(),
    getLockedBlocks: vi.fn(() => ({})),
    lockedBlocks$: { subscribe: vi.fn() } as never,
  }
}

describe('createLiveDraftStore', () => {
  it('feeds live page updates from the collab backend while delegating to the base store', () => {
    const page = makePage()
    const repoStore: DraftRepoStore = {
      getPage: vi.fn(() => page),
    }
    const baseStore = makeBaseStore()
    const livePages: Page[] = []

    const store = createLiveDraftStore({
      baseStore,
      repoStore,
      checkpointDebounceMs: 5000,
      now: () => 2000,
      onLivePage: (nextPage) => livePages.push(nextPage),
    })

    store.stage('page-1', 'block-1', { text: 'edited live' })

    expect(baseStore.stage).toHaveBeenCalledWith('page-1', 'block-1', { text: 'edited live' })
    expect(livePages.at(-1)?.blocks[0].content).toEqual({ text: 'edited live' })
  })

  it('accepts brand-new block ids from the editor and turns them into live page inserts', () => {
    const page = makePage()
    const repoStore: DraftRepoStore = {
      getPage: vi.fn(() => page),
    }
    const baseStore = makeBaseStore()
    const livePages: Page[] = []

    const store = createLiveDraftStore({
      baseStore,
      repoStore,
      checkpointDebounceMs: 5000,
      now: () => 2000,
      onLivePage: (nextPage) => livePages.push(nextPage),
    })

    store.stage('page-1', 'block-2', {
      type: 'paragraph',
      order: 1,
      parentBlockId: null,
      text: '',
      richText: null,
    })

    expect(baseStore.stage).toHaveBeenCalledWith(
      'page-1',
      'block-2',
      expect.objectContaining({
        type: 'paragraph',
        order: 1,
        parentBlockId: null,
        text: '',
        richText: null,
      })
    )
    expect(livePages.at(-1)?.blocks).toHaveLength(2)
    expect(livePages.at(-1)?.blocks[1]).toMatchObject({
      id: 'block-2',
      type: 'paragraph',
      order: 1,
      content: { text: '', richText: null },
    })
  })
})

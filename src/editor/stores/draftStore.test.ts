import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDraftStore, type CommitBuilder, type DraftMap, type DraftStore, type Publisher } from './draftStore'
import type { Page } from '../../storage/repo/types'

function makePage(overrides: Partial<Page> = {}): Page {
  return {
    id: 'page-1',
    title: 'My Page',
    parentId: null,
    order: 0,
    blocks: [
      { id: 'block-1', type: 'paragraph', parentBlockId: null, order: 0, content: { text: 'hi' }, updatedAt: 1000 },
    ],
    updatedAt: 1000,
    ...overrides,
  }
}

function makeFakeRepoStore(state: { pages: Record<string, Page> }) {
  return {
    getPage: (pageId: string) => state.pages[pageId],
  }
}

describe('DraftStore.stage / drafts$', () => {
  let store: DraftStore

  beforeEach(() => {
    const repoStore = makeFakeRepoStore({ pages: { 'page-1': makePage() } })
    const commitBuilder: CommitBuilder = {
      buildPatchEventTemplate: vi.fn(() => ({ kind: 1617, created_at: 0, tags: [], content: 'cipher' })),
    }
    const publisher: Publisher = {
      publishPatch: vi.fn(async () => ({
        id: 'evt-1',
        kind: 1617,
        created_at: 0,
        tags: [],
        content: 'cipher',
        pubkey: 'pk',
        sig: 'sig',
      })),
    }
    store = createDraftStore({
      repoStore,
      commitBuilder,
      publisher,
      signer: {} as never,
      relayPublisher: {} as never,
      relayUrls: [],
      debounceMs: 1000,
    })
  })

  it('emits the staged draft on drafts$ keyed by blockId', () => {
    const emissions: DraftMap[] = []
    store.drafts$.subscribe((drafts) => emissions.push(drafts))

    store.stage('page-1', 'block-1', { text: 'hello world' })

    expect(emissions.at(-1)).toEqual({
      'block-1': { pageId: 'page-1', content: { text: 'hello world' } },
    })
  })

  it('replaces a prior unflushed draft for the same blockId rather than accumulating', () => {
    const emissions: DraftMap[] = []
    store.drafts$.subscribe((drafts) => emissions.push(drafts))

    store.stage('page-1', 'block-1', { text: 'first' })
    store.stage('page-1', 'block-1', { text: 'second' })

    expect(Object.keys(emissions.at(-1)!)).toEqual(['block-1'])
    expect(emissions.at(-1)!['block-1'].content).toEqual({ text: 'second' })
  })
})

describe('DraftStore debounced checkpoint', () => {
  let repoStore: ReturnType<typeof makeFakeRepoStore>
  let commitBuilder: CommitBuilder
  let publisher: Publisher
  let store: DraftStore
  let onCheckpoint: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    repoStore = makeFakeRepoStore({ pages: { 'page-1': makePage() } })
    commitBuilder = {
      buildPatchEventTemplate: vi.fn(({ page }) => ({
        kind: 1617,
        created_at: 0,
        tags: [['file', `pages/${page.id}.json`]],
        content: 'cipher',
      })),
    }
    publisher = {
      publishPatch: vi.fn(async () => ({
        id: 'evt-1',
        kind: 1617,
        created_at: 0,
        tags: [],
        content: 'cipher',
        pubkey: 'pk',
        sig: 'sig',
      })),
    }
    onCheckpoint = vi.fn()
    store = createDraftStore({
      repoStore,
      commitBuilder,
      publisher,
      signer: {} as never,
      relayPublisher: {} as never,
      relayUrls: ['wss://relay-a'],
      repoId: 'workspace-repo',
      cek: new Uint8Array(32),
      onCheckpoint,
      debounceMs: 1000,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('collapses rapid stage() calls into a single checkpoint after the debounce period', async () => {
    store.stage('page-1', 'block-1', { text: 'a' })
    await vi.advanceTimersByTimeAsync(500)
    store.stage('page-1', 'block-1', { text: 'ab' })
    await vi.advanceTimersByTimeAsync(500)
    store.stage('page-1', 'block-1', { text: 'abc' })

    await vi.advanceTimersByTimeAsync(1000)

    expect(commitBuilder.buildPatchEventTemplate).toHaveBeenCalledTimes(1)
    expect(commitBuilder.buildPatchEventTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        page: expect.objectContaining({
          id: 'page-1',
          blocks: [expect.objectContaining({ id: 'block-1', content: { text: 'abc' } })],
        }),
      })
    )
    expect(publisher.publishPatch).toHaveBeenCalledTimes(1)
    expect(onCheckpoint).not.toHaveBeenCalled()
  })

  it('clears drafts$ after a successful publish', async () => {
    store.stage('page-1', 'block-1', { text: 'a' })
    await vi.advanceTimersByTimeAsync(1000)

    let latest: DraftMap = {}
    store.drafts$.subscribe((d) => {
      latest = d
    })
    expect(latest).toEqual({})
  })

  it('preserves staged blocks that do not already exist on the page', async () => {
    store.stage('page-1', 'block-1', { text: 'split head' })
    store.stage('page-1', 'block-2', { type: 'paragraph', order: 1, parentBlockId: null, text: 'split tail' })

    await vi.advanceTimersByTimeAsync(1000)

    expect(commitBuilder.buildPatchEventTemplate).toHaveBeenCalledTimes(1)
    expect(commitBuilder.buildPatchEventTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        page: expect.objectContaining({
          blocks: [
            expect.objectContaining({ id: 'block-1', content: { text: 'split head' } }),
            expect.objectContaining({ id: 'block-2', type: 'paragraph', content: { text: 'split tail' } }),
          ],
        }),
      })
    )
  })

  it('flush() triggers an immediate checkpoint bypassing the debounce', async () => {
    store.stage('page-1', 'block-1', { text: 'a' })
    await store.flush()

    expect(commitBuilder.buildPatchEventTemplate).toHaveBeenCalledTimes(1)
    expect(publisher.publishPatch).toHaveBeenCalledTimes(1)
    expect(onCheckpoint).toHaveBeenCalledTimes(1)
    expect(onCheckpoint).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'page-1',
        blocks: [expect.objectContaining({ id: 'block-1', content: { text: 'a' } })],
      }),
      'evt-1'
    )
  })
})

describe('DraftStore offline queue and retry', () => {
  it('keeps drafts$ and retries with backoff when publishPatch rejects, then clears them once it succeeds', async () => {
    vi.useFakeTimers()
    const repoStore = makeFakeRepoStore({ pages: { 'page-1': makePage() } })
    const commitBuilder: CommitBuilder = {
      buildPatchEventTemplate: vi.fn(() => ({ kind: 1617, created_at: 0, tags: [], content: 'cipher' })),
    }
    let attempt = 0
    const publisher: Publisher = {
      publishPatch: vi.fn(async () => {
        attempt += 1
        if (attempt < 3) throw new Error('relay unreachable')
        return {
          id: 'evt-1',
          kind: 1617,
          created_at: 0,
          tags: [],
          content: 'cipher',
          pubkey: 'pk',
          sig: 'sig',
        }
      }),
    }
    const store = createDraftStore({
      repoStore,
      commitBuilder,
      publisher,
      signer: {} as never,
      relayPublisher: {} as never,
      relayUrls: ['wss://relay-a'],
      repoId: 'workspace-repo',
      cek: new Uint8Array(32),
      debounceMs: 1000,
      retryBaseMs: 1000,
    })

    let latest: DraftMap = {}
    store.drafts$.subscribe((d) => {
      latest = d
    })

    store.stage('page-1', 'block-1', { text: 'a' })

    await vi.advanceTimersByTimeAsync(1000)
    expect(latest['block-1']).toBeDefined()

    await vi.advanceTimersByTimeAsync(1000)
    expect(latest['block-1']).toBeDefined()

    await vi.advanceTimersByTimeAsync(2000)
    expect(latest['block-1']).toBeUndefined()
    expect(publisher.publishPatch).toHaveBeenCalledTimes(3)

    vi.useRealTimers()
  })
})

describe('DraftStore Page CRUD', () => {
  let repoStore: ReturnType<typeof makeFakeRepoStore>
  let commitBuilder: CommitBuilder
  let publisher: Publisher
  let store: DraftStore

  beforeEach(() => {
    repoStore = makeFakeRepoStore({ pages: { 'page-1': makePage() } })
    commitBuilder = {
      buildPatchEventTemplate: vi.fn(({ page }) => ({
        kind: 1617,
        created_at: 0,
        tags: [['file', `pages/${page.id}.json`]],
        content: 'cipher',
      })),
    }
    publisher = {
      publishPatch: vi.fn(async () => ({
        id: 'evt-1',
        kind: 1617,
        created_at: 0,
        tags: [],
        content: 'cipher',
        pubkey: 'pk',
        sig: 'sig',
      })),
    }
    store = createDraftStore({
      repoStore,
      commitBuilder,
      publisher,
      signer: {} as never,
      relayPublisher: {} as never,
      relayUrls: ['wss://relay-a'],
      repoId: 'workspace-repo',
      cek: new Uint8Array(32),
      debounceMs: 1000,
    })
  })

  it('stages page creation and publishes immediately', () => {
    const pageId = store.createPage(null, 'New Root Page')
    expect(pageId).toBeDefined()
    expect(commitBuilder.buildPatchEventTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        page: expect.objectContaining({
          id: pageId,
          title: 'New Root Page',
          parentId: null,
        }),
      })
    )
    expect(publisher.publishPatch).toHaveBeenCalledTimes(1)
  })

  it('stages page rename and publishes immediately', () => {
    store.renamePage('page-1', 'Renamed Title')
    expect(commitBuilder.buildPatchEventTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        page: expect.objectContaining({
          id: 'page-1',
          title: 'Renamed Title',
        }),
      })
    )
    expect(publisher.publishPatch).toHaveBeenCalledTimes(1)
  })

  it('stages page deletion and publishes immediately', () => {
    store.deletePage('page-1')
    expect(commitBuilder.buildPatchEventTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        page: expect.objectContaining({
          id: 'page-1',
          deleted: true,
        }),
      })
    )
    expect(publisher.publishPatch).toHaveBeenCalledTimes(1)
  })

  it('stages page icon change and publishes immediately', () => {
    store.changePageIcon('page-1', '🚀')
    expect(commitBuilder.buildPatchEventTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        page: expect.objectContaining({
          id: 'page-1',
          icon: '🚀',
        }),
      })
    )
    expect(publisher.publishPatch).toHaveBeenCalledTimes(1)
  })

  it('stages page move and publishes immediately', () => {
    store.movePage('page-1', 'parent-2', 4.5)
    expect(commitBuilder.buildPatchEventTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        page: expect.objectContaining({
          id: 'page-1',
          parentId: 'parent-2',
          order: 4.5,
        }),
      })
    )
    expect(publisher.publishPatch).toHaveBeenCalledTimes(1)
  })
})

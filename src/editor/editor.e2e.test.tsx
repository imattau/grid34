import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { BehaviorSubject, of } from 'rxjs'
import { PageEditor } from './components/PageEditor'
import { createDraftStore } from './stores/draftStore'
import { RepoStoreContext, DraftStoreContext, DbViewStoreContext, type EditorRepoStore } from './contexts/storeContexts'
import type { CommitBuilder, Publisher } from './stores/draftStore'
import type { DbViewStore } from './stores/dbViewStore'
import type { Page } from '../storage/repo/types'

function makePage(): Page {
  return {
    id: 'page-1',
    title: 'My Page',
    parentId: null,
    order: 0,
    updatedAt: 1000,
    blocks: [
      { id: 'block-1', type: 'paragraph', parentBlockId: null, order: 0, content: { text: 'Hello' }, updatedAt: 1000 },
    ],
  }
}

describe('editor write-then-read round trip', () => {
  let pages: Record<string, Page>
  let pageSubject: BehaviorSubject<{ status: 'ready'; page: Page }>

  beforeEach(() => {
    vi.useFakeTimers()
    pages = { 'page-1': makePage() }
    pageSubject = new BehaviorSubject<{ status: 'ready'; page: Page }>({ status: 'ready', page: pages['page-1'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('stages an edit, checkpoints it through fake CommitBuilder/Publisher, and re-renders with the optimistically-updated content', async () => {
    let lastBuiltPage: Page | undefined
    const repoStore: Partial<EditorRepoStore> = {
      pageTree$: of({ pages: {} }),
      observePage: vi.fn(() => pageSubject.asObservable()),
      getPage: ((pageId: string) => pages[pageId]) as never,
    } as never

    const commitBuilder: CommitBuilder = {
      buildPatchEventTemplate: vi.fn(({ page }) => {
        lastBuiltPage = page
        return {
          kind: 1617,
          created_at: 0,
          tags: [['file', `pages/${page.id}.json`]],
          content: 'cipher',
        }
      }),
    }

    const publisher: Publisher = {
      publishPatch: vi.fn(async () => {
        if (lastBuiltPage) {
          pages[lastBuiltPage.id] = lastBuiltPage
          pageSubject.next({ status: 'ready', page: lastBuiltPage })
        }
        return { id: 'evt-1', kind: 1617, created_at: 0, tags: [], content: 'cipher', pubkey: 'pk', sig: 'sig' }
      }),
    }

    const draftStore = createDraftStore({
      repoStore: { getPage: (pageId) => pages[pageId] },
      commitBuilder,
      publisher,
      signer: {} as never,
      relayPublisher: {} as never,
      relayUrls: ['wss://relay-a'],
      repoId: 'workspace-repo',
      cek: new Uint8Array(32),
      debounceMs: 1000,
    })

    const dbViewStore: Partial<DbViewStore> = { observeRows: vi.fn(() => of([])), notifyChanged: vi.fn() }

    render(
      <RepoStoreContext.Provider value={repoStore as EditorRepoStore}>
        <DraftStoreContext.Provider value={draftStore}>
          <DbViewStoreContext.Provider value={dbViewStore as DbViewStore}>
            <PageEditor pageId="page-1" />
          </DbViewStoreContext.Provider>
        </DraftStoreContext.Provider>
      </RepoStoreContext.Provider>
    )

    const textbox = screen.getByDisplayValue('Hello')
    fireEvent.change(textbox, { target: { value: 'Hello, world!' } })

    await vi.advanceTimersByTimeAsync(1000)
    expect(commitBuilder.buildPatchEventTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        page: expect.objectContaining({
          blocks: [expect.objectContaining({ id: 'block-1', content: { text: 'Hello, world!' } })],
        }),
      })
    )

    expect(publisher.publishPatch).toHaveBeenCalledTimes(1)
    expect(screen.getByDisplayValue('Hello, world!')).toBeInTheDocument()
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BehaviorSubject, of } from 'rxjs'
import { PageEditor } from './components/PageEditor'
import { createDraftStore } from './stores/draftStore'
import { RepoStoreContext, DraftStoreContext, DbViewStoreContext, type EditorRepoStore } from './contexts/storeContexts'
import type { CommitBuilder, Publisher } from './stores/draftStore'
import type { DbViewStore } from './stores/dbViewStore'
import type { Page } from '../storage/repo/types'
import * as contactModule from './contacts/nostrContacts'

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
    sessionStorage.setItem('nostr_user', JSON.stringify({ pubkey: 'pubkey-1', name: 'Alice' }))
    pages = { 'page-1': makePage() }
    pageSubject = new BehaviorSubject<{ status: 'ready'; page: Page }>({ status: 'ready', page: pages['page-1'] })
  })

  afterEach(() => {
    sessionStorage.removeItem('nostr_user')
    vi.restoreAllMocks()
  })

  it('stages an edit, checkpoints it through fake CommitBuilder/Publisher, and re-renders with the optimistically-updated content', async () => {
    let lastBuiltPage: Page | undefined
    const repoStore: Partial<EditorRepoStore> = {
      pageTree$: of({ pages: {} }),
      observePage: vi.fn(() => pageSubject.asObservable()),
      getPage: ((pageId: string) => pages[pageId]) as never,
      listPageRevisions: vi.fn(() => []),
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
      debounceMs: 50,
    })

    const dbViewStore: Partial<DbViewStore> = { observeRows: vi.fn(() => of([])), notifyChanged: vi.fn() }

    render(
      <RepoStoreContext.Provider value={repoStore as EditorRepoStore}>
        <DraftStoreContext.Provider value={draftStore}>
          <DbViewStoreContext.Provider value={dbViewStore as DbViewStore}>
            <PageEditor pageId="page-1" enableNostrContacts={false} />
          </DbViewStoreContext.Provider>
        </DraftStoreContext.Provider>
      </RepoStoreContext.Provider>
    )

    const textbox = screen.getByLabelText('Paragraph text')
    await userEvent.type(textbox, ', world!')

    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(commitBuilder.buildPatchEventTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        page: expect.objectContaining({
          blocks: [expect.objectContaining({ id: 'block-1', content: expect.objectContaining({ text: ', world!Hello' }) })],
        }),
      })
    )

    expect(publisher.publishPatch).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('Paragraph text')).toHaveTextContent(', world!Hello')
  })

  it('inserts a mention node when selecting a suggestion from the @ menu', async () => {
    const mentionPage: Page = {
      id: 'page-1',
      title: 'My Page',
      parentId: null,
      order: 0,
      updatedAt: 1000,
      blocks: [
        { id: 'block-1', type: 'paragraph', parentBlockId: null, order: 0, content: { text: '' }, updatedAt: 1000 },
      ],
    }

    pages = { 'page-1': mentionPage }
    pageSubject = new BehaviorSubject<{ status: 'ready'; page: Page }>({ status: 'ready', page: mentionPage })

    const repoStore: Partial<EditorRepoStore> = {
      pageTree$: of({ pages: {} }),
      observePage: vi.fn(() => pageSubject.asObservable()),
      getPage: ((pageId: string) => pages[pageId]) as never,
      listPageRevisions: vi.fn(() => []),
    } as never

    const commitBuilder: CommitBuilder = {
      buildPatchEventTemplate: vi.fn(() => ({
        kind: 1617,
        created_at: 0,
        tags: [['file', 'pages/page-1.json']],
        content: 'cipher',
      })),
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

    const draftStore = createDraftStore({
      repoStore: { getPage: (pageId) => pages[pageId] },
      commitBuilder,
      publisher,
      signer: {} as never,
      relayPublisher: {} as never,
      relayUrls: ['wss://relay-a'],
      repoId: 'workspace-repo',
      cek: new Uint8Array(32),
      debounceMs: 50,
    })

    vi.spyOn(contactModule, 'getCachedContacts').mockReturnValue([
      {
        pubkey: 'npub-contact-2',
        displayName: 'Bob',
        name: 'Bob',
      },
    ])

    const stageSpy = vi.spyOn(draftStore, 'stage')
    const dbViewStore: Partial<DbViewStore> = { observeRows: vi.fn(() => of([])), notifyChanged: vi.fn() }

    render(
      <RepoStoreContext.Provider value={repoStore as EditorRepoStore}>
        <DraftStoreContext.Provider value={draftStore}>
          <DbViewStoreContext.Provider value={dbViewStore as DbViewStore}>
            <PageEditor pageId="page-1" enableNostrContacts={false} />
          </DbViewStoreContext.Provider>
        </DraftStoreContext.Provider>
      </RepoStoreContext.Provider>
    )

    const textbox = screen.getByLabelText('Paragraph text')
    await userEvent.click(textbox)
    await userEvent.type(textbox, '@b')

    const suggestion = await screen.findByRole('button', { name: /bob/i })
    await userEvent.click(suggestion)

    const mentionStageCall = stageSpy.mock.calls.find((call) => {
      const edit = call[2] as { richText?: unknown } | undefined
      return Boolean(
        edit?.richText &&
          typeof edit.richText === 'object' &&
          JSON.stringify(edit.richText).includes('"type":"mention"') &&
          JSON.stringify(edit.richText).includes('"id":"npub-contact-2"')
      )
    })

    expect(mentionStageCall).toBeDefined()
    expect(screen.queryByRole('button', { name: /bob/i })).not.toBeInTheDocument()
  })
})

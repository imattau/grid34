import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { of } from 'rxjs'
import { PageEditor } from './PageEditor'
import { RepoStoreContext, DraftStoreContext, DbViewStoreContext, type EditorRepoStore } from '../contexts/storeContexts'
import type { DraftStore } from '../stores/draftStore'
import type { DbViewStore } from '../stores/dbViewStore'
import type { Page } from '../../storage/repo/types'
import { restoreBlockEditorFocus } from './focusBlockEditor'

vi.mock('../contacts/nostrContacts', () => ({
  loadNostrContacts: vi.fn(async () => [
    { pubkey: 'npub-contact-1', displayName: 'Alice Smith', picture: 'https://example.com/alice.png' },
    { pubkey: 'npub-contact-2', name: 'Bob', picture: 'https://example.com/bob.png' },
  ]),
}))

vi.mock('./focusBlockEditor', () => ({
  focusBlockEditor: vi.fn(() => true),
  restoreBlockEditorFocus: vi.fn(),
}))

const readyPage: Page = {
  id: 'page-1',
  title: 'My Page',
  parentId: null,
  order: 0,
  updatedAt: 1000,
  blocks: [
    { id: 'block-1', type: 'paragraph', parentBlockId: null, order: 0, content: { text: 'Hello' }, updatedAt: 1000 },
    { id: 'block-2', type: 'heading', parentBlockId: null, order: 1, content: { text: 'Title', level: 1 }, updatedAt: 1000 },
  ],
}

function renderEditor(
  status: 'loading' | 'ready' | 'locked',
  page?: Page,
  options?: { currentUserPubkey?: string | null; workspaceId?: string }
) {
  const repoStore: Partial<EditorRepoStore> = {
    pageTree$: of({ pages: {} }),
    observePage: vi.fn(() => of({ status, page })),
    listPageRevisions: vi.fn(() => []),
  }
  const draftStore: Partial<DraftStore> = { stage: vi.fn(), drafts$: of({}), flush: vi.fn() }
  const dbViewStore: Partial<DbViewStore> = { observeRows: vi.fn(() => of([])), notifyChanged: vi.fn() }

  return render(
    <RepoStoreContext.Provider value={repoStore as EditorRepoStore}>
        <DraftStoreContext.Provider value={draftStore as DraftStore}>
          <DbViewStoreContext.Provider value={dbViewStore as DbViewStore}>
          <PageEditor
            pageId="page-1"
            workspaceId={options?.workspaceId}
            currentUserPubkey={options?.currentUserPubkey ?? null}
            relayUrls={['wss://relay.example']}
          />
          </DbViewStoreContext.Provider>
        </DraftStoreContext.Provider>
      </RepoStoreContext.Provider>
  )
}

describe('PageEditor', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.mocked(restoreBlockEditorFocus).mockClear()
  })

  it('shows a transient decrypting state while the page is loading', () => {
    renderEditor('loading')
    expect(screen.getByText(/decrypting/i)).toBeInTheDocument()
  })

  it('renders LockedPageView when RepoStore reports the page as locked', () => {
    renderEditor('locked', { ...readyPage, blocks: [] })
    expect(screen.getByRole('heading', { name: 'My Page', level: 2 })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('renders the page blocks via blockComponentRegistry when ready', () => {
    renderEditor('ready', readyPage, { currentUserPubkey: 'npub-self' })

    expect(screen.getByLabelText('Paragraph text')).toHaveTextContent('Hello')
    expect(screen.getByDisplayValue('My Page')).toBeInTheDocument()
  })

  it('renders placeholder and creates paragraph block when clicking empty content area', () => {
    const emptyPage: Page = { id: 'page-1', title: 'Empty Page', parentId: null, order: 0, updatedAt: 1000, blocks: [] }
    const repoStore: Partial<EditorRepoStore> = {
      pageTree$: of({ pages: {} }),
      observePage: vi.fn(() => of({ status: 'ready', page: emptyPage })),
      listPageRevisions: vi.fn(() => []),
    }
    const draftStore: Partial<DraftStore> = { stage: vi.fn(), drafts$: of({}), flush: vi.fn() }
    const dbViewStore: Partial<DbViewStore> = { observeRows: vi.fn(() => of([])), notifyChanged: vi.fn() }

    const { container } = render(
      <RepoStoreContext.Provider value={repoStore as EditorRepoStore}>
        <DraftStoreContext.Provider value={draftStore as DraftStore}>
          <DbViewStoreContext.Provider value={dbViewStore as DbViewStore}>
            <PageEditor pageId="page-1" currentUserPubkey="npub-self" />
          </DbViewStoreContext.Provider>
        </DraftStoreContext.Provider>
      </RepoStoreContext.Provider>
    )

    expect(screen.getByText(/press here to start writing/i)).toBeInTheDocument()
    
    // Click content container
    const contentDiv = container.querySelector('.page-editor__content')
    expect(contentDiv).toBeInTheDocument()
    if (contentDiv) {
      contentDiv.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    }

    expect(draftStore.stage).toHaveBeenCalledWith(
      'page-1',
      expect.any(String),
      expect.objectContaining({ type: 'paragraph', text: '' })
    )
  })

  it('shows a page menu with revision restores', async () => {
    const revisionPage: Page = {
      ...readyPage,
      title: 'Earlier title',
      updatedAt: 500,
    }
    const repoStore: Partial<EditorRepoStore> = {
      pageTree$: of({ pages: {} }),
      observePage: vi.fn(() => of({ status: 'ready', page: readyPage })),
      listPageRevisions: vi.fn(() => [
        {
          id: 'revision-1',
          pageId: 'page-1',
          page: revisionPage,
          createdAt: 500,
        },
      ]),
    }
    const draftStore: Partial<DraftStore> = { stage: vi.fn(), drafts$: of({}), flush: vi.fn(), restorePage: vi.fn() }
    const dbViewStore: Partial<DbViewStore> = { observeRows: vi.fn(() => of([])), notifyChanged: vi.fn() }

    render(
      <RepoStoreContext.Provider value={repoStore as EditorRepoStore}>
        <DraftStoreContext.Provider value={draftStore as DraftStore}>
          <DbViewStoreContext.Provider value={dbViewStore as DbViewStore}>
            <PageEditor pageId="page-1" currentUserPubkey="npub-self" />
          </DbViewStoreContext.Provider>
        </DraftStoreContext.Provider>
      </RepoStoreContext.Provider>
    )

    await screen.findByRole('button', { name: /page menu/i })
    await userEvent.click(screen.getByRole('button', { name: /page menu/i }))

    expect(await screen.findByText(/revision history/i)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /restore/i })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /restore/i }))

    expect(draftStore.restorePage).toHaveBeenCalledWith(revisionPage)
  })

  it('focuses the newly created block after Shift+Enter in a paragraph', async () => {
    const repoStore: Partial<EditorRepoStore> = {
      pageTree$: of({ pages: {} }),
      observePage: vi.fn(() => of({ status: 'ready', page: readyPage })),
      listPageRevisions: vi.fn(() => []),
    }
    const draftStore: Partial<DraftStore> = { stage: vi.fn(), drafts$: of({}), flush: vi.fn() }
    const dbViewStore: Partial<DbViewStore> = { observeRows: vi.fn(() => of([])), notifyChanged: vi.fn() }

    render(
      <RepoStoreContext.Provider value={repoStore as EditorRepoStore}>
        <DraftStoreContext.Provider value={draftStore as DraftStore}>
          <DbViewStoreContext.Provider value={dbViewStore as DbViewStore}>
            <PageEditor pageId="page-1" currentUserPubkey="npub-self" />
          </DbViewStoreContext.Provider>
        </DraftStoreContext.Provider>
      </RepoStoreContext.Provider>
    )

    const paragraphEditor = await screen.findByLabelText('Paragraph text')
    paragraphEditor.focus()
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}')

    expect(draftStore.stage).toHaveBeenCalledWith(
      'page-1',
      expect.any(String),
      expect.objectContaining({ text: 'Hello' })
    )
    expect(restoreBlockEditorFocus).toHaveBeenCalledWith(expect.any(String))
  })

  it('keeps Enter inside a numbered list item within the same block', async () => {
    const listPage: Page = {
      ...readyPage,
      blocks: [
        {
          id: 'block-1',
          type: 'list',
          parentBlockId: null,
          order: 0,
          content: { text: 'First item', kind: 'numbered' },
          updatedAt: 1000,
        },
      ],
    }
    const repoStore: Partial<EditorRepoStore> = {
      pageTree$: of({ pages: {} }),
      observePage: vi.fn(() => of({ status: 'ready', page: listPage })),
      listPageRevisions: vi.fn(() => []),
    }
    const draftStore: Partial<DraftStore> = { stage: vi.fn(), drafts$: of({}), flush: vi.fn() }
    const dbViewStore: Partial<DbViewStore> = { observeRows: vi.fn(() => of([])), notifyChanged: vi.fn() }

    render(
      <RepoStoreContext.Provider value={repoStore as EditorRepoStore}>
        <DraftStoreContext.Provider value={draftStore as DraftStore}>
          <DbViewStoreContext.Provider value={dbViewStore as DbViewStore}>
            <PageEditor pageId="page-1" currentUserPubkey="npub-self" />
          </DbViewStoreContext.Provider>
        </DraftStoreContext.Provider>
      </RepoStoreContext.Provider>
    )

    const listEditor = await screen.findByLabelText('List text')
    listEditor.focus()
    await userEvent.keyboard('{Enter}')

    const listCalls = vi.mocked(draftStore.stage).mock.calls.filter(([pageId]) => pageId === 'page-1')
    expect(listCalls.length).toBeGreaterThan(0)
    expect(listCalls.every(([, blockId]) => blockId === 'block-1')).toBe(true)
  })

  it('allows editing an existing bullet list item', async () => {
    const listPage: Page = {
      ...readyPage,
      blocks: [
        {
          id: 'block-1',
          type: 'list',
          parentBlockId: null,
          order: 0,
          content: { text: 'First item', kind: 'bullet' },
          updatedAt: 1000,
        },
      ],
    }
    const repoStore: Partial<EditorRepoStore> = {
      pageTree$: of({ pages: {} }),
      observePage: vi.fn(() => of({ status: 'ready', page: listPage })),
      listPageRevisions: vi.fn(() => []),
    }
    const draftStore: Partial<DraftStore> = { stage: vi.fn(), drafts$: of({}), flush: vi.fn() }
    const dbViewStore: Partial<DbViewStore> = { observeRows: vi.fn(() => of([])), notifyChanged: vi.fn() }

    render(
      <RepoStoreContext.Provider value={repoStore as EditorRepoStore}>
        <DraftStoreContext.Provider value={draftStore as DraftStore}>
          <DbViewStoreContext.Provider value={dbViewStore as DbViewStore}>
            <PageEditor pageId="page-1" currentUserPubkey="npub-self" />
          </DbViewStoreContext.Provider>
        </DraftStoreContext.Provider>
      </RepoStoreContext.Provider>
    )

    const listEditor = await screen.findByLabelText('List text')
    await userEvent.click(listEditor)
    await userEvent.type(listEditor, ' updated')

    const listCalls = vi.mocked(draftStore.stage).mock.calls.filter(([pageId, blockId]) => pageId === 'page-1' && blockId === 'block-1')
    expect(listCalls.length).toBeGreaterThan(0)
    expect(listCalls.some(([, , content]) => (content as Record<string, unknown>).kind === 'bullet')).toBe(true)
  })

  it('starts numbered lists at 1 regardless of the stored block order', async () => {
    const listPage: Page = {
      ...readyPage,
      blocks: [
        {
          id: 'block-1',
          type: 'list',
          parentBlockId: null,
          order: 9,
          content: { text: 'First item', kind: 'numbered' },
          updatedAt: 1000,
        },
      ],
    }
    const repoStore: Partial<EditorRepoStore> = {
      pageTree$: of({ pages: {} }),
      observePage: vi.fn(() => of({ status: 'ready', page: listPage })),
      listPageRevisions: vi.fn(() => []),
    }
    const draftStore: Partial<DraftStore> = { stage: vi.fn(), drafts$: of({}), flush: vi.fn() }
    const dbViewStore: Partial<DbViewStore> = { observeRows: vi.fn(() => of([])), notifyChanged: vi.fn() }

    render(
      <RepoStoreContext.Provider value={repoStore as EditorRepoStore}>
        <DraftStoreContext.Provider value={draftStore as DraftStore}>
          <DbViewStoreContext.Provider value={dbViewStore as DbViewStore}>
            <PageEditor pageId="page-1" currentUserPubkey="npub-self" />
          </DbViewStoreContext.Provider>
        </DraftStoreContext.Provider>
      </RepoStoreContext.Provider>
    )

    expect(await screen.findByLabelText('List text')).toHaveTextContent('First item')
    expect(document.querySelector('ol')).toBeInTheDocument()
  })

  it('allows editing an existing numbered list item', async () => {
    const listPage: Page = {
      ...readyPage,
      blocks: [
        {
          id: 'block-1',
          type: 'list',
          parentBlockId: null,
          order: 0,
          content: { text: 'First item', kind: 'numbered' },
          updatedAt: 1000,
        },
      ],
    }
    const repoStore: Partial<EditorRepoStore> = {
      pageTree$: of({ pages: {} }),
      observePage: vi.fn(() => of({ status: 'ready', page: listPage })),
      listPageRevisions: vi.fn(() => []),
    }
    const draftStore: Partial<DraftStore> = { stage: vi.fn(), drafts$: of({}), flush: vi.fn() }
    const dbViewStore: Partial<DbViewStore> = { observeRows: vi.fn(() => of([])), notifyChanged: vi.fn() }

    render(
      <RepoStoreContext.Provider value={repoStore as EditorRepoStore}>
        <DraftStoreContext.Provider value={draftStore as DraftStore}>
          <DbViewStoreContext.Provider value={dbViewStore as DbViewStore}>
            <PageEditor pageId="page-1" currentUserPubkey="npub-self" />
          </DbViewStoreContext.Provider>
        </DraftStoreContext.Provider>
      </RepoStoreContext.Provider>
    )

    const listEditor = await screen.findByLabelText('List text')
    await userEvent.click(listEditor)
    await userEvent.type(listEditor, ' updated')

    const listCalls = vi.mocked(draftStore.stage).mock.calls.filter(([pageId, blockId]) => pageId === 'page-1' && blockId === 'block-1')
    expect(listCalls.length).toBeGreaterThan(0)
    expect(listCalls.some(([, , content]) => (content as Record<string, unknown>).kind === 'numbered')).toBe(true)
  })

  it('keeps Enter inside a numbered list item within the same block (second instance)', async () => {
    const listPage: Page = {
      ...readyPage,
      blocks: [
        {
          id: 'block-1',
          type: 'list',
          parentBlockId: null,
          order: 0,
          content: { text: 'First item', kind: 'numbered' },
          updatedAt: 1000,
        },
      ],
    }
    const repoStore: Partial<EditorRepoStore> = {
      pageTree$: of({ pages: {} }),
      observePage: vi.fn(() => of({ status: 'ready', page: listPage })),
      listPageRevisions: vi.fn(() => []),
    }
    const draftStore: Partial<DraftStore> = { stage: vi.fn(), drafts$: of({}), flush: vi.fn() }
    const dbViewStore: Partial<DbViewStore> = { observeRows: vi.fn(() => of([])), notifyChanged: vi.fn() }

    render(
      <RepoStoreContext.Provider value={repoStore as EditorRepoStore}>
        <DraftStoreContext.Provider value={draftStore as DraftStore}>
          <DbViewStoreContext.Provider value={dbViewStore as DbViewStore}>
            <PageEditor pageId="page-1" currentUserPubkey="npub-self" />
          </DbViewStoreContext.Provider>
        </DraftStoreContext.Provider>
      </RepoStoreContext.Provider>
    )

    const listEditor = await screen.findByLabelText('List text')
    await userEvent.click(listEditor)
    await userEvent.keyboard('{Enter}')

    const listCalls = vi.mocked(draftStore.stage).mock.calls.filter(([pageId]) => pageId === 'page-1')
    expect(listCalls.length).toBeGreaterThan(0)
    expect(listCalls.every(([, blockId]) => blockId === 'block-1')).toBe(true)
  })

  it('shows Nostr contacts in the invite menu and persists selected collaborators', async () => {
    const repoStore: Partial<EditorRepoStore> = {
      pageTree$: of({ pages: {} }),
      observePage: vi.fn(() => of({ status: 'ready', page: readyPage })),
      listPageRevisions: vi.fn(() => []),
    }
    const draftStore: Partial<DraftStore> = { stage: vi.fn(), drafts$: of({}), flush: vi.fn() }
    const dbViewStore: Partial<DbViewStore> = { observeRows: vi.fn(() => of([])), notifyChanged: vi.fn() }

    render(
      <RepoStoreContext.Provider value={repoStore as EditorRepoStore}>
        <DraftStoreContext.Provider value={draftStore as DraftStore}>
          <DbViewStoreContext.Provider value={dbViewStore as DbViewStore}>
            <PageEditor
              pageId="page-1"
              workspaceId="workspace-1"
              currentUserPubkey="npub-self"
              relayUrls={['wss://relay.example']}
            />
          </DbViewStoreContext.Provider>
        </DraftStoreContext.Provider>
      </RepoStoreContext.Provider>
    )

    await userEvent.click(screen.getByRole('button', { name: /invite collaborators/i }))

    expect(await screen.findByText('Alice Smith')).toBeInTheDocument()
    expect(await screen.findByText('Bob')).toBeInTheDocument()
    expect(screen.getAllByAltText('')[0]).toHaveAttribute('src', 'https://example.com/alice.png')

    const aliceButton = screen.getByText('Alice Smith').closest('button')
    expect(aliceButton).not.toBeNull()
    if (aliceButton) {
      await userEvent.click(aliceButton)
    }

    expect(JSON.parse(localStorage.getItem('grid34_page_collaborators_workspace-1_page-1') ?? '[]')).toEqual(['npub-contact-1'])
  })

  it('adds a new block from the plus button, then focuses it after choosing a type', async () => {
    const repoStore: Partial<EditorRepoStore> = {
      pageTree$: of({ pages: {} }),
      observePage: vi.fn(() => of({ status: 'ready', page: readyPage })),
      listPageRevisions: vi.fn(() => []),
    }
    const draftStore: Partial<DraftStore> = { stage: vi.fn(), drafts$: of({}), flush: vi.fn() }
    const dbViewStore: Partial<DbViewStore> = { observeRows: vi.fn(() => of([])), notifyChanged: vi.fn() }

    render(
      <RepoStoreContext.Provider value={repoStore as EditorRepoStore}>
        <DraftStoreContext.Provider value={draftStore as DraftStore}>
          <DbViewStoreContext.Provider value={dbViewStore as DbViewStore}>
            <PageEditor pageId="page-1" currentUserPubkey="npub-self" />
          </DbViewStoreContext.Provider>
        </DraftStoreContext.Provider>
      </RepoStoreContext.Provider>
    )

    await userEvent.click(await screen.findByRole('button', { name: /add block/i }))

    expect(draftStore.stage).toHaveBeenCalledWith(
      'page-1',
      expect.any(String),
      expect.objectContaining({
        type: 'paragraph',
        text: '',
        richText: null,
      })
    )
    expect(await screen.findByText(/basic blocks/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /plain text block/i }))

    expect(restoreBlockEditorFocus).toHaveBeenCalledWith(expect.any(String))
    await waitFor(() => {
      expect(screen.queryByText(/basic blocks/i)).not.toBeInTheDocument()
    })
  })

  it('renders read-only and blocks edits when the current user is not authorized', async () => {
    localStorage.setItem('grid34_workspace_owner_workspace-1', 'npub-owner')
    localStorage.setItem('grid34_page_collaborators_workspace-1_page-1', JSON.stringify(['npub-contact-1']))

    const emptyPage: Page = { id: 'page-1', title: 'Empty', parentId: null, order: 0, updatedAt: 1000, blocks: [] }
    const repoStore: Partial<EditorRepoStore> = {
      pageTree$: of({ pages: {} }),
      observePage: vi.fn(() => of({ status: 'ready', page: emptyPage })),
      listPageRevisions: vi.fn(() => []),
    }
    const draftStore: Partial<DraftStore> = { stage: vi.fn(), drafts$: of({}), flush: vi.fn() }
    const dbViewStore: Partial<DbViewStore> = { observeRows: vi.fn(() => of([])), notifyChanged: vi.fn() }

    const { container } = render(
      <RepoStoreContext.Provider value={repoStore as EditorRepoStore}>
        <DraftStoreContext.Provider value={draftStore as DraftStore}>
          <DbViewStoreContext.Provider value={dbViewStore as DbViewStore}>
            <PageEditor pageId="page-1" workspaceId="workspace-1" currentUserPubkey="npub-guest" relayUrls={['wss://relay.example']} />
          </DbViewStoreContext.Provider>
        </DraftStoreContext.Provider>
      </RepoStoreContext.Provider>
    )

    expect(await screen.findByText(/read only/i)).toBeInTheDocument()

    const contentDiv = container.querySelector('.page-editor__content')
    expect(contentDiv).toBeInTheDocument()
    if (contentDiv) {
      contentDiv.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    }

    expect(draftStore.stage).not.toHaveBeenCalled()
  })
})

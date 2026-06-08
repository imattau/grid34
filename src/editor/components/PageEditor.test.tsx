import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { of } from 'rxjs'
import { PageEditor } from './PageEditor'
import { RepoStoreContext, DraftStoreContext, DbViewStoreContext, type EditorRepoStore } from '../contexts/storeContexts'
import type { DraftStore } from '../stores/draftStore'
import type { DbViewStore } from '../stores/dbViewStore'
import type { Page } from '../../storage/repo/types'

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

function renderEditor(status: 'loading' | 'ready' | 'locked', page?: Page) {
  const repoStore: Partial<EditorRepoStore> = {
    pageTree$: of({ pages: {} }),
    observePage: vi.fn(() => of({ status, page })),
  }
  const draftStore: Partial<DraftStore> = { stage: vi.fn(), drafts$: of({}), flush: vi.fn() }
  const dbViewStore: Partial<DbViewStore> = { observeRows: vi.fn(() => of([])), notifyChanged: vi.fn() }

  return render(
    <RepoStoreContext.Provider value={repoStore as EditorRepoStore}>
      <DraftStoreContext.Provider value={draftStore as DraftStore}>
        <DbViewStoreContext.Provider value={dbViewStore as DbViewStore}>
          <PageEditor pageId="page-1" />
        </DbViewStoreContext.Provider>
      </DraftStoreContext.Provider>
    </RepoStoreContext.Provider>
  )
}

describe('PageEditor', () => {
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
    renderEditor('ready', readyPage)

    expect(screen.getByLabelText('Paragraph text')).toHaveTextContent('Hello')
    expect(screen.getByDisplayValue('My Page')).toBeInTheDocument()
  })
})

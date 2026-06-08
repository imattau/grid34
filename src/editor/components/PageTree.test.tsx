import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { of } from 'rxjs'
import { PageTree } from './PageTree'
import { RepoStoreContext, DraftStoreContext, type EditorRepoStore } from '../contexts/storeContexts'
import type { PageTreeState } from '../../storage/repo/types'
import type { DraftStore } from '../stores/draftStore'

const treeState: PageTreeState = {
  pages: {
    'page-1': { id: 'page-1', title: 'Parent Page', parentId: null, order: 0, blocks: [], updatedAt: 1000 },
    'page-2': { id: 'page-2', title: 'Child Page', parentId: 'page-1', order: 0, blocks: [], updatedAt: 1000 },
  },
}

function renderTree(onSelect: (pageId: string) => void) {
  const repoStore: Partial<EditorRepoStore> = {
    pageTree$: of(treeState),
    observePage: vi.fn(),
  }
  const draftStore: Partial<DraftStore> = {
    createPage: vi.fn(() => 'new-page-id'),
    renamePage: vi.fn(),
    deletePage: vi.fn(),
  }
  return render(
    <RepoStoreContext.Provider value={repoStore as EditorRepoStore}>
      <DraftStoreContext.Provider value={draftStore as DraftStore}>
        <PageTree onSelectPage={onSelect} selectedPageId={null} />
      </DraftStoreContext.Provider>
    </RepoStoreContext.Provider>
  )
}

describe('PageTree', () => {
  it('renders an expandable tree of pages from RepoStore.pageTree$, ordered by parentId/order', () => {
    renderTree(vi.fn())

    expect(screen.getByText('Parent Page')).toBeInTheDocument()
    expect(screen.getByText('Child Page')).toBeInTheDocument()
  })

  it('emits onSelectPage with the clicked page id', async () => {
    const onSelect = vi.fn()
    renderTree(onSelect)

    await userEvent.click(screen.getByText('Child Page'))

    expect(onSelect).toHaveBeenCalledWith('page-2')
  })
})

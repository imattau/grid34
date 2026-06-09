import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { of } from 'rxjs'
import { RelationBlock } from './RelationBlock'
import { DraftStoreContext, RepoStoreContext, type EditorRepoStore } from '../contexts/storeContexts'
import type { DraftStore } from '../stores/draftStore'
import type { Block, PageTreeState } from '../../storage/repo/types'

function makeBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: 'relation-1',
    type: 'relation',
    parentBlockId: null,
    order: 0,
    content: { linkedPageId: '' },
    updatedAt: 1000,
    ...overrides,
  }
}

const pageTree: PageTreeState = {
  pages: {
    'page-a': { id: 'page-a', title: 'Alpha', parentId: null, order: 0, blocks: [], updatedAt: 1000 },
    'page-b': { id: 'page-b', title: 'Beta', parentId: 'page-a', order: 0, blocks: [], updatedAt: 1000 },
  },
}

function renderBlock(block: Block, draftStore: Partial<DraftStore>) {
  const repoStore: Partial<EditorRepoStore> = {
    pageTree$: of(pageTree),
    observePage: vi.fn(),
    listPageRevisions: vi.fn(),
  }

  return render(
    <RepoStoreContext.Provider value={repoStore as EditorRepoStore}>
      <DraftStoreContext.Provider value={draftStore as DraftStore}>
        <RelationBlock block={block} pageId="page-1" />
      </DraftStoreContext.Provider>
    </RepoStoreContext.Provider>
  )
}

describe('RelationBlock', () => {
  it('renders the page selector and preview', () => {
    renderBlock(makeBlock({ content: { linkedPageId: 'page-b' } }), { stage: vi.fn() })

    expect(screen.getByLabelText('Related page')).toHaveValue('page-b')
    expect(screen.getByText('Page ID: page-b')).toBeInTheDocument()
  })

  it('stages the selected linked page', async () => {
    const stage = vi.fn()
    renderBlock(makeBlock(), { stage })

    await userEvent.selectOptions(screen.getByLabelText('Related page'), 'page-a')

    expect(stage).toHaveBeenLastCalledWith(
      'page-1',
      'relation-1',
      expect.objectContaining({ linkedPageId: 'page-a' })
    )
  })
})

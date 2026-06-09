import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { BookmarkBlock } from './BookmarkBlock'
import { DraftStoreContext } from '../contexts/storeContexts'
import type { DraftStore } from '../stores/draftStore'
import type { Block } from '../../storage/repo/types'

function makeBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: 'bookmark-1',
    type: 'bookmark',
    parentBlockId: null,
    order: 0,
    content: {
      url: 'https://example.com/articles/grid34',
      title: 'Example Article',
      description: 'A reference link',
      thumbnail: '',
    },
    updatedAt: 1000,
    ...overrides,
  }
}

function renderBlock(block: Block, draftStore: Partial<DraftStore>) {
  return render(
    <DraftStoreContext.Provider value={draftStore as DraftStore}>
      <BookmarkBlock block={block} pageId="page-1" />
    </DraftStoreContext.Provider>
  )
}

describe('BookmarkBlock', () => {
  it('renders the bookmark preview', () => {
    renderBlock(makeBlock(), { stage: vi.fn() })

    expect(screen.getByLabelText('Bookmark URL')).toHaveValue('https://example.com/articles/grid34')
    expect(screen.getByLabelText('Bookmark title')).toHaveValue('Example Article')
    expect(screen.getByLabelText('Bookmark description')).toHaveValue('A reference link')
  })

  it('stages URL edits', () => {
    const stage = vi.fn()
    renderBlock(makeBlock(), { stage })

    fireEvent.change(screen.getByLabelText('Bookmark URL'), { target: { value: 'https://openai.com' } })

    expect(stage).toHaveBeenLastCalledWith(
      'page-1',
      'bookmark-1',
      expect.objectContaining({ url: 'https://openai.com' })
    )
  })
})

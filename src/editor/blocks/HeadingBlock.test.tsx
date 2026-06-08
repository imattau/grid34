import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HeadingBlock } from './HeadingBlock'
import { DraftStoreContext } from '../contexts/storeContexts'
import type { DraftStore } from '../stores/draftStore'
import type { Block } from '../../storage/repo/types'

function makeBlock(overrides: Partial<Block> = {}): Block {
  return { id: 'block-1', type: 'heading', parentBlockId: null, order: 0, content: { text: 'Title', level: 2 }, updatedAt: 1000, ...overrides }
}

function renderWithDraftStore(block: Block, draftStore: Partial<DraftStore>) {
  return render(
    <DraftStoreContext.Provider value={draftStore as DraftStore}>
      <HeadingBlock block={block} pageId="page-1" />
    </DraftStoreContext.Provider>
  )
}

describe('HeadingBlock', () => {
  it('renders an h2 with the block.content.level', () => {
    renderWithDraftStore(makeBlock(), { stage: vi.fn() })
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument()
  })

  it('calls DraftStore.stage preserving the level when the user edits the text', async () => {
    const stage = vi.fn()
    renderWithDraftStore(makeBlock(), { stage })

    const textbox = screen.getByDisplayValue('Title')
    await userEvent.clear(textbox)
    await userEvent.type(textbox, 'New Title')

    expect(stage).toHaveBeenLastCalledWith('page-1', 'block-1', { text: 'New Title', level: 2 })
  })
})

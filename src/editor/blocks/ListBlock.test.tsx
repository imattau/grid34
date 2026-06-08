import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ListBlock } from './ListBlock'
import { DraftStoreContext } from '../contexts/storeContexts'
import type { DraftStore } from '../stores/draftStore'
import type { Block } from '../../storage/repo/types'

function makeBlock(overrides: Partial<Block> = {}): Block {
  return { id: 'block-1', type: 'list', parentBlockId: null, order: 0, content: { text: 'First item', kind: 'bullet' }, updatedAt: 1000, ...overrides }
}

function renderWithDraftStore(block: Block, draftStore: Partial<DraftStore>) {
  return render(
    <DraftStoreContext.Provider value={draftStore as DraftStore}>
      <ListBlock block={block} pageId="page-1" />
    </DraftStoreContext.Provider>
  )
}

describe('ListBlock', () => {
  it('renders a bullet list item marker for kind "bullet"', () => {
    renderWithDraftStore(makeBlock(), { stage: vi.fn() })
    expect(screen.getByText('•')).toBeInTheDocument()
    expect(screen.getByLabelText('List item text')).toHaveTextContent('First item')
  })

  it('renders a numbered marker for kind "numbered"', () => {
    renderWithDraftStore(makeBlock({ content: { text: 'First item', kind: 'numbered' } }), { stage: vi.fn() })
    expect(screen.getByText('1.')).toBeInTheDocument()
  })

  it('calls DraftStore.stage preserving the kind when the user edits the text', async () => {
    const stage = vi.fn()
    renderWithDraftStore(makeBlock(), { stage })

    const textbox = screen.getByLabelText('List item text')
    await userEvent.clear(textbox)
    await userEvent.type(textbox, 'Updated item')

    expect(stage).toHaveBeenCalledWith('page-1', 'block-1', expect.objectContaining({ text: 'Updated item', kind: 'bullet' }))
  })
})

import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ParagraphBlock } from './ParagraphBlock'
import { DraftStoreContext } from '../contexts/storeContexts'
import type { DraftStore } from '../stores/draftStore'
import type { Block } from '../../storage/repo/types'

function makeBlock(overrides: Partial<Block> = {}): Block {
  return { id: 'block-1', type: 'paragraph', parentBlockId: null, order: 0, content: { text: 'Hello' }, updatedAt: 1000, ...overrides }
}

function renderWithDraftStore(block: Block, draftStore: Partial<DraftStore>) {
  return render(
    <DraftStoreContext.Provider value={draftStore as DraftStore}>
      <ParagraphBlock block={block} pageId="page-1" />
    </DraftStoreContext.Provider>
  )
}

describe('ParagraphBlock', () => {
  it('renders the block text content', () => {
    renderWithDraftStore(makeBlock(), { stage: vi.fn() })
    expect(screen.getByLabelText('Paragraph text')).toHaveTextContent('Hello')
  })

  it('calls DraftStore.stage with the updated content when the user types', async () => {
    const stage = vi.fn()
    renderWithDraftStore(makeBlock(), { stage })

    const textbox = screen.getByLabelText('Paragraph text')
    await userEvent.clear(textbox)
    await userEvent.type(textbox, 'Hi there')

    expect(stage).toHaveBeenCalledWith('page-1', 'block-1', expect.objectContaining({ text: 'Hi there' }))
  })
})

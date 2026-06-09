import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { QuoteBlock } from './QuoteBlock'
import { DraftStoreContext } from '../contexts/storeContexts'
import type { DraftStore } from '../stores/draftStore'
import type { Block } from '../../storage/repo/types'

function makeBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: 'quote-1',
    type: 'quote',
    parentBlockId: null,
    order: 0,
    content: { text: 'Quoted text', attribution: 'Ada Lovelace' },
    updatedAt: 1000,
    ...overrides,
  }
}

function renderBlock(block: Block, draftStore: Partial<DraftStore>) {
  return render(
    <DraftStoreContext.Provider value={draftStore as DraftStore}>
      <QuoteBlock block={block} pageId="page-1" />
    </DraftStoreContext.Provider>
  )
}

describe('QuoteBlock', () => {
  it('renders the quote text and attribution', () => {
    renderBlock(makeBlock(), { stage: vi.fn() })

    expect(screen.getByLabelText('Quote text')).toHaveTextContent('Quoted text')
    expect(screen.getByLabelText('Quote attribution')).toHaveValue('Ada Lovelace')
  })

  it('stages attribution edits', () => {
    const stage = vi.fn()
    renderBlock(makeBlock(), { stage })

    fireEvent.change(screen.getByLabelText('Quote attribution'), { target: { value: 'Grace Hopper' } })

    expect(stage).toHaveBeenLastCalledWith(
      'page-1',
      'quote-1',
      expect.objectContaining({ attribution: 'Grace Hopper' })
    )
  })
})

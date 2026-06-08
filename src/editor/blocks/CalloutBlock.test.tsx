import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CalloutBlock } from './CalloutBlock'
import { DraftStoreContext } from '../contexts/storeContexts'
import type { DraftStore } from '../stores/draftStore'
import type { Block } from '../../storage/repo/types'

function makeBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: 'callout-1',
    type: 'callout',
    parentBlockId: null,
    order: 0,
    content: { text: 'Note content', emoji: '💡' },
    updatedAt: 1000,
    ...overrides,
  }
}

function renderWithDraftStore(block: Block, draftStore: Partial<DraftStore>) {
  return render(
    <DraftStoreContext.Provider value={draftStore as DraftStore}>
      <CalloutBlock block={block} pageId="page-1" />
    </DraftStoreContext.Provider>
  )
}

describe('CalloutBlock', () => {
  it('renders callout content and default emoji', () => {
    renderWithDraftStore(makeBlock(), { stage: vi.fn() })
    expect(screen.getByText('💡')).toBeInTheDocument()
    expect(screen.getByLabelText('Callout text')).toHaveTextContent('Note content')
  })
})

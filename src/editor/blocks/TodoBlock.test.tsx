import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TodoBlock } from './TodoBlock'
import { DraftStoreContext } from '../contexts/storeContexts'
import type { DraftStore } from '../stores/draftStore'
import type { Block } from '../../storage/repo/types'

function makeBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: 'todo-1',
    type: 'todo',
    parentBlockId: null,
    order: 0,
    content: { text: 'Buy groceries' },
    updatedAt: 1000,
    ...overrides,
  }
}

function renderWithDraftStore(block: Block, draftStore: Partial<DraftStore>) {
  return render(
    <DraftStoreContext.Provider value={draftStore as DraftStore}>
      <TodoBlock block={block} pageId="page-1" />
    </DraftStoreContext.Provider>
  )
}

describe('TodoBlock', () => {
  it('renders todo block correctly', () => {
    renderWithDraftStore(makeBlock(), { stage: vi.fn() })
    expect(screen.getByLabelText('Todo list text')).toBeInTheDocument()
  })
})

import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
    content: { text: 'Buy groceries', checked: false },
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
  it('renders unchecked todo correctly', () => {
    renderWithDraftStore(makeBlock(), { stage: vi.fn() })
    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).not.toBeChecked()
    expect(screen.getByLabelText('Todo list item')).toHaveTextContent('Buy groceries')
  })

  it('toggles checkbox and stages the change', async () => {
    const stage = vi.fn()
    renderWithDraftStore(makeBlock(), { stage })
    const checkbox = screen.getByRole('checkbox')
    await userEvent.click(checkbox)
    expect(stage).toHaveBeenCalledWith('page-1', 'todo-1', expect.objectContaining({ checked: true }))
  })
})

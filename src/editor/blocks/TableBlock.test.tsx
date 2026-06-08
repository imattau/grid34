import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TableBlock } from './TableBlock'
import { DraftStoreContext } from '../contexts/storeContexts'
import type { DraftStore } from '../stores/draftStore'
import type { Block } from '../../storage/repo/types'

function makeBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: 'table-1',
    type: 'table',
    parentBlockId: null,
    order: 0,
    content: {
      headers: ['Col A', 'Col B'],
      rows: [
        ['A1', 'B1'],
        ['A2', 'B2'],
      ],
    },
    updatedAt: 1000,
    ...overrides,
  }
}

function renderWithDraftStore(block: Block, draftStore: Partial<DraftStore>) {
  return render(
    <DraftStoreContext.Provider value={draftStore as DraftStore}>
      <TableBlock block={block} pageId="page-1" />
    </DraftStoreContext.Provider>
  )
}

describe('TableBlock', () => {
  it('renders table headers and cells correctly', () => {
    renderWithDraftStore(makeBlock(), { stage: vi.fn() })
    expect(screen.getAllByPlaceholderText('Header')[0]).toHaveValue('Col A')
    expect(screen.getAllByPlaceholderText('Empty')[0]).toHaveValue('A1')
  })

  it('stages content changes on blur', () => {
    const stage = vi.fn()
    renderWithDraftStore(makeBlock(), { stage })
    const cellInput = screen.getAllByPlaceholderText('Empty')[0]
    fireEvent.change(cellInput, { target: { value: 'New Val' } })
    fireEvent.blur(cellInput)
    expect(stage).toHaveBeenCalledWith(
      'page-1',
      'table-1',
      expect.objectContaining({
        rows: [
          ['New Val', 'B1'],
          ['A2', 'B2'],
        ],
      })
    )
  })
})

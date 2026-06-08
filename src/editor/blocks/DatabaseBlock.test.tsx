import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { of } from 'rxjs'
import { DatabaseBlock } from './DatabaseBlock'
import { DraftStoreContext, DbViewStoreContext } from '../contexts/storeContexts'
import type { DraftStore } from '../stores/draftStore'
import type { DbViewStore } from '../stores/dbViewStore'
import type { Block } from '../../storage/repo/types'
import type { Row, ViewSpec } from '../types'

function makeBlock(overrides: Partial<Block> = {}): Block {
  const viewSpec: ViewSpec = { databaseId: 'db-1', columns: ['name', 'qty'] }
  return { id: 'db-1', type: 'database', parentBlockId: null, order: 0, content: viewSpec as unknown as Record<string, unknown>, updatedAt: 1000, ...overrides }
}

const fakeRows: Row[] = [
  { id: 'row-1', values: { name: 'Apples', qty: 3 } },
  { id: 'row-2', values: { name: 'Bananas', qty: 5 } },
]

function renderBlock(block: Block, draftStore: Partial<DraftStore>, dbViewStore: Partial<DbViewStore>) {
  return render(
    <DraftStoreContext.Provider value={draftStore as DraftStore}>
      <DbViewStoreContext.Provider value={dbViewStore as DbViewStore}>
        <DatabaseBlock block={block} pageId="page-1" />
      </DbViewStoreContext.Provider>
    </DraftStoreContext.Provider>
  )
}

describe('DatabaseBlock', () => {
  it('renders a table with columns and rows from DbViewStore.observeRows', () => {
    const observeRows = vi.fn(() => of(fakeRows))
    renderBlock(makeBlock(), { stage: vi.fn() }, { observeRows })

    expect(observeRows).toHaveBeenCalledWith('db-1', { databaseId: 'db-1', columns: ['name', 'qty'] })
    expect(screen.getByRole('columnheader', { name: 'name' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'qty' })).toBeInTheDocument()
    expect(screen.getByText('Apples')).toBeInTheDocument()
    expect(screen.getByText('Bananas')).toBeInTheDocument()
  })

  it('stages a row-content update on the owning database block when a cell is edited', async () => {
    const observeRows = vi.fn(() => of(fakeRows))
    const stage = vi.fn()
    renderBlock(makeBlock(), { stage }, { observeRows })

    const cell = screen.getByDisplayValue('Apples')
    fireEvent.change(cell, { target: { value: 'Avocados' } })

    expect(stage).toHaveBeenLastCalledWith(
      'page-1',
      'db-1',
      expect.objectContaining({
        databaseId: 'db-1',
        rowEdits: { 'row-1': { name: 'Avocados' } },
      })
    )
  })
})

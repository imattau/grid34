import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CodeBlock } from './CodeBlock'
import { DraftStoreContext } from '../contexts/storeContexts'
import type { DraftStore } from '../stores/draftStore'
import type { Block } from '../../storage/repo/types'

function makeBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: 'code-1',
    type: 'code',
    parentBlockId: null,
    order: 0,
    content: { code: 'console.log("hello")', language: 'javascript' },
    updatedAt: 1000,
    ...overrides,
  }
}

function renderWithDraftStore(block: Block, draftStore: Partial<DraftStore>) {
  return render(
    <DraftStoreContext.Provider value={draftStore as DraftStore}>
      <CodeBlock block={block} pageId="page-1" />
    </DraftStoreContext.Provider>
  )
}

describe('CodeBlock', () => {
  it('renders default code content', () => {
    renderWithDraftStore(makeBlock(), { stage: vi.fn() })
    expect(screen.getByPlaceholderText('// Write code here...')).toHaveValue('console.log("hello")')
  })

  it('stages code changes on input typing', async () => {
    const stage = vi.fn()
    renderWithDraftStore(makeBlock(), { stage })
    const textarea = screen.getByPlaceholderText('// Write code here...')
    fireEvent.change(textarea, { target: { value: 'const x = 5' } })
    expect(stage).toHaveBeenCalledWith('page-1', 'code-1', expect.objectContaining({ code: 'const x = 5' }))
  })
})

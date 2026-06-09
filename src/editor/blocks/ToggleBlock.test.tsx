import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToggleBlock } from './ToggleBlock'
import { DraftStoreContext } from '../contexts/storeContexts'
import type { DraftStore } from '../stores/draftStore'
import type { Block } from '../../storage/repo/types'

function makeBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: 'toggle-1',
    type: 'toggle',
    parentBlockId: null,
    order: 0,
    content: { title: 'Read more', text: 'Body copy', collapsed: false },
    updatedAt: 1000,
    ...overrides,
  }
}

function renderBlock(block: Block, draftStore: Partial<DraftStore>) {
  return render(
    <DraftStoreContext.Provider value={draftStore as DraftStore}>
      <ToggleBlock block={block} pageId="page-1" />
    </DraftStoreContext.Provider>
  )
}

describe('ToggleBlock', () => {
  it('renders the title and body when expanded', () => {
    renderBlock(makeBlock(), { stage: vi.fn() })

    expect(screen.getByLabelText('Toggle title')).toHaveValue('Read more')
    expect(screen.getByLabelText('Toggle content')).toHaveTextContent('Body copy')
  })

  it('collapses the body when toggled', async () => {
    const stage = vi.fn()
    renderBlock(makeBlock(), { stage })

    await userEvent.click(screen.getByRole('button', { name: /collapse toggle/i }))

    expect(stage).toHaveBeenLastCalledWith(
      'page-1',
      'toggle-1',
      expect.objectContaining({ collapsed: true })
    )
  })
})

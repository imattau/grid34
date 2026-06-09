import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TemplateBlock } from './TemplateBlock'
import { DraftStoreContext } from '../contexts/storeContexts'
import type { DraftStore } from '../stores/draftStore'
import type { Block } from '../../storage/repo/types'

function makeBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: 'template-1',
    type: 'template',
    parentBlockId: null,
    order: 0,
    content: { templateKey: 'meeting-notes', richText: '<h2>Meeting notes</h2>', text: 'Meeting notes' },
    updatedAt: 1000,
    ...overrides,
  }
}

function renderBlock(block: Block, draftStore: Partial<DraftStore>) {
  return render(
    <DraftStoreContext.Provider value={draftStore as DraftStore}>
      <TemplateBlock block={block} pageId="page-1" />
    </DraftStoreContext.Provider>
  )
}

describe('TemplateBlock', () => {
  it('shows the active template preset', () => {
    renderBlock(makeBlock(), { stage: vi.fn() })

    expect(screen.getByLabelText('Template preset')).toHaveValue('meeting-notes')
    expect(screen.getByLabelText('Template content')).toHaveTextContent('Meeting notes')
  })

  it('stages a new preset when the selection changes', async () => {
    const stage = vi.fn()
    renderBlock(makeBlock(), { stage })

    await userEvent.selectOptions(screen.getByLabelText('Template preset'), 'daily-log')

    expect(stage).toHaveBeenLastCalledWith(
      'page-1',
      'template-1',
      expect.objectContaining({
        templateKey: 'daily-log',
        text: 'Daily log',
      })
    )
  })

  it('inserts a hard break on Enter instead of splitting the block', () => {
    const onSplitBlock = vi.fn()
    render(
      <DraftStoreContext.Provider value={{ stage: vi.fn() } as DraftStore}>
        <TemplateBlock block={makeBlock()} pageId="page-1" onSplitBlock={onSplitBlock} />
      </DraftStoreContext.Provider>
    )

    const editor = screen.getByLabelText('Template content')
    editor.focus()
    fireEvent.keyDown(editor, { key: 'Enter' })

    expect(onSplitBlock).not.toHaveBeenCalled()
  })
})

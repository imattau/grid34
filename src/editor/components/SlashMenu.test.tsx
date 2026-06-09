import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SlashMenu, type SlashMenuItem } from './SlashMenu'

describe('SlashMenu', () => {
  it('does not steal focus from the editor when selecting a command with the mouse', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const onClose = vi.fn()
    const item: SlashMenuItem = {
      label: 'Text',
      type: 'paragraph',
      description: 'Plain text block',
      icon: '✍️',
      content: {},
    }

    render(
      <>
        <input aria-label="editor" />
        <SlashMenu query="" rect={new DOMRect(0, 0, 1, 1)} onSelect={onSelect} onClose={onClose} />
      </>
    )

    const editor = screen.getByLabelText('editor')
    editor.focus()
    expect(editor).toHaveFocus()

    await user.click(screen.getByRole('button', { name: /text/i }))

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining(item))
    expect(editor).toHaveFocus()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('includes the knowledge-set block types', () => {
    render(
      <SlashMenu query="" rect={new DOMRect(0, 0, 1, 1)} onSelect={vi.fn()} onClose={vi.fn()} />
    )

    expect(screen.getByText('Writing')).toBeInTheDocument()
    expect(screen.getByText('Structure')).toBeInTheDocument()
    expect(screen.getByText('Media')).toBeInTheDocument()
    expect(screen.getByText('Links')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /quote/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /toggle/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /bookmark/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /relation/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /template/i })).toBeInTheDocument()
  })
})

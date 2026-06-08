import { describe, expect, it } from 'vitest'
import { focusBlockEditor } from './focusBlockEditor'

describe('focusBlockEditor', () => {
  it('focuses the editor element for a block id when present', () => {
    const other = document.createElement('input')
    other.setAttribute('aria-label', 'other')
    document.body.appendChild(other)

    const editor = document.createElement('div')
    editor.setAttribute('data-block-id', 'block-1')
    editor.setAttribute('tabindex', '0')
    editor.contentEditable = 'true'
    editor.textContent = 'Hello world'
    document.body.appendChild(editor)

    other.focus()
    expect(other).toHaveFocus()

    expect(focusBlockEditor('block-1')).toBe(true)
    expect(editor).toHaveFocus()
    const selection = window.getSelection()
    expect(selection?.anchorNode).not.toBeNull()
    expect(selection?.anchorOffset).toBe(0)
  })

  it('returns false when the block element is missing', () => {
    expect(focusBlockEditor('missing-block')).toBe(false)
  })
})

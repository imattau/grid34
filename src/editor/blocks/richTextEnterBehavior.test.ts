import { describe, expect, it } from 'vitest'
import { getRichTextEnterBehavior, shouldSplitRichTextBlockOnEnter } from './richTextEnterBehavior'

describe('getRichTextEnterBehavior', () => {
  it('treats paragraph blocks as newline editing', () => {
    expect(getRichTextEnterBehavior('paragraph')).toBe('newline')
    expect(getRichTextEnterBehavior('list')).toBe('newline')
  })

  it('keeps other block types on split-block enter behavior', () => {
    expect(getRichTextEnterBehavior('heading')).toBe('split-block')
    expect(getRichTextEnterBehavior('database')).toBe('split-block')
  })

  it('splits paragraphs on Shift+Enter and other blocks on plain Enter', () => {
    expect(shouldSplitRichTextBlockOnEnter('newline', true)).toBe(true)
    expect(shouldSplitRichTextBlockOnEnter('newline', false)).toBe(false)
    expect(shouldSplitRichTextBlockOnEnter('split-block', true)).toBe(false)
    expect(shouldSplitRichTextBlockOnEnter('split-block', false)).toBe(true)
  })
})

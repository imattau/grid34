import { describe, expect, it } from 'vitest'
import { serializeRichTextContent, shouldApplyIncomingRichTextContent } from './richTextSync'

describe('richTextSync', () => {
  it('serializes plain text and rich text content distinctly', () => {
    expect(serializeRichTextContent('hello')).toBe('text:hello')
    expect(serializeRichTextContent({ type: 'doc', content: [] })).toBe('json:{"type":"doc","content":[]}')
  })

  it('skips syncing when the editor is focused or the content already matches', () => {
    const signature = 'json:{"type":"doc","content":[]}'

    expect(
      shouldApplyIncomingRichTextContent({
        incomingContent: { type: 'doc', content: [] },
        lastSyncedSignature: signature,
        editorFocused: false,
      })
    ).toBe(false)

    expect(
      shouldApplyIncomingRichTextContent({
        incomingContent: { type: 'doc', content: [{ type: 'paragraph' }] },
        lastSyncedSignature: signature,
        editorFocused: true,
      })
    ).toBe(false)

    expect(
      shouldApplyIncomingRichTextContent({
        incomingContent: { type: 'doc', content: [{ type: 'paragraph' }] },
        lastSyncedSignature: signature,
        editorFocused: false,
      })
    ).toBe(true)
  })
})

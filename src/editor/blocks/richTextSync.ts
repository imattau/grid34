export function serializeRichTextContent(content: unknown): string {
  if (typeof content === 'string') {
    return `text:${content}`
  }

  if (content && typeof content === 'object') {
    return `json:${JSON.stringify(content)}`
  }

  return 'empty:'
}

export function shouldApplyIncomingRichTextContent(options: {
  incomingContent: unknown
  lastSyncedSignature: string
  editorFocused: boolean
}): boolean {
  const incomingSignature = serializeRichTextContent(options.incomingContent)
  if (incomingSignature === options.lastSyncedSignature) return false
  if (options.editorFocused) return false
  return true
}

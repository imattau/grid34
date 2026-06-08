export type RichTextEnterBehavior = 'split-block' | 'newline'

export function getRichTextEnterBehavior(blockType: string): RichTextEnterBehavior {
  return blockType === 'paragraph' ? 'newline' : 'split-block'
}

export function shouldSplitRichTextBlockOnEnter(enterBehavior: RichTextEnterBehavior, shiftKey: boolean): boolean {
  return enterBehavior === 'newline' ? shiftKey : !shiftKey
}

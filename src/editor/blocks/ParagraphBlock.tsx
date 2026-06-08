import type { Block } from '../../storage/repo/types'
import { RichTextBlock } from './RichTextBlock'
import { getRichTextEnterBehavior } from './richTextEnterBehavior'

export interface BlockProps {
  block: Block
  pageId: string
  listIndex?: number
  onSplitBlock?: (blockId: string, before: string, after: string) => void
  onMergeWithPrevious?: (blockId: string) => void
  onOpenSlashMenu?: (blockId: string, rect: DOMRect) => void
}

export function ParagraphBlock({
  block,
  pageId,
  onSplitBlock,
  onMergeWithPrevious,
  onOpenSlashMenu,
}: BlockProps) {
  return (
    <RichTextBlock
      block={block}
      pageId={pageId}
      ariaLabel="Paragraph text"
      placeholder="Type '/' for commands..."
      className="w-full text-base leading-relaxed"
      enterBehavior={getRichTextEnterBehavior(block.type)}
      onSplitBlock={onSplitBlock}
      onMergeWithPrevious={onMergeWithPrevious}
      onOpenSlashMenu={onOpenSlashMenu}
    />
  )
}

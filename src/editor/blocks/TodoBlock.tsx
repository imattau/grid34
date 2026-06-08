import type { BlockProps } from './ParagraphBlock'
import { RichTextBlock } from './RichTextBlock'

export function TodoBlock({
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
      ariaLabel="Todo list text"
      placeholder="To-do"
      className="w-full text-base"
      enterBehavior="newline"
      onSplitBlock={onSplitBlock}
      onMergeWithPrevious={onMergeWithPrevious}
      onOpenSlashMenu={onOpenSlashMenu}
    />
  )
}

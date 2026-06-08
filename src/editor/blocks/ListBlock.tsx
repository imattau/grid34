import type { Block } from '../../storage/repo/types'
import type { BlockProps } from './ParagraphBlock'
import { RichTextBlock } from './RichTextBlock'

function listKind(block: Block): 'bullet' | 'numbered' {
  return block.content.kind === 'numbered' ? 'numbered' : 'bullet'
}

export function ListBlock({
  block,
  pageId,
  listIndex = 1,
  onSplitBlock,
  onMergeWithPrevious,
  onOpenSlashMenu,
}: BlockProps) {
  const kind = listKind(block)
  const marker = kind === 'numbered' ? `${listIndex}.` : '•'

  return (
    <RichTextBlock
      block={block}
      pageId={pageId}
      ariaLabel="List text"
      placeholder="List"
      className="w-full text-base"
      enterBehavior="newline"
      onSplitBlock={onSplitBlock}
      onMergeWithPrevious={onMergeWithPrevious}
      onOpenSlashMenu={onOpenSlashMenu}
    />
  )
}

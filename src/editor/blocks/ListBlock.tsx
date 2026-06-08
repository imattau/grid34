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
    <div
      className="flex items-start gap-2 w-full cursor-text"
      role="listitem"
    >
      <span className="pointer-events-none text-gray-400 select-none min-w-[1.25rem] text-right font-medium" aria-hidden="true">
        {marker}
      </span>
      <RichTextBlock
        block={block}
        pageId={pageId}
        ariaLabel="List item text"
        placeholder="List item"
        className="w-full text-base"
        enterBehavior="newline"
        onSplitBlock={onSplitBlock}
        onMergeWithPrevious={onMergeWithPrevious}
        onOpenSlashMenu={onOpenSlashMenu}
      />
    </div>
  )
}

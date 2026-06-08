import type { Block } from '../../storage/repo/types'
import type { BlockProps } from './ParagraphBlock'
import { RichTextBlock } from './RichTextBlock'

function listKind(block: Block): 'bullet' | 'numbered' {
  return block.content.kind === 'numbered' ? 'numbered' : 'bullet'
}

export function ListBlock({
  block,
  pageId,
  onSplitBlock,
  onMergeWithPrevious,
  onOpenSlashMenu,
}: BlockProps) {
  const kind = listKind(block)
  const marker = kind === 'numbered' ? `${block.order + 1}.` : '•'

  return (
    <div className="flex items-start gap-2 w-full" role="listitem">
      <span className="text-gray-400 select-none min-w-[1.25rem] text-right font-medium" aria-hidden="true">
        {marker}
      </span>
      <RichTextBlock
        block={block}
        pageId={pageId}
        ariaLabel="List item text"
        placeholder="List item"
        className="w-full text-base"
        onSplitBlock={onSplitBlock}
        onMergeWithPrevious={onMergeWithPrevious}
        onOpenSlashMenu={onOpenSlashMenu}
      />
    </div>
  )
}

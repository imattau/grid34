import type { Block } from '../../storage/repo/types'
import type { BlockProps } from './ParagraphBlock'
import { RichTextBlock } from './RichTextBlock'

const HEADING_TAGS = { 1: 'h1', 2: 'h2', 3: 'h3' } as const

function headingLevel(block: Block): 1 | 2 | 3 {
  const level = block.content.level
  return level === 1 || level === 2 || level === 3 ? level : 1
}

export function HeadingBlock({
  block,
  pageId,
  onSplitBlock,
  onMergeWithPrevious,
  onOpenSlashMenu,
}: BlockProps) {
  const level = headingLevel(block)
  const Tag = HEADING_TAGS[level]

  const headingClasses = {
    1: 'text-4xl font-extrabold tracking-tight scroll-m-20 my-4 outline-none',
    2: 'text-3xl font-semibold tracking-tight my-3 outline-none',
    3: 'text-2xl font-semibold tracking-tight my-2 outline-none',
  }

  return (
    <Tag className={headingClasses[level]}>
      <RichTextBlock
        block={block}
        pageId={pageId}
        ariaLabel={`Heading ${level} text`}
        placeholder={`Heading ${level}`}
        className="w-full"
        onSplitBlock={onSplitBlock}
        onMergeWithPrevious={onMergeWithPrevious}
        onOpenSlashMenu={onOpenSlashMenu}
      />
    </Tag>
  )
}

import { useDraftStore } from '../contexts/storeContexts'
import type { BlockProps } from './ParagraphBlock'
import { RichTextBlock } from './RichTextBlock'

export function QuoteBlock({
  block,
  pageId,
  onSplitBlock,
  onMergeWithPrevious,
  onOpenSlashMenu,
}: BlockProps) {
  const draftStore = useDraftStore()
  const attribution = (block.content.attribution as string) || ''

  function handleAttributionChange(value: string) {
    draftStore.stage(pageId, block.id, {
      ...block.content,
      attribution: value,
    })
  }

  return (
    <blockquote className="w-full rounded-xl border border-gray-200 bg-gray-50/70 px-4 py-3 my-3 shadow-sm dark:border-gray-800/80 dark:bg-gray-900/10">
      <div className="flex gap-3">
        <div className="select-none text-3xl leading-none text-gray-300 dark:text-gray-600">“</div>
        <div className="min-w-0 flex-1">
          <RichTextBlock
            block={block}
            pageId={pageId}
            ariaLabel="Quote text"
            placeholder="Write a quote..."
            className="w-full text-base leading-relaxed"
            enterBehavior="newline"
            onSplitBlock={onSplitBlock}
            onMergeWithPrevious={onMergeWithPrevious}
            onOpenSlashMenu={onOpenSlashMenu}
          />
          <div className="mt-3 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <span className="select-none text-gray-400 dark:text-gray-600">—</span>
            <input
              type="text"
              value={attribution}
              onChange={(event) => handleAttributionChange(event.target.value)}
              placeholder="Attribution"
              aria-label="Quote attribution"
              className="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-gray-400 focus:border-gray-200 focus:bg-white dark:focus:border-gray-700 dark:focus:bg-gray-950/20 dark:text-gray-200"
            />
          </div>
        </div>
      </div>
    </blockquote>
  )
}

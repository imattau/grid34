import type { BlockProps } from './ParagraphBlock'
import { RichTextBlock } from './RichTextBlock'
import { useDraftStore } from '../contexts/storeContexts'

export function TodoBlock({
  block,
  pageId,
  onSplitBlock,
  onMergeWithPrevious,
  onOpenSlashMenu,
}: BlockProps) {
  const draftStore = useDraftStore()
  const checked = !!block.content.checked

  const handleToggle = () => {
    draftStore.stage(pageId, block.id, {
      ...block.content,
      checked: !checked,
    })
  }

  return (
    <div className="flex items-start gap-2 w-full py-0.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={handleToggle}
        className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
      />
      <div className={`w-full min-w-0 ${checked ? 'line-through text-gray-400 dark:text-gray-500 transition-all duration-150' : ''}`}>
        <RichTextBlock
          block={block}
          pageId={pageId}
          ariaLabel="Todo list item"
          placeholder="To-do"
          className="w-full text-base leading-relaxed"
          enterBehavior="split-block"
          onSplitBlock={onSplitBlock}
          onMergeWithPrevious={onMergeWithPrevious}
          onOpenSlashMenu={onOpenSlashMenu}
        />
      </div>
    </div>
  )
}

import { useDraftStore } from '../contexts/storeContexts'
import type { BlockProps } from './ParagraphBlock'
import { RichTextBlock } from './RichTextBlock'

export function ToggleBlock({
  block,
  pageId,
  onSplitBlock,
  onMergeWithPrevious,
  onOpenSlashMenu,
}: BlockProps) {
  const draftStore = useDraftStore()
  const collapsed = block.content.collapsed === true
  const title = (block.content.title as string) || 'Toggle'

  function handleTitleChange(value: string) {
    draftStore.stage(pageId, block.id, {
      ...block.content,
      title: value,
    })
  }

  function handleToggleCollapsed() {
    draftStore.stage(pageId, block.id, {
      ...block.content,
      collapsed: !collapsed,
    })
  }

  return (
    <div className="w-full rounded-xl border border-gray-200 bg-white my-3 overflow-hidden shadow-sm dark:border-gray-800/80 dark:bg-gray-900/10">
      <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2 bg-gray-50/80 dark:border-gray-800 dark:bg-gray-950/20">
        <button
          type="button"
          onClick={handleToggleCollapsed}
          className="text-gray-400 hover:text-gray-700 transition-colors select-none dark:text-gray-500 dark:hover:text-gray-300"
          aria-label={collapsed ? 'Expand toggle' : 'Collapse toggle'}
        >
          <span className={`inline-block transition-transform ${collapsed ? '-rotate-90' : ''}`}>▾</span>
        </button>
        <input
          type="text"
          value={title}
          onChange={(event) => handleTitleChange(event.target.value)}
          aria-label="Toggle title"
          placeholder="Toggle title"
          className="w-full bg-transparent text-sm font-semibold text-gray-700 outline-none placeholder:text-gray-400 dark:text-gray-200 dark:placeholder:text-gray-500"
        />
      </div>
      {!collapsed && (
        <div className="px-3 py-2 dark:bg-gray-950/5">
          <RichTextBlock
            block={block}
            pageId={pageId}
            ariaLabel="Toggle content"
            placeholder="Write toggle content..."
            className="w-full text-base leading-relaxed"
            enterBehavior="newline"
            onSplitBlock={onSplitBlock}
            onMergeWithPrevious={onMergeWithPrevious}
            onOpenSlashMenu={onOpenSlashMenu}
          />
        </div>
      )}
    </div>
  )
}

import { useState } from 'react'
import type { BlockProps } from './ParagraphBlock'
import { RichTextBlock } from './RichTextBlock'
import { useDraftStore } from '../contexts/storeContexts'

export function CalloutBlock({
  block,
  pageId,
  onSplitBlock,
  onMergeWithPrevious,
  onOpenSlashMenu,
}: BlockProps) {
  const draftStore = useDraftStore()
  const emoji = (block.content.emoji as string) || '💡'
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)

  const emojis = ['💡', '⚠️', '⭐', 'ℹ️', '🔥', '📌', '🚀', '🛑', '✅', '🎉']

  const handleSelectEmoji = (newEmoji: string) => {
    draftStore.stage(pageId, block.id, {
      ...block.content,
      emoji: newEmoji,
    })
    setShowEmojiPicker(false)
  }

  return (
    <div className="w-full flex items-start gap-3 p-4 rounded-xl border border-gray-200/80 bg-gray-50/50 dark:border-gray-800/80 dark:bg-gray-900/10 my-2 relative">
      <div className="relative select-none">
        <button
          type="button"
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          className="text-xl hover:scale-110 active:scale-95 transition-transform duration-100 cursor-pointer"
          title="Change icon"
        >
          {emoji}
        </button>
        {showEmojiPicker && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowEmojiPicker(false)} />
            <div className="absolute top-8 left-0 z-50 bg-white dark:bg-gray-950 border border-gray-250 dark:border-gray-800 rounded-lg p-1.5 shadow-lg flex gap-1 w-max">
              {emojis.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => handleSelectEmoji(em)}
                  className="text-base p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-all cursor-pointer"
                >
                  {em}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="flex-1 min-w-0 text-base leading-relaxed text-gray-800 dark:text-gray-200">
        <RichTextBlock
          block={block}
          pageId={pageId}
          ariaLabel="Callout text"
          placeholder="Callout note..."
          className="w-full"
          enterBehavior="newline"
          onSplitBlock={onSplitBlock}
          onMergeWithPrevious={onMergeWithPrevious}
          onOpenSlashMenu={onOpenSlashMenu}
        />
      </div>
    </div>
  )
}

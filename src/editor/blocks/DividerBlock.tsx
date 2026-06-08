import type { Block } from '../../storage/repo/types'
import type { BlockProps } from './ParagraphBlock'

export function DividerBlock({
  block,
  pageId,
}: BlockProps) {
  return (
    <div
      className="w-full py-4 flex items-center justify-center select-none"
      contentEditable={false}
      aria-label="Divider"
    >
      <hr className="w-full border-t border-gray-200 dark:border-gray-800" />
    </div>
  )
}

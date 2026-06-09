import { useDraftStore } from '../contexts/storeContexts'
import type { BlockProps } from './ParagraphBlock'

function getBookmarkHost(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url.trim()
  }
}

export function BookmarkBlock({ block, pageId }: BlockProps) {
  const draftStore = useDraftStore()
  const url = (block.content.url as string) || ''
  const title = (block.content.title as string) || ''
  const description = (block.content.description as string) || ''
  const thumbnail = (block.content.thumbnail as string) || ''
  const host = url ? getBookmarkHost(url) : 'Bookmark link'

  function stageBookmark(next: Partial<Record<string, unknown>>) {
    draftStore.stage(pageId, block.id, {
      ...block.content,
      ...next,
    })
  }

  return (
    <div className="w-full rounded-xl border border-gray-200 bg-white my-3 overflow-hidden shadow-sm dark:border-gray-800/80 dark:bg-gray-900/10">
      <div className="border-b border-gray-100 px-3 py-2 bg-gray-50/80 flex items-center justify-between gap-3 dark:border-gray-800 dark:bg-gray-950/20">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Bookmark</div>
          <div className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{title || host}</div>
        </div>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="flex-shrink-0 rounded-full border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-500 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Open
          </a>
        )}
      </div>
      <div className="grid gap-3 p-3 md:grid-cols-[120px_minmax(0,1fr)]">
        <div className="space-y-2">
          <input
            type="url"
            value={url}
            onChange={(event) => stageBookmark({ url: event.target.value })}
            placeholder="https://example.com"
            aria-label="Bookmark URL"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-gray-300 dark:border-gray-700 dark:bg-gray-950/20 dark:text-gray-200 dark:placeholder:text-gray-500"
          />
          <input
            type="text"
            value={title}
            onChange={(event) => stageBookmark({ title: event.target.value })}
            placeholder="Title"
            aria-label="Bookmark title"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-gray-300 dark:border-gray-700 dark:bg-gray-950/20 dark:text-gray-200 dark:placeholder:text-gray-500"
          />
          <textarea
            value={description}
            onChange={(event) => stageBookmark({ description: event.target.value })}
            placeholder="Description"
            aria-label="Bookmark description"
            className="w-full min-h-20 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-gray-300 resize-y dark:border-gray-700 dark:bg-gray-950/20 dark:text-gray-200 dark:placeholder:text-gray-500"
          />
        </div>
        <div className="min-w-0 rounded-xl border border-gray-200 bg-gray-50/70 p-3 dark:border-gray-800 dark:bg-gray-950/20">
          <div className="flex items-start gap-3">
            <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
              {thumbnail ? (
                <img src={thumbnail} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-gray-400 dark:text-gray-500">
                  {host.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{title || host}</div>
              <div className="truncate text-xs text-gray-500 dark:text-gray-400">{url || 'Add a URL to preview the bookmark'}</div>
              <p className="mt-2 text-sm text-gray-600 line-clamp-4 dark:text-gray-300">
                {description || 'Add a title and description to turn this into a useful preview card.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

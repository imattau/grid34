import { useEffect, useMemo, useState } from 'react'
import { useDraftStore, useRepoStore } from '../contexts/storeContexts'
import type { BlockProps } from './ParagraphBlock'
import type { Page, PageTreeState } from '../../storage/repo/types'

function childrenOf(state: PageTreeState, parentId: string | null): Page[] {
  return Object.values(state.pages)
    .filter((page) => page.parentId === parentId && !page.deleted)
    .sort((a, b) => a.order - b.order)
}

function flattenPages(state: PageTreeState, parentId: string | null = null, depth = 0): Array<{ page: Page; depth: number }> {
  const pages = childrenOf(state, parentId)
  const result: Array<{ page: Page; depth: number }> = []
  for (const page of pages) {
    result.push({ page, depth })
    result.push(...flattenPages(state, page.id, depth + 1))
  }
  return result
}

export function RelationBlock({ block, pageId }: BlockProps) {
  const draftStore = useDraftStore()
  const repoStore = useRepoStore()
  const [pageTree, setPageTree] = useState<PageTreeState>({ pages: {} })
  const linkedPageId = (block.content.linkedPageId as string) || ''

  useEffect(() => {
    const subscription = repoStore.pageTree$.subscribe(setPageTree)
    return () => subscription.unsubscribe()
  }, [repoStore])

  const linkedPage = linkedPageId ? pageTree.pages[linkedPageId] : undefined
  const pages = useMemo(() => flattenPages(pageTree), [pageTree])

  function handleSelectPage(nextPageId: string) {
    draftStore.stage(pageId, block.id, {
      ...block.content,
      linkedPageId: nextPageId || null,
    })
  }

  return (
    <div className="w-full rounded-xl border border-gray-200 bg-white my-3 overflow-hidden shadow-sm dark:border-gray-800/80 dark:bg-gray-900/10">
      <div className="border-b border-gray-100 px-3 py-2 bg-gray-50/80 dark:border-gray-800 dark:bg-gray-950/20">
        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Relation</div>
        <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          {linkedPage?.title || 'Link another page'}
        </div>
      </div>
      <div className="grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500" htmlFor={`relation-${block.id}`}>
            Related page
          </label>
          <select
            id={`relation-${block.id}`}
            value={linkedPageId}
            onChange={(event) => handleSelectPage(event.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-gray-300 bg-white dark:border-gray-700 dark:bg-gray-950/20 dark:text-gray-200"
            aria-label="Related page"
          >
            <option value="">Select a page</option>
            {pages.map(({ page, depth }) => (
              <option key={page.id} value={page.id}>
                {`${'— '.repeat(depth)}${page.title}`}
              </option>
            ))}
          </select>
        </div>
        <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-3 dark:border-gray-800 dark:bg-gray-950/20">
          {linkedPage ? (
            <>
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Preview</div>
              <div className="mt-1 text-sm font-semibold text-gray-800 dark:text-gray-100">{linkedPage.title}</div>
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">Page ID: {linkedPage.id}</div>
            </>
          ) : (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Pick a page to turn this block into a semantic link to another page.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useRepoStore } from '../contexts/storeContexts'
import type { Page, PageTreeState } from '../../storage/repo/types'

export interface PageTreeProps {
  selectedPageId: string | null
  onSelectPage: (pageId: string) => void
}

function childrenOf(state: PageTreeState, parentId: string | null): Page[] {
  return Object.values(state.pages)
    .filter((page) => page.parentId === parentId)
    .sort((a, b) => a.order - b.order)
}

function PageNode({
  page,
  state,
  selectedPageId,
  onSelectPage,
}: {
  page: Page
  state: PageTreeState
  selectedPageId: string | null
  onSelectPage: (pageId: string) => void
}) {
  const children = childrenOf(state, page.id)
  return (
    <li>
      <button
        type="button"
        aria-current={page.id === selectedPageId ? 'true' : undefined}
        onClick={() => onSelectPage(page.id)}
      >
        {page.title}
      </button>
      {children.length > 0 && (
        <ul>
          {children.map((child) => (
            <PageNode
              key={child.id}
              page={child}
              state={state}
              selectedPageId={selectedPageId}
              onSelectPage={onSelectPage}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

export function PageTree({ selectedPageId, onSelectPage }: PageTreeProps) {
  const repoStore = useRepoStore()
  const [state, setState] = useState<PageTreeState>({ pages: {} })

  useEffect(() => {
    const subscription = repoStore.pageTree$.subscribe(setState)
    return () => subscription.unsubscribe()
  }, [repoStore])

  const roots = childrenOf(state, null)

  return (
    <nav aria-label="Page tree">
      <ul>
        {roots.map((page) => (
          <PageNode key={page.id} page={page} state={state} selectedPageId={selectedPageId} onSelectPage={onSelectPage} />
        ))}
      </ul>
    </nav>
  )
}

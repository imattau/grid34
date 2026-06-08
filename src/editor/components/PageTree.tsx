import { useEffect, useState, useRef } from 'react'
import { useRepoStore, useDraftStore } from '../contexts/storeContexts'
import type { Page, PageTreeState } from '../../storage/repo/types'

export interface PageTreeProps {
  selectedPageId: string | null
  onSelectPage: (pageId: string) => void
}

function childrenOf(state: PageTreeState, parentId: string | null): Page[] {
  return Object.values(state.pages)
    .filter((page) => page.parentId === parentId && !page.deleted)
    .sort((a, b) => a.order - b.order)
}

function PageNode({
  page,
  state,
  selectedPageId,
  onSelectPage,
  collapsedMap,
  onToggleCollapse,
}: {
  page: Page
  state: PageTreeState
  selectedPageId: string | null
  onSelectPage: (pageId: string) => void
  collapsedMap: Record<string, boolean>
  onToggleCollapse: (pageId: string) => void
}) {
  const draftStore = useDraftStore()
  const children = childrenOf(state, page.id)
  const isCollapsed = !!collapsedMap[page.id]
  const isSelected = page.id === selectedPageId
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(page.title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  function handleCreateChild(e: React.MouseEvent) {
    e.stopPropagation()
    const newPageId = draftStore.createPage(page.id, 'Untitled')
    // Auto-expand parent if collapsed
    if (isCollapsed) {
      onToggleCollapse(page.id)
    }
    onSelectPage(newPageId)
  }

  function handleDeletePage(e: React.MouseEvent) {
    e.stopPropagation()
    const confirmDelete = window.confirm(`Are you sure you want to delete "${page.title}"?`)
    if (confirmDelete) {
      draftStore.deletePage(page.id)
      if (isSelected) {
        // Navigate to parent page, or tree root
        if (page.parentId) {
          onSelectPage(page.parentId)
        } else {
          const roots = childrenOf(state, null).filter((r) => r.id !== page.id)
          if (roots.length > 0) {
            onSelectPage(roots[0].id)
          }
        }
      }
    }
  }

  function handleSaveRename() {
    setIsEditing(false)
    const cleaned = editTitle.trim()
    if (cleaned && cleaned !== page.title) {
      draftStore.renamePage(page.id, cleaned)
    } else {
      setEditTitle(page.title)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      handleSaveRename()
    } else if (e.key === 'Escape') {
      setIsEditing(false)
      setEditTitle(page.title)
    }
  }

  const icon = page.icon || '📄'

  return (
    <li className="list-none my-0.5">
      <div
        className={`group flex items-center justify-between gap-1 px-2 py-1 rounded-lg cursor-pointer transition-colors relative ${
          isSelected ? 'bg-gray-150 border-gray-200 bg-gray-100 font-medium' : 'hover:bg-gray-50 text-gray-700'
        }`}
        onClick={() => onSelectPage(page.id)}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {/* Collapse toggle caret */}
          <button
            type="button"
            className={`p-0.5 rounded hover:bg-gray-200 text-gray-400 transition-transform ${
              isCollapsed ? '-rotate-90' : ''
            } ${children.length === 0 ? 'opacity-0 cursor-default' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              if (children.length > 0) {
                onToggleCollapse(page.id)
              }
            }}
            disabled={children.length === 0}
            title={isCollapsed ? 'Expand' : 'Collapse'}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Page Emoji Icon */}
          <span className="select-none text-base">{icon}</span>

          {/* Page Title / Editable input */}
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              className="bg-white border border-gray-300 rounded px-1 py-0.5 text-sm w-full outline-none focus:ring-2 focus:ring-gray-300"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={handleSaveRename}
              onKeyDown={handleKeyDown}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              onDoubleClick={(e) => {
                e.stopPropagation()
                setIsEditing(true)
              }}
              className="truncate text-sm select-none"
              title="Double click to rename"
            >
              {page.title}
            </span>
          )}
        </div>

        {/* Hover-revealed actions (add child, delete) */}
        {!isEditing && (
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 z-10 transition-opacity">
            <button
              type="button"
              className="p-1 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-900"
              onClick={handleCreateChild}
              title="Add a page inside"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
            <button
              type="button"
              className="p-1 rounded hover:bg-gray-200 text-gray-500 hover:text-red-600"
              onClick={handleDeletePage}
              title="Delete page"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Children rendering */}
      {children.length > 0 && !isCollapsed && (
        <ul className="pl-4 ml-2 border-l border-gray-100 flex flex-col gap-0.5">
          {children.map((child) => (
            <PageNode
              key={child.id}
              page={child}
              state={state}
              selectedPageId={selectedPageId}
              onSelectPage={onSelectPage}
              collapsedMap={collapsedMap}
              onToggleCollapse={onToggleCollapse}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

export function PageTree({ selectedPageId, onSelectPage }: PageTreeProps) {
  const repoStore = useRepoStore()
  const draftStore = useDraftStore()
  const [state, setState] = useState<PageTreeState>({ pages: {} })
  const [collapsedMap, setCollapsedMap] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const subscription = repoStore.pageTree$.subscribe(setState)
    return () => subscription.unsubscribe()
  }, [repoStore])

  function handleToggleCollapse(pageId: string) {
    setCollapsedMap((prev) => ({
      ...prev,
      [pageId]: !prev[pageId],
    }))
  }

  function handleCreateRootPage() {
    const newPageId = draftStore.createPage(null, 'Untitled')
    onSelectPage(newPageId)
  }

  const roots = childrenOf(state, null)

  return (
    <nav aria-label="Page tree" className="flex flex-col gap-2 w-full">
      <div className="flex flex-col gap-0.5">
        {roots.map((page) => (
          <PageNode
            key={page.id}
            page={page}
            state={state}
            selectedPageId={selectedPageId}
            onSelectPage={onSelectPage}
            collapsedMap={collapsedMap}
            onToggleCollapse={handleToggleCollapse}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={handleCreateRootPage}
        className="mt-2 text-xs font-semibold text-gray-500 hover:text-gray-900 hover:bg-gray-100/50 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg border border-dashed border-gray-300 hover:border-gray-400 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        New Page
      </button>
    </nav>
  )
}

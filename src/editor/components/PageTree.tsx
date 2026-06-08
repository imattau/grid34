import { useEffect, useState, useRef } from 'react'
import { useRepoStore, useDraftStore } from '../contexts/storeContexts'
import type { Page, PageTreeState } from '../../storage/repo/types'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export interface PageTreeProps {
  selectedPageId: string | null
  onSelectPage: (pageId: string | null) => void
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
  onSelectPage: (pageId: string | null) => void
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

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: page.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  function handleCreateChild(e: React.MouseEvent) {
    e.stopPropagation()
    const newPageId = draftStore.createPage(page.id, 'Untitled')
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
        if (page.parentId) {
          onSelectPage(page.parentId)
        } else {
          const roots = childrenOf(state, null).filter((r) => r.id !== page.id)
          if (roots.length > 0) {
            onSelectPage(roots[0].id)
          } else {
            onSelectPage(null)
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
    <li ref={setNodeRef} style={style} className="list-none my-0.5">
      <div
        className={`group sidebar-page-item flex w-full items-center justify-between gap-1 px-2 cursor-pointer transition-colors relative ${
          isSelected ? 'bg-gray-150 border-gray-200 bg-gray-100 font-medium' : 'hover:bg-gray-50 text-gray-700'
        }`}
        onClick={() => onSelectPage(page.id)}
      >
        <div className="flex items-center gap-1 min-w-0 flex-1">
          {/* Drag handle */}
          <span
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing p-0.5 text-gray-400 hover:text-gray-600 select-none text-[10px] flex-shrink-0"
            title="Drag to reorder"
          >
            ⠿
          </span>

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
          <div className="sidebar-page-item__actions opacity-0 group-hover:opacity-100 flex items-center justify-end gap-0.5 z-10 transition-opacity">
            <button
              type="button"
              className="sidebar-page-action text-gray-500 hover:text-gray-900 hover:bg-gray-200"
              onClick={handleCreateChild}
              title="Add a page inside"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
            <button
              type="button"
              className="sidebar-page-action text-gray-500 hover:bg-gray-200 hover:text-red-600"
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
        <SortableContext items={children.map((child) => child.id)} strategy={verticalListSortingStrategy}>
          <ul className="pl-3.5 flex flex-col gap-0.5">
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
        </SortableContext>
      )}
    </li>
  )
}

export function PageTree({ selectedPageId, onSelectPage }: PageTreeProps) {
  const repoStore = useRepoStore()
  const draftStore = useDraftStore()
  const [state, setState] = useState<PageTreeState>({ pages: {} })
  const [collapsedMap, setCollapsedMap] = useState<Record<string, boolean>>({})

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

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

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeId = active.id as string
    const overId = over.id as string

    const activePage = state.pages[activeId]
    const overPage = state.pages[overId]
    if (!activePage || !overPage) return

    const newParentId = overPage.parentId
    const siblings = childrenOf(state, newParentId).filter((p) => p.id !== activeId)
    const overIndex = siblings.findIndex((p) => p.id === overId)

    let newOrder = 0
    if (siblings.length === 0) {
      newOrder = 1.0
    } else if (overIndex === 0) {
      newOrder = siblings[0].order - 1.0
    } else if (overIndex === -1 || overIndex === siblings.length - 1) {
      newOrder = siblings[siblings.length - 1].order + 1.0
    } else {
      newOrder = (siblings[overIndex].order + siblings[overIndex + 1].order) / 2.0
    }

    draftStore.movePage(activeId, newParentId, newOrder)
  }

  const roots = childrenOf(state, null)

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <nav aria-label="Page tree" className="flex flex-col gap-2 w-full">
        <SortableContext items={roots.map((p) => p.id)} strategy={verticalListSortingStrategy}>
          <ul className="list-none p-0 m-0 flex flex-col gap-0.5">
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
          </ul>
        </SortableContext>

        <button
          type="button"
          onClick={handleCreateRootPage}
          className="sidebar-control sidebar-control--action"
        >
          <svg className="sidebar-control__icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>Add a page</span>
        </button>
      </nav>
    </DndContext>
  )
}

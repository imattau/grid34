import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ReactNode } from 'react'
import type { Block } from '../../storage/repo/types'

export interface BlockChromeProps {
  block: Block
  pageId: string
  children: ReactNode
  onDelete: () => void
}

export function BlockChrome({ block, children, onDelete }: BlockChromeProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-block-id={block.id}
      className={`group relative flex items-start w-full my-1 rounded-lg hover:bg-gray-50/50 p-1 -ml-12 pl-12 transition-all duration-150 page-block--${block.type}`}
    >
      {/* Chrome controls, revealed on hover without layout shifting */}
      <div className="absolute left-2 top-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 select-none z-10">
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
          {...attributes}
          {...listeners}
          title="Drag to reorder"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M7 6a2 2 0 11-4 0 2 2 0 014 0zM7 14a2 2 0 11-4 0 2 2 0 014 0zM13 6a2 2 0 11-4 0 2 2 0 014 0zM13 14a2 2 0 11-4 0 2 2 0 014 0zM19 6a2 2 0 11-4 0 2 2 0 014 0zM19 14a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </button>

        <button
          type="button"
          onClick={onDelete}
          className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500"
          title="Delete block"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      <div className="w-full min-w-0">
        {children}
      </div>
    </div>
  )
}

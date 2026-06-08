import { useEffect, useState } from 'react'
import { useRepoStore, useDraftStore } from '../contexts/storeContexts'
import { blockComponentRegistry } from '../blocks/registry'
import { LockedPageView } from './LockedPageView'
import { BlockChrome } from './BlockChrome'
import { SlashMenu, type SlashMenuItem } from './SlashMenu'
import type { Page, Block } from '../../storage/repo/types'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'

export interface PageEditorProps {
  pageId: string
}

interface PageObservation {
  status: 'loading' | 'ready' | 'locked'
  page?: Page
}

export function PageEditor({ pageId }: PageEditorProps) {
  const repoStore = useRepoStore()
  const draftStore = useDraftStore()
  const [observation, setObservation] = useState<PageObservation>({ status: 'loading' })
  const [slashMenu, setSlashMenu] = useState<{ blockId: string; rect: DOMRect; query: string } | null>(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [title, setTitle] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  useEffect(() => {
    setObservation({ status: 'loading' })
    const subscription = repoStore.observePage(pageId).subscribe(setObservation)
    return () => subscription.unsubscribe()
  }, [repoStore, pageId])

  useEffect(() => {
    if (observation.page) {
      setTitle(observation.page.title)
    }
  }, [observation.page?.id, observation.page?.title])

  if (observation.status === 'loading') {
    return <p role="status">Decrypting…</p>
  }

  if (observation.status === 'locked' || !observation.page) {
    return <LockedPageView pageId={pageId} pageTitle={observation.page?.title ?? ''} />
  }

  const page = observation.page

  const sortedBlocks = page.blocks
    .slice()
    .sort((a, b) => a.order - b.order)

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = sortedBlocks.findIndex((b) => b.id === active.id)
    const newIndex = sortedBlocks.findIndex((b) => b.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    let newOrder = 0
    if (newIndex === 0) {
      newOrder = sortedBlocks[0].order - 1.0
    } else if (newIndex === sortedBlocks.length - 1) {
      newOrder = sortedBlocks[sortedBlocks.length - 1].order + 1.0
    } else {
      const prevOrder = sortedBlocks[newIndex < oldIndex ? newIndex - 1 : newIndex].order
      const nextOrder = sortedBlocks[newIndex < oldIndex ? newIndex : newIndex + 1].order
      newOrder = (prevOrder + nextOrder) / 2.0
    }

    const activeBlock = sortedBlocks[oldIndex]
    draftStore.stage(pageId, activeBlock.id, {
      ...activeBlock.content,
      order: newOrder,
    })
  }

  function handleSplitBlock(blockId: string, before: string, after: string) {
    const index = sortedBlocks.findIndex((b) => b.id === blockId)
    if (index === -1) return

    const currentBlock = sortedBlocks[index]

    draftStore.stage(pageId, blockId, {
      ...currentBlock.content,
      text: before,
      richText: null,
    })

    let newOrder = 0
    if (index === sortedBlocks.length - 1) {
      newOrder = currentBlock.order + 1.0
    } else {
      newOrder = (currentBlock.order + sortedBlocks[index + 1].order) / 2.0
    }

    const newBlockId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15)
    draftStore.stage(pageId, newBlockId, {
      type: currentBlock.type,
      order: newOrder,
      text: after,
      richText: null,
      parentBlockId: currentBlock.parentBlockId,
    })
  }

  function handleMergeWithPrevious(blockId: string) {
    const index = sortedBlocks.findIndex((b) => b.id === blockId)
    if (index <= 0) return

    const currentBlock = sortedBlocks[index]
    const prevBlock = sortedBlocks[index - 1]

    const prevText = (prevBlock.content.text as string) || ''
    const currentText = (currentBlock.content.text as string) || ''

    draftStore.stage(pageId, prevBlock.id, {
      ...prevBlock.content,
      text: prevText + currentText,
      richText: null,
    })

    draftStore.stage(pageId, blockId, {
      deleted: true,
    })
  }

  function handleDeleteBlock(blockId: string) {
    draftStore.stage(pageId, blockId, {
      deleted: true,
    })
  }

  function handleOpenSlashMenu(blockId: string, rect: DOMRect, query: string) {
    if (query === '' && slashMenu?.blockId === blockId) {
      setSlashMenu(null)
    } else if (rect.width > 0 || rect.height > 0) {
      setSlashMenu({ blockId, rect, query })
    }
  }

  function handleSelectSlashMenuItem(item: SlashMenuItem) {
    if (!slashMenu) return
    const blockId = slashMenu.blockId
    const currentBlock = sortedBlocks.find((b) => b.id === blockId)
    if (!currentBlock) return

    draftStore.stage(pageId, blockId, {
      ...currentBlock.content,
      type: item.type,
      ...item.content,
      text: '',
      richText: null,
    })

    setSlashMenu(null)
  }

  const emojis = ['📄', '📝', '💡', '📅', '🛠️', '🚀', '📚', '💻', '🎨', '🏠', '🔥', '⭐', '🎉', '👤', '💬']

  function handleSaveTitle() {
    const cleaned = title.trim()
    if (cleaned && cleaned !== page.title) {
      draftStore.renamePage(pageId, cleaned)
    } else {
      setTitle(page.title)
    }
  }

  return (
    <article className="page-editor w-full animate-fade-in" aria-label={page.title}>
      <header className="page-editor__header mb-8 relative">
        <div className="page-editor__breadcrumbs text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">Page</div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="text-4xl hover:bg-gray-100 p-2 rounded-xl transition-all duration-200 select-none cursor-pointer hover:scale-105 active:scale-95"
              title="Click to change page icon"
            >
              {page.icon || '📄'}
            </button>
            {showEmojiPicker && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowEmojiPicker(false)}
                />
                <div className="absolute top-full left-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-lg p-3 z-50 grid grid-cols-5 gap-2 w-48 animate-in fade-in slide-in-from-top-1 duration-150">
                  {emojis.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        draftStore.changePageIcon(pageId, emoji)
                        setShowEmojiPicker(false)
                      }}
                      className="text-xl hover:bg-gray-150 hover:scale-110 active:scale-95 p-1.5 rounded-lg transition-all duration-150 text-center select-none"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <input
            type="text"
            className="page-editor__title text-4xl font-bold tracking-tight text-gray-950 bg-transparent border-none outline-none focus:ring-0 p-0 m-0 w-full hover:bg-gray-50/50 rounded-lg px-2 -mx-2 transition-colors duration-150"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleSaveTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur()
              }
            }}
            placeholder="Untitled"
          />
        </div>
      </header>

      <div
        className="page-editor__content flex flex-col min-w-0"
        onClick={(e) => {
          if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('empty-state-placeholder')) {
            if (sortedBlocks.length === 0) {
              const newBlockId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15)
              draftStore.stage(pageId, newBlockId, {
                type: 'paragraph',
                order: 1.0,
                text: '',
                richText: null,
              })
            } else {
              const editors = e.currentTarget.querySelectorAll('.ProseMirror')
              if (editors.length > 0) {
                const lastEditor = editors[editors.length - 1] as HTMLElement
                lastEditor.focus()
              }
            }
          }
        }}
      >
        {sortedBlocks.length === 0 && (
          <div className="empty-state-placeholder text-gray-400 text-sm py-4 px-2 cursor-text hover:bg-gray-50/50 rounded-lg transition-colors select-none">
            Press here to start writing, or type '/' for commands...
          </div>
        )}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sortedBlocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
            {sortedBlocks.map((block) => {
              const Component = blockComponentRegistry[block.type as keyof typeof blockComponentRegistry]
              if (!Component) return null
              return (
                <BlockChrome
                  key={block.id}
                  block={block}
                  pageId={pageId}
                  onDelete={() => handleDeleteBlock(block.id)}
                >
                  <Component
                    block={block}
                    pageId={pageId}
                    onSplitBlock={handleSplitBlock}
                    onMergeWithPrevious={handleMergeWithPrevious}
                    onOpenSlashMenu={handleOpenSlashMenu}
                  />
                </BlockChrome>
              )
            })}
          </SortableContext>
        </DndContext>
      </div>

      {slashMenu && (
        <SlashMenu
          query={slashMenu.query}
          rect={slashMenu.rect}
          onSelect={handleSelectSlashMenuItem}
          onClose={() => setSlashMenu(null)}
        />
      )}
    </article>
  )
}

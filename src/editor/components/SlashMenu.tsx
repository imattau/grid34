import { useEffect, useState, useRef } from 'react'
import { getSlashMenuPlacement } from './slashMenuPlacement'

export interface SlashMenuItem {
  label: string
  type: string
  description: string
  icon: string
  content: Record<string, unknown>
}

export const SLASH_MENU_ITEMS: SlashMenuItem[] = [
  { label: 'Text', type: 'paragraph', description: 'Plain text block', icon: '✍️', content: {} },
  { label: 'Heading 1', type: 'heading', description: 'Large section heading', icon: '🥞', content: { level: 1 } },
  { label: 'Heading 2', type: 'heading', description: 'Medium section heading', icon: '🥞', content: { level: 2 } },
  { label: 'Heading 3', type: 'heading', description: 'Small section heading', icon: '🥞', content: { level: 3 } },
  { label: 'Bulleted list', type: 'list', description: 'Simple bulleted list', icon: '•', content: { kind: 'bullet' } },
  { label: 'Numbered list', type: 'list', description: 'Numbered list', icon: '1.', content: { kind: 'numbered' } },
]

interface SlashMenuProps {
  query: string
  rect: DOMRect
  onSelect: (item: SlashMenuItem) => void
  onClose: () => void
}

export function SlashMenu({ query, rect, onSelect, onClose }: SlashMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)
  const [placement, setPlacement] = useState(() =>
    getSlashMenuPlacement(rect, window.innerWidth, window.innerHeight, 300, 280)
  )

  const filteredItems = SLASH_MENU_ITEMS.filter((item) =>
    item.label.toLowerCase().includes(query.toLowerCase()) ||
    item.description.toLowerCase().includes(query.toLowerCase())
  )

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    setPlacement(getSlashMenuPlacement(rect, window.innerWidth, window.innerHeight, 300, 280))
  }, [rect])

  // Handle global keyboard events for menu navigation while editor is focused
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => (filteredItems.length ? (prev + 1) % filteredItems.length : 0))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => (filteredItems.length ? (prev - 1 + filteredItems.length) % filteredItems.length : 0))
      } else if (e.key === 'Enter') {
        if (filteredItems.length && filteredItems[selectedIndex]) {
          e.preventDefault()
          onSelect(filteredItems[selectedIndex])
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [filteredItems, selectedIndex, onSelect, onClose])

  if (filteredItems.length === 0) {
    return (
      <div
        ref={menuRef}
        style={{
          position: 'fixed',
          top: placement.top,
          left: placement.left,
          maxHeight: placement.maxHeight,
        }}
        className="z-50 min-w-[240px] bg-white border border-gray-200 rounded-lg shadow-xl p-3 text-sm text-gray-500"
      >
        No matching block types
      </div>
    )
  }

  return (
    <div
      ref={menuRef}
      onMouseDown={(e) => {
        e.preventDefault()
      }}
      style={{
        position: 'fixed',
        top: placement.top,
        left: placement.left,
        maxHeight: placement.maxHeight,
      }}
      className="z-50 min-w-[280px] bg-white border border-gray-200 rounded-xl shadow-xl p-1.5 max-h-[300px] overflow-y-auto"
    >
      <div className="px-2.5 py-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
        Basic Blocks
      </div>
      {filteredItems.map((item, index) => {
        const isSelected = index === selectedIndex
        return (
          <button
            key={item.label}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault()
            }}
            onClick={() => onSelect(item)}
            className={`w-full text-left flex items-center gap-3 px-2.5 py-2 rounded-lg transition-colors ${
              isSelected ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <div className="w-8 h-8 rounded bg-gray-50 border border-gray-100 flex items-center justify-center text-sm font-semibold select-none text-gray-500">
              {item.icon}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium leading-none">{item.label}</span>
              <span className="text-xs text-gray-400 mt-1 truncate">{item.description}</span>
            </div>
          </button>
        )
      })}
    </div>
  )
}

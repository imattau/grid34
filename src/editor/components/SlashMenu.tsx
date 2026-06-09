import { useEffect, useMemo, useState, useRef } from 'react'
import { KNOWLEDGE_TEMPLATES } from '../blocks/knowledgeTemplates'
import { getSlashMenuPlacement } from './slashMenuPlacement'

export interface SlashMenuItem {
  label: string
  type: string
  description: string
  icon: string
  content: Record<string, unknown>
}

interface SlashMenuGroup {
  label: string
  items: SlashMenuItem[]
}

const SLASH_MENU_GROUPS: SlashMenuGroup[] = [
  {
    label: 'Writing',
    items: [
      { label: 'Text', type: 'paragraph', description: 'Plain text block', icon: '✍️', content: {} },
      { label: 'Heading 1', type: 'heading', description: 'Large section heading', icon: '🥞', content: { level: 1 } },
      { label: 'Heading 2', type: 'heading', description: 'Medium section heading', icon: '🥞', content: { level: 2 } },
      { label: 'Heading 3', type: 'heading', description: 'Small section heading', icon: '🥞', content: { level: 3 } },
      { label: 'Quote', type: 'quote', description: 'Quoted writing with attribution', icon: '❝', content: { text: '', attribution: '' } },
      { label: 'Callout', type: 'callout', description: 'Highlight writing', icon: '💡', content: { emoji: '💡' } },
      { label: 'Template', type: 'template', description: 'Starter document structure', icon: '🧩', content: { templateKey: KNOWLEDGE_TEMPLATES[0].key, richText: KNOWLEDGE_TEMPLATES[0].content, text: KNOWLEDGE_TEMPLATES[0].label } },
      { label: 'Toggle', type: 'toggle', description: 'Collapsible note section', icon: '▾', content: { title: 'Toggle', collapsed: false, text: '' } },
    ],
  },
  {
    label: 'Structure',
    items: [
      { label: 'Bulleted list', type: 'list', description: 'Simple bulleted list', icon: '•', content: { kind: 'bullet' } },
      { label: 'Numbered list', type: 'list', description: 'Numbered list', icon: '1.', content: { kind: 'numbered' } },
      { label: 'To-do list', type: 'todo', description: 'Checkbox todo item', icon: '☑️', content: { checked: false } },
      { label: 'Divider', type: 'divider', description: 'Visually divide sections', icon: '―', content: {} },
      { label: 'Table', type: 'table', description: 'Simple static table grid', icon: '📋', content: { headers: ['Column 1', 'Column 2'], rows: [['', ''], ['', '']] } },
      { label: 'Database', type: 'database', description: 'Structured database view', icon: '🗄️', content: {} },
    ],
  },
  {
    label: 'Media',
    items: [
      { label: 'Image', type: 'image', description: 'NIP-44 encrypted image upload', icon: '🖼️', content: {} },
      { label: 'Code sandbox', type: 'code', description: 'Code block with sandbox runner', icon: '💻', content: { code: '', language: 'javascript' } },
      { label: 'Bookmark', type: 'bookmark', description: 'Link preview card', icon: '🔖', content: { url: '', title: '', description: '', thumbnail: '' } },
    ],
  },
  {
    label: 'Links',
    items: [
      { label: 'Relation', type: 'relation', description: 'Link to another page', icon: '🔗', content: { linkedPageId: null } },
    ],
  },
]

function flattenSlashMenuGroups(groups: SlashMenuGroup[]): SlashMenuItem[] {
  return groups.flatMap((group) => group.items)
}

function filterSlashMenuGroups(query: string): SlashMenuGroup[] {
  const lowered = query.toLowerCase()
  return SLASH_MENU_GROUPS
    .map((group) => ({
      label: group.label,
      items: group.items.filter(
        (item) =>
          item.label.toLowerCase().includes(lowered) ||
          item.description.toLowerCase().includes(lowered)
      ),
    }))
    .filter((group) => group.items.length > 0)
}

export const SLASH_MENU_ITEMS: SlashMenuItem[] = flattenSlashMenuGroups(SLASH_MENU_GROUPS)

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

  const filteredGroups = useMemo(() => filterSlashMenuGroups(query), [query])
  const filteredItems = useMemo(() => flattenSlashMenuGroups(filteredGroups), [filteredGroups])

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
        className="z-50 min-w-[240px] rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-500 shadow-xl dark:border-gray-800 dark:bg-gray-950/95 dark:text-gray-400"
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
      className="z-50 min-w-[280px] max-h-[300px] overflow-y-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl dark:border-gray-800 dark:bg-gray-950/95"
    >
      {filteredGroups.map((group, groupIndex) => {
        const groupStartIndex = filteredGroups
          .slice(0, groupIndex)
          .reduce((count, section) => count + section.items.length, 0)

        return (
          <div key={group.label} className={groupIndex > 0 ? 'mt-1 border-t border-gray-100 pt-1 dark:border-gray-800' : ''}>
            <div className="px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              {group.label}
            </div>
            {group.items.map((item, itemIndex) => {
              const index = groupStartIndex + itemIndex
              const isSelected = index === selectedIndex
              return (
                <button
                  key={item.label}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                  }}
                  onClick={() => onSelect(item)}
                  className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors ${
                    isSelected
                      ? 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-50'
                      : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-900'
                  }`}
                >
                  <div className="flex h-8 w-8 select-none items-center justify-center rounded border border-gray-100 bg-gray-50 text-sm font-semibold text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
                    {item.icon}
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <span className="text-sm font-medium leading-none">{item.label}</span>
                    <span className="mt-1 truncate text-xs text-gray-400 dark:text-gray-500">{item.description}</span>
                  </div>
                </button>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

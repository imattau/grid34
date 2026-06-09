import { ReactRenderer } from '@tiptap/react'
import React, { forwardRef, useImperativeHandle, useState, useEffect } from 'react'
import { getCachedContacts, type NostrContact } from '../contacts/nostrContacts'

export interface MentionListProps {
  items: NostrContact[]
  command: (attrs: { id: string; label: string }) => void
}

export const MentionList = forwardRef((props: MentionListProps, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0)

  const selectItem = (index: number) => {
    const item = props.items[index]
    if (item) {
      const label = item.petname || item.displayName || item.name || item.pubkey
      props.command({ id: item.pubkey, label })
    }
  }

  const upHandler = () => {
    setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length)
  }

  const downHandler = () => {
    setSelectedIndex((selectedIndex + 1) % props.items.length)
  }

  const enterHandler = () => {
    selectItem(selectedIndex)
  }

  useEffect(() => {
    setSelectedIndex(0)
  }, [props.items])

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === 'ArrowUp') {
        upHandler()
        return true
      }
      if (event.key === 'ArrowDown') {
        downHandler()
        return true
      }
      if (event.key === 'Enter') {
        enterHandler()
        return true
      }
      return false
    },
  }))

  if (!props.items.length) {
    return (
      <div className="z-50 min-w-[200px] bg-white border border-gray-200 rounded-lg shadow-xl p-3 text-sm text-gray-500">
        No contacts found
      </div>
    )
  }

  return (
    <div className="z-50 min-w-[240px] bg-white border border-gray-200 rounded-xl shadow-xl p-1.5 max-h-[300px] overflow-y-auto">
      {props.items.map((item, index) => {
        const isSelected = index === selectedIndex
        const label = item.displayName || item.name || item.petname || `${item.pubkey.slice(0, 8)}…${item.pubkey.slice(-4)}`
        const picture = item.picture || `https://robohash.org/${item.pubkey}.png?set=set4`
        return (
          <button
            key={item.pubkey}
            type="button"
            onClick={() => selectItem(index)}
            className={`w-full text-left flex items-center gap-2 px-2.5 py-2 rounded-lg transition-colors ${
              isSelected ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <img
              src={picture}
              alt=""
              className="h-6 w-6 rounded-full border border-gray-200 object-cover"
              onError={(e) => {
                e.currentTarget.src = `https://robohash.org/${item.pubkey}.png?set=set4`
              }}
            />
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium leading-none truncate">{label}</span>
              {item.petname && (item.displayName || item.name) && (
                <span className="text-[10px] text-gray-400 mt-0.5 truncate">
                  @{item.petname}
                </span>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
})

MentionList.displayName = 'MentionList'

export const mentionSuggestionConfig = {
  items: ({ query }: { query: string }): NostrContact[] => {
    const contacts = getCachedContacts()
    const lowercaseQuery = query.toLowerCase()
    return contacts.filter((contact) => {
      const petname = contact.petname?.toLowerCase() || ''
      const displayName = contact.displayName?.toLowerCase() || ''
      const name = contact.name?.toLowerCase() || ''
      const pubkey = contact.pubkey.toLowerCase()
      return (
        petname.includes(lowercaseQuery) ||
        displayName.includes(lowercaseQuery) ||
        name.includes(lowercaseQuery) ||
        pubkey.includes(lowercaseQuery)
      )
    })
  },
  render: () => {
    let component: ReactRenderer | null = null
    let popup: HTMLDivElement | null = null

    return {
      onStart: (props: any) => {
        popup = document.createElement('div')
        popup.className = 'mention-suggestions-popup'
        popup.style.position = 'fixed'
        popup.style.zIndex = '9999'
        document.body.appendChild(popup)

        component = new ReactRenderer(MentionList, {
          props,
          editor: props.editor,
        })

        if (props.clientRect) {
          const rect = props.clientRect()
          if (rect) {
            popup.style.top = `${rect.bottom + window.scrollY}px`
            popup.style.left = `${rect.left + window.scrollX}px`
          }
        }
      },
      onUpdate: (props: any) => {
        component?.updateProps(props)

        if (props.clientRect) {
          const rect = props.clientRect()
          if (rect && popup) {
            popup.style.top = `${rect.bottom + window.scrollY}px`
            popup.style.left = `${rect.left + window.scrollX}px`
          }
        }
      },
      onKeyDown: (props: any) => {
        if (props.event.key === 'Escape') {
          component?.destroy()
          popup?.remove()
          return true
        }
        return (component?.ref as any)?.onKeyDown(props) ?? false
      },
      onExit: () => {
        component?.destroy()
        popup?.remove()
      },
    }
  },
}

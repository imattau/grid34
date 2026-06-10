import { useEffect, useState } from 'react'
import { DraftStoreContext, useRepoStore, useDraftStore } from '../contexts/storeContexts'
import { blockComponentRegistry } from '../blocks/registry'
import { LockedPageView } from './LockedPageView'
import { BlockChrome } from './BlockChrome'
import { SlashMenu, type SlashMenuItem } from './SlashMenu'
import { restoreBlockEditorFocus } from './focusBlockEditor'
import { loadNostrContacts, type NostrContact } from '../contacts/nostrContacts'
import {
  loadPageCollaborators,
  loadPageCollaboratorsFromNostr,
  loadWorkspaceOwnerPubkey,
  savePageCollaborators,
} from '../contacts/pageCollaborators'
import { publishWorkspaceAccessSnapshot, sendNostrDMInvite } from '../contacts/workspaceAccess'
import type { Page, Block } from '../../storage/repo/types'
import type { DraftMap } from '../stores/draftStore'
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
  workspaceId?: string
  currentUserPubkey?: string | null
  relayUrls?: string[]
  enableNostrContacts?: boolean
}

interface PageObservation {
  status: 'loading' | 'ready' | 'locked'
  page?: Page
}

const DEFAULT_CONTACT_RELAYS = ['wss://nos.lol', 'wss://relay.damus.io', 'wss://relay.nostr.band']

function readStoredNostrPubkey(): string | null {
  if (typeof window === 'undefined') return null
  const storedUser = sessionStorage.getItem('nostr_user')
  if (!storedUser) return null
  try {
    const parsed = JSON.parse(storedUser) as { pubkey?: string }
    return parsed.pubkey ?? null
  } catch {
    return null
  }
}

function extractMentionedPubkeys(blocks: Block[]): string[] {
  const pubkeys = new Set<string>()

  function walk(node: any) {
    if (!node) return
    if (node.type === 'mention' && node.attrs && typeof node.attrs.id === 'string') {
      pubkeys.add(node.attrs.id)
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        walk(child)
      }
    }
  }

  for (const block of blocks) {
    if (block.content && block.content.richText) {
      walk(block.content.richText)
    }
  }

  return Array.from(pubkeys)
}

function mergeDraftsIntoBlocks(blocks: Block[], pageId: string, drafts: DraftMap): Block[] {
  const pageDrafts = Object.entries(drafts).filter(([, draft]) => draft.pageId === pageId)
  if (pageDrafts.length === 0) return blocks

  function extractBlockContent(content: Record<string, unknown>): Record<string, unknown> {
    const { deleted, type, order, parentBlockId, ...rest } = content
    return rest
  }

  const nextBlocks = blocks.map((block) => {
    const draft = drafts[block.id]
    if (!draft || draft.pageId !== pageId) return block

    if (draft.content.deleted === true) {
      return {
        ...block,
        deleted: true,
      }
    }

    return {
      ...block,
      type: typeof draft.content.type === 'string' ? (draft.content.type as string) : block.type,
      parentBlockId:
        draft.content.parentBlockId === null || typeof draft.content.parentBlockId === 'string'
          ? (draft.content.parentBlockId as string | null)
          : block.parentBlockId,
      order: typeof draft.content.order === 'number' ? draft.content.order : block.order,
      content: {
        ...block.content,
        ...extractBlockContent(draft.content),
      },
      updatedAt: Date.now(),
    }
  })

  for (const [blockId, draft] of pageDrafts) {
    const existingIndex = nextBlocks.findIndex((block) => block.id === blockId)
    if (existingIndex !== -1) continue
    if (draft.content.deleted === true) continue

    nextBlocks.push({
      id: blockId,
      type: typeof draft.content.type === 'string' ? (draft.content.type as string) : 'paragraph',
      parentBlockId:
        draft.content.parentBlockId === null || typeof draft.content.parentBlockId === 'string'
          ? (draft.content.parentBlockId as string | null)
          : null,
      order: typeof draft.content.order === 'number' ? draft.content.order : Date.now(),
      content: extractBlockContent(draft.content),
      updatedAt: Date.now(),
    })
  }

  return nextBlocks
    .filter((block) => !(block as Block & { deleted?: boolean }).deleted)
    .sort((left, right) => left.order - right.order)
}

export function PageEditor({
  pageId,
  workspaceId: workspaceIdProp,
  currentUserPubkey,
  relayUrls: relayUrlsProp = [],
  enableNostrContacts = true,
}: PageEditorProps) {
  const repoStore = useRepoStore()
  const draftStore = useDraftStore()
  const [observation, setObservation] = useState<PageObservation>({ status: 'loading' })
  const [slashMenu, setSlashMenu] = useState<{ blockId: string; rect: DOMRect; query: string } | null>(null)
  const [pendingFocusBlockId, setPendingFocusBlockId] = useState<string | null>(null)
  const [showPageMenu, setShowPageMenu] = useState(false)
  const [showInviteMenu, setShowInviteMenu] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [title, setTitle] = useState('')
  const [contacts, setContacts] = useState<NostrContact[]>([])
  const [contactsStatus, setContactsStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [contactQuery, setContactQuery] = useState('')
  const [invitedPubkeys, setInvitedPubkeys] = useState<string[]>([])
  const [drafts, setDrafts] = useState<DraftMap>({})

  const [lockedBlocks, setLockedBlocks] = useState<Record<string, { username: string; pubkey: string }>>({})
  const [currentUserInfo, setCurrentUserInfo] = useState<{ pubkey?: string; name?: string }>({})

  const workspaceId =
    workspaceIdProp ??
    'workspace-repo'
  const resolvedUserPubkey = currentUserPubkey ?? readStoredNostrPubkey()
  const workspaceOwnerPubkey = loadWorkspaceOwnerPubkey(workspaceId)
  const canEdit =
    resolvedUserPubkey !== null &&
    (workspaceOwnerPubkey === null ||
      resolvedUserPubkey === workspaceOwnerPubkey ||
      invitedPubkeys.includes(resolvedUserPubkey))

  const readOnlyDraftStore = {
    ...draftStore,
    stage: () => {},
    flush: async () => {},
    restorePage: () => {},
    createPage: () => '',
    renamePage: () => {},
    deletePage: () => {},
    changePageIcon: () => {},
    movePage: () => {},
  }
  const editorDraftStore = canEdit ? draftStore : readOnlyDraftStore

  const [activeUsers, setActiveUsers] = useState<{ pubkey: string; username: string }[]>([])

  useEffect(() => {
    if (!editorDraftStore.awareness) return

    const updateActiveUsers = () => {
      const usersMap = new Map<string, { pubkey: string; username: string }>()
      for (const [clientId, state] of editorDraftStore.awareness.getStates().entries()) {
        if (clientId === editorDraftStore.awareness.clientID) continue
        const presence = state as any
        if (presence && presence.pubkey) {
          usersMap.set(presence.pubkey, {
            pubkey: presence.pubkey,
            username: presence.username || 'User',
          })
        }
      }
      setActiveUsers(Array.from(usersMap.values()))
    }

    updateActiveUsers()
    editorDraftStore.awareness.on('change', updateActiveUsers)
    return () => {
      editorDraftStore.awareness.off('change', updateActiveUsers)
    }
  }, [editorDraftStore.awareness])

  useEffect(() => {
    if (resolvedUserPubkey) {
      const stored = sessionStorage.getItem('nostr_user')
      if (stored) {
        try {
          const parsed = JSON.parse(stored)
          setCurrentUserInfo({
            pubkey: resolvedUserPubkey,
            name: parsed.name || 'User',
          })
        } catch {
          setCurrentUserInfo({ pubkey: resolvedUserPubkey, name: 'User' })
        }
      } else {
        setCurrentUserInfo({ pubkey: resolvedUserPubkey, name: 'User' })
      }
    } else {
      setCurrentUserInfo({ pubkey: 'local', name: 'User' })
    }
  }, [resolvedUserPubkey])

  useEffect(() => {
    if (editorDraftStore.getLockedBlocks) {
      setLockedBlocks(editorDraftStore.getLockedBlocks(pageId))
    }
    if (editorDraftStore.lockedBlocks$) {
      const sub = editorDraftStore.lockedBlocks$.subscribe((allLocks) => {
        setLockedBlocks(allLocks[pageId] || {})
      })
      return () => sub.unsubscribe()
    }
  }, [editorDraftStore, pageId])

  function handleBlockFocus(blockId: string) {
    if (editorDraftStore.setFocusedBlock) {
      editorDraftStore.setFocusedBlock(pageId, blockId, currentUserInfo)
    }
  }

  function handleBlockBlur(blockId: string) {
    if (editorDraftStore.setFocusedBlock && editorDraftStore.awareness) {
      const localState = editorDraftStore.awareness.getLocalState() as any
      if (localState && localState.blockId === blockId) {
        editorDraftStore.setFocusedBlock(pageId, null, currentUserInfo)
      }
    }
  }

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

  useEffect(() => {
    setInvitedPubkeys(loadPageCollaborators(workspaceId, pageId))
  }, [pageId, workspaceId])

  useEffect(() => {
    if (!resolvedUserPubkey) return
    if (import.meta.env.VITEST) return
    if (relayUrlsProp.length === 0 && typeof window === 'undefined') return

    let cancelled = false
    void loadPageCollaboratorsFromNostr(workspaceId, pageId, resolvedUserPubkey, relayUrlsProp)
      .then((nextInvited) => {
        if (cancelled) return
        setInvitedPubkeys(nextInvited)
        savePageCollaborators(workspaceId, pageId, nextInvited)
      })
      .catch((error) => {
        if (cancelled) return
        console.warn('Failed to load page collaborators from Nostr', error)
      })

    return () => {
      cancelled = true
    }
  }, [pageId, relayUrlsProp, resolvedUserPubkey, workspaceId])

  useEffect(() => {
    if (!pendingFocusBlockId) return
    const pageBlocks = observation.page?.blocks ?? []
    if (!pageBlocks.some((block) => block.id === pendingFocusBlockId)) return

    restoreBlockEditorFocus(pendingFocusBlockId)
    if (slashMenu) {
      setSlashMenu(null)
    }
    setPendingFocusBlockId(null)
  }, [observation.page?.blocks, pendingFocusBlockId, slashMenu])

  useEffect(() => {
    const subscription = draftStore.drafts$.subscribe((nextDrafts) => {
      setDrafts(nextDrafts)
    })
    return () => subscription.unsubscribe()
  }, [draftStore])

  useEffect(() => {
    if (contactsStatus !== 'idle') return
    if (!resolvedUserPubkey) return
    if (!enableNostrContacts) return

    const pubkey = resolvedUserPubkey

    let relayUrls = relayUrlsProp
    if (relayUrls.length === 0) {
      relayUrls = DEFAULT_CONTACT_RELAYS
    }

    setContactsStatus('loading')
    void loadNostrContacts(pubkey ?? '', relayUrls)
      .then((nextContacts) => {
        setContacts(nextContacts)
        setContactsStatus('ready')
      })
      .catch(() => {
        setContacts([])
        setContactsStatus('error')
      })
  }, [contactsStatus, enableNostrContacts, relayUrlsProp, resolvedUserPubkey])

  if (observation.status === 'loading') {
    return <p role="status">Decrypting…</p>
  }

  if (observation.status === 'locked' || !observation.page) {
    return <LockedPageView pageId={pageId} pageTitle={observation.page?.title ?? ''} />
  }

  const page = observation.page
  const revisions = repoStore.listPageRevisions(pageId).slice(0, 10)

  const sortedBlocks = mergeDraftsIntoBlocks(page.blocks, pageId, drafts)
    .slice()
    .sort((a, b) => a.order - b.order)

  const mentionedPubkeys = extractMentionedPubkeys(sortedBlocks)
  const uninvitedMentions = mentionedPubkeys.filter(
    (pubkey) => pubkey !== workspaceOwnerPubkey && !invitedPubkeys.includes(pubkey)
  )

  let numberedListIndex = 0

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
    editorDraftStore.stage(pageId, activeBlock.id, {
      ...activeBlock.content,
      order: newOrder,
    })
  }

  function getNextBlockOrder(): number {
    if (sortedBlocks.length === 0) return 1.0
    return sortedBlocks[sortedBlocks.length - 1].order + 1.0
  }

  function createParagraphBlockAtEnd(shouldOpenCommandMenu: boolean, anchorRect?: DOMRect) {
    const newBlockId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15)
    editorDraftStore.stage(pageId, newBlockId, {
      type: 'paragraph',
      order: getNextBlockOrder(),
      text: '',
      richText: null,
      parentBlockId: null,
    })

    if (shouldOpenCommandMenu) {
      setSlashMenu({
        blockId: newBlockId,
        rect: anchorRect ?? new DOMRect(),
        query: '',
      })
    }
  }

  function handleSplitBlock(blockId: string, before: string, after: string) {
    const index = sortedBlocks.findIndex((b) => b.id === blockId)
    if (index === -1) return

    const currentBlock = sortedBlocks[index]

    editorDraftStore.stage(pageId, blockId, {
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
    editorDraftStore.stage(pageId, newBlockId, {
      ...currentBlock.content,
      type: currentBlock.type,
      order: newOrder,
      text: after,
      richText: null,
      parentBlockId: currentBlock.parentBlockId,
    })
    restoreBlockEditorFocus(newBlockId)
    setPendingFocusBlockId(newBlockId)
  }

  function handleMergeWithPrevious(blockId: string) {
    const index = sortedBlocks.findIndex((b) => b.id === blockId)
    if (index <= 0) return

    const currentBlock = sortedBlocks[index]
    const prevBlock = sortedBlocks[index - 1]

    const prevText = (prevBlock.content.text as string) || ''
    const currentText = (currentBlock.content.text as string) || ''

    editorDraftStore.stage(pageId, prevBlock.id, {
      ...prevBlock.content,
      text: prevText + currentText,
      richText: null,
    })

    editorDraftStore.stage(pageId, blockId, {
      deleted: true,
    })
  }

  function handleDeleteBlock(blockId: string) {
    editorDraftStore.stage(pageId, blockId, {
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
    const currentContent = currentBlock?.content ?? {}
    const nextRichText = typeof item.content.richText === 'string' || typeof item.content.richText === 'object'
      ? item.content.richText
      : null
    const nextText = typeof item.content.text === 'string' ? item.content.text : ''
    const nextContent =
      item.type === 'database'
        ? {
            ...item.content,
            databaseId:
              typeof item.content.databaseId === 'string' && item.content.databaseId.trim().length > 0
                ? item.content.databaseId
                : `db-${blockId}`,
            columns:
              Array.isArray(item.content.columns) && item.content.columns.length > 0
                ? item.content.columns
                : ['Column 1', 'Column 2'],
            seedRows:
              item.content.seedRows && typeof item.content.seedRows === 'object' && !Array.isArray(item.content.seedRows)
                ? item.content.seedRows
                : {
                    'row-1': { 'Column 1': 'Example', 'Column 2': 'Value' },
                    'row-2': { 'Column 1': 'Another row', 'Column 2': '' },
                  },
            rowEdits:
              item.content.rowEdits && typeof item.content.rowEdits === 'object' && !Array.isArray(item.content.rowEdits)
                ? item.content.rowEdits
                : {},
          }
        : item.content

    editorDraftStore.stage(pageId, blockId, {
      ...currentContent,
      type: item.type,
      ...nextContent,
      text: nextText,
      richText: nextRichText,
    })

    setSlashMenu(null)
    restoreBlockEditorFocus(blockId)
    setPendingFocusBlockId(blockId)
  }

  const emojis = ['📄', '📝', '💡', '📅', '🛠️', '🚀', '📚', '💻', '🎨', '🏠', '🔥', '⭐', '🎉', '👤', '💬']

  function handleSaveTitle() {
    const cleaned = title.trim()
    if (cleaned && cleaned !== page.title) {
      editorDraftStore.renamePage(pageId, cleaned)
    } else {
      setTitle(page.title)
    }
  }

  function handleRestoreRevision(revisionPage: Page) {
    editorDraftStore.restorePage(revisionPage)
    setShowPageMenu(false)
  }

  function handleToggleInviteMenu() {
    setShowInviteMenu((current) => {
      const next = !current
      if (next) {
        setShowPageMenu(false)
        setContactsStatus('idle')
      }
      return next
    })
  }

  function handleToggleCollaborator(pubkey: string) {
    const isRemoving = invitedPubkeys.includes(pubkey)
    const next = isRemoving ? invitedPubkeys.filter((value) => value !== pubkey) : [...invitedPubkeys, pubkey]

    setInvitedPubkeys(next)
    savePageCollaborators(workspaceId, pageId, next)

    if (resolvedUserPubkey) {
      const updatedAt = Date.now()
      const workspaceCollaborators = Array.from(new Set([resolvedUserPubkey, ...next]))
      void publishWorkspaceAccessSnapshot(relayUrlsProp, {
        workspaceId,
        collaboratorPubkeys: workspaceCollaborators,
        ownerPubkey: workspaceOwnerPubkey ?? resolvedUserPubkey,
        updatedAt,
      })

      void publishWorkspaceAccessSnapshot(relayUrlsProp, {
        workspaceId,
        pageId,
        collaboratorPubkeys: Array.from(new Set([resolvedUserPubkey, ...next])),
        ownerPubkey: workspaceOwnerPubkey ?? resolvedUserPubkey,
        updatedAt,
      })

      if (isRemoving) {
        void publishWorkspaceAccessSnapshot(relayUrlsProp, {
          workspaceId,
          pageId,
          collaboratorPubkeys: [pubkey],
          ownerPubkey: workspaceOwnerPubkey ?? resolvedUserPubkey,
          updatedAt: updatedAt + 1,
          revoked: true,
        })
      } else {
        const storedCek = localStorage.getItem(`grid34_cek_${workspaceId}`)
        if (storedCek) {
          try {
            const bytes = new Uint8Array(JSON.parse(storedCek) as number[])
            const hexCek = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
            void sendNostrDMInvite(pubkey, workspaceId, hexCek, relayUrlsProp)
          } catch (err) {
            console.warn('[PageEditor] failed to load CEK for Nostr DM invite', err)
          }
        }
      }
    }
  }

  const visibleContacts = contacts.filter((contact) => {
    const haystack = `${contact.displayName ?? ''} ${contact.name ?? ''} ${contact.petname ?? ''} ${contact.pubkey} ${contact.relay ?? ''}`.toLowerCase()
    return haystack.includes(contactQuery.trim().toLowerCase())
  })

  return (
    <DraftStoreContext.Provider value={editorDraftStore}>
      <article className="page-editor w-full animate-fade-in" aria-label={page.title}>
        <header className="page-editor__header mb-8 relative pr-10">
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
                        editorDraftStore.changePageIcon(pageId, emoji)
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
            readOnly={!canEdit}
            className={`page-editor__title text-4xl font-bold tracking-tight text-gray-950 bg-transparent border-none outline-none focus:ring-0 p-0 m-0 w-full rounded-lg px-2 -mx-2 transition-colors duration-150 ${
              canEdit ? 'hover:bg-gray-50/50' : 'cursor-default opacity-90'
            }`}
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
        {canEdit ? (
          <div className="absolute top-0 right-0 flex items-center gap-2">
            {activeUsers.length > 0 && (
              <div className="flex items-center -space-x-1.5 mr-1" title={`${activeUsers.length} other(s) in this workspace`}>
                {activeUsers.map((u) => {
                  const contact = contacts.find((c) => c.pubkey === u.pubkey)
                  const avatar = contact?.picture || `https://robohash.org/${u.pubkey}.png?set=set4`
                  return (
                    <img
                      key={u.pubkey}
                      src={avatar}
                      alt={u.username}
                      title={u.username}
                      className="w-7 h-7 rounded-full border-2 border-white dark:border-gray-900 object-cover shadow-sm hover:translate-y-[-2px] hover:z-10 transition-transform duration-200"
                      onError={(e) => {
                        e.currentTarget.src = `https://robohash.org/${u.pubkey}.png?set=set4`
                      }}
                    />
                  )
                })}
              </div>
            )}
            <div className="relative">
              <button
                type="button"
                className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                aria-label="Invite collaborators"
                aria-expanded={showInviteMenu}
                onClick={handleToggleInviteMenu}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-3-3h-2m-4 5H2v-2a4 4 0 014-4h6m-2-6a4 4 0 110-8 4 4 0 010 8zm8 1a3 3 0 100-6 3 3 0 000 6z" />
                </svg>
              </button>
              {showInviteMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowInviteMenu(false)} />
                  <div className="absolute right-0 top-11 z-50 w-96 max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
                    <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Invite editors</div>
                        <div className="text-xs text-gray-500">{invitedPubkeys.length} invited</div>
                      </div>
                      <button
                        type="button"
                        className="text-xs text-gray-400 hover:text-gray-700"
                        onClick={() => setShowInviteMenu(false)}
                      >
                        Close
                      </button>
                    </div>
                    <div className="max-h-96 overflow-y-auto p-2">
                      {!resolvedUserPubkey ? (
                        <div className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-sm text-gray-500">
                          Connect Nostr to load your contact list.
                        </div>
                      ) : contactsStatus === 'loading' ? (
                        <div className="px-2 py-4 text-sm text-gray-500">Loading contacts…</div>
                      ) : contactsStatus === 'error' ? (
                        <div className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-sm text-gray-500">
                          Could not load your contact list from relays.
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          <input
                            type="text"
                            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-gray-300"
                            value={contactQuery}
                            onChange={(e) => setContactQuery(e.target.value)}
                            placeholder="Search contacts"
                          />
                          {invitedPubkeys.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {invitedPubkeys.map((pubkey) => (
                                <button
                                  key={pubkey}
                                  type="button"
                                  onClick={() => handleToggleCollaborator(pubkey)}
                                  className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-100"
                                  title="Remove invite"
                                >
                                  <span>{pubkey.slice(0, 8)}…{pubkey.slice(-4)}</span>
                                  <span aria-hidden="true">×</span>
                                </button>
                              ))}
                            </div>
                          )}
                          {visibleContacts.length === 0 ? (
                            <div className="px-2 py-4 text-sm text-gray-500">
                              No contacts match your search.
                            </div>
                          ) : (
                            <div className="flex flex-col gap-1">
                              {visibleContacts.map((contact) => {
                                const isInvited = invitedPubkeys.includes(contact.pubkey)
                                const label = contact.displayName?.trim() || contact.name?.trim() || contact.petname?.trim() || `${contact.pubkey.slice(0, 8)}…${contact.pubkey.slice(-4)}`
                                const picture = contact.picture || `https://robohash.org/${contact.pubkey}.png?set=set4`
                                return (
                                  <button
                                    key={contact.pubkey}
                                    type="button"
                                    onClick={() => handleToggleCollaborator(contact.pubkey)}
                                    className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                                      isInvited ? 'border-blue-200 bg-blue-50/70 hover:bg-blue-100' : 'border-gray-200 hover:bg-gray-50'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="flex min-w-0 items-center gap-2">
                                        <img
                                          src={picture}
                                          alt=""
                                          className="h-8 w-8 flex-shrink-0 rounded-full border border-gray-200 object-cover"
                                          onError={(e) => {
                                            e.currentTarget.src = `https://robohash.org/${contact.pubkey}.png?set=set4`
                                          }}
                                        />
                                        <div className="min-w-0">
                                          <div className="truncate text-sm font-semibold text-gray-800">{label}</div>
                                          <div className="truncate text-[11px] text-gray-500">{contact.pubkey}</div>
                                        </div>
                                      </div>
                                      <span className={`flex-shrink-0 text-[10px] font-semibold uppercase tracking-wider ${isInvited ? 'text-blue-600' : 'text-gray-400'}`}>
                                        {isInvited ? 'Invited' : 'Invite'}
                                      </span>
                                    </div>
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="relative">
              <button
                type="button"
                className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                aria-label="Page menu"
                aria-expanded={showPageMenu}
                onClick={() => {
                  setShowInviteMenu(false)
                  setShowPageMenu((current) => !current)
                }}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              {showPageMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowPageMenu(false)} />
                  <div className="absolute right-0 top-11 z-50 w-80 max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
                    <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Revision History</div>
                        <div className="text-xs text-gray-500">{revisions.length} snapshots</div>
                      </div>
                      <button
                        type="button"
                        className="text-xs text-gray-400 hover:text-gray-700"
                        onClick={() => setShowPageMenu(false)}
                      >
                        Close
                      </button>
                    </div>
                    <div className="max-h-80 overflow-y-auto p-2">
                      {revisions.length === 0 ? (
                        <div className="px-2 py-4 text-sm text-gray-500">No revisions yet.</div>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {revisions.map((revision, index) => (
                            <button
                              key={revision.id}
                              type="button"
                              className="rounded-lg border border-gray-200 px-3 py-2 text-left transition-colors hover:bg-gray-50"
                              onClick={() => handleRestoreRevision(revision.page)}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="truncate text-xs font-semibold text-gray-800">
                                    Revision {revisions.length - index}
                                  </div>
                                  <div className="truncate text-[11px] text-gray-500">
                                    {new Date(revision.createdAt).toLocaleString()}
                                  </div>
                                </div>
                                <span className="flex-shrink-0 text-[10px] font-semibold uppercase tracking-wider text-blue-600">
                                  Restore
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="absolute top-0 right-0 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 shadow-sm">
            Read only
          </div>
        )}
      </header>

      {!canEdit && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          You can view this page, but you cannot edit it until your Nostr pubkey is added to the page collaborators.
        </div>
      )}

      {canEdit && uninvitedMentions.map((pubkey) => {
        const contact = contacts.find((c) => c.pubkey === pubkey)
        const name = contact?.displayName || contact?.name || contact?.petname || `${pubkey.slice(0, 8)}…${pubkey.slice(-4)}`
        return (
          <div
            key={pubkey}
            className="mb-4 flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900"
            role="alert"
          >
            <span>
              <strong>{name}</strong> is mentioned but not invited to this page.
            </span>
            <button
              type="button"
              onClick={() => handleToggleCollaborator(pubkey)}
              className="ml-3 rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              Invite Editor
            </button>
          </div>
        )
      })}

        <div
          className="page-editor__content flex flex-col min-w-0"
          onClick={(e) => {
            if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('empty-state-placeholder')) {
              if (sortedBlocks.length === 0) {
                const newBlockId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15)
                editorDraftStore.stage(pageId, newBlockId, {
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
              {sortedBlocks.map((block, index) => {
                const Component = blockComponentRegistry[block.type as keyof typeof blockComponentRegistry]
                if (!Component) return null
                const listIndex =
                  block.type === 'list' && block.content.kind === 'numbered'
                    ? (() => {
                        const previousBlock = sortedBlocks[index - 1]
                        if (previousBlock?.type === 'list' && previousBlock.content.kind === 'numbered') {
                          numberedListIndex += 1
                        } else {
                          numberedListIndex = 1
                        }
                        return numberedListIndex
                      })()
                    : undefined
                return (
                  <BlockChrome
                    key={block.id}
                    block={block}
                    pageId={pageId}
                    onDelete={() => handleDeleteBlock(block.id)}
                    isLocked={!!lockedBlocks[block.id]}
                    onFocusCapture={() => handleBlockFocus(block.id)}
                    onBlurCapture={() => handleBlockBlur(block.id)}
                  >
                    {lockedBlocks[block.id] ? (
                      <div className="locked-block-indicator py-2 px-3 bg-gray-50 border border-dashed border-gray-200 rounded-lg text-sm text-gray-500 italic select-none">
                        {lockedBlocks[block.id].username} is editing...
                      </div>
                    ) : (
                      <Component
                        block={block}
                        pageId={pageId}
                        listIndex={listIndex}
                        onSplitBlock={handleSplitBlock}
                        onMergeWithPrevious={handleMergeWithPrevious}
                        onOpenSlashMenu={handleOpenSlashMenu}
                      />
                    )}
                  </BlockChrome>
                )
              })}
            </SortableContext>
          </DndContext>
          <div className="mt-2 flex justify-start">
            <button
              type="button"
              disabled={!canEdit}
              aria-label="Add block"
              className={`page-editor__add-block inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium transition-colors ${
                canEdit ? '' : 'cursor-not-allowed'
              }`}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                const rect = event.currentTarget.getBoundingClientRect()
                createParagraphBlockAtEnd(true, rect)
              }}
            >
              <span className="text-base leading-none text-current">+</span>
              <span>Add block</span>
            </button>
          </div>
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
    </DraftStoreContext.Provider>
  )
}

import { Subject, type Observable } from 'rxjs'
import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import type { Block, Page } from '../../storage/repo/types'
import type { PageMeta } from './blockConversion'

interface TrackedField {
  value: unknown
  updatedAt: number
}

interface TrackedBlock {
  id: string
  type: string
  parentBlockId: string | null
  order: number
  content: Record<string, TrackedField>
  updatedAt: number
}

interface BlockEditMessage {
  pageId: string
  blockId: string
  edit: Record<string, unknown>
  updatedAt: number
}

function encodeMessage(message: BlockEditMessage): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(message))
}

function decodeMessage(update: Uint8Array): BlockEditMessage {
  return JSON.parse(new TextDecoder().decode(update)) as BlockEditMessage
}

function makeTrackedBlock(block: Block): TrackedBlock {
  const content: Record<string, TrackedField> = {}
  for (const [key, value] of Object.entries(block.content)) {
    content[key] = { value, updatedAt: block.updatedAt }
  }

  return {
    id: block.id,
    type: block.type,
    parentBlockId: block.parentBlockId,
    order: block.order,
    content,
    updatedAt: block.updatedAt,
  }
}

function makeBlockFromEdit(
  blockId: string,
  edit: Record<string, unknown>,
  updatedAt: number
): TrackedBlock {
  const type = typeof edit.type === 'string' ? edit.type : 'paragraph'
  const parentBlockId =
    edit.parentBlockId === null || typeof edit.parentBlockId === 'string'
      ? edit.parentBlockId
      : null
  const order = typeof edit.order === 'number' ? edit.order : updatedAt
  const content: Record<string, TrackedField> = {}

  for (const [key, value] of Object.entries(edit)) {
    if (key === 'id' || key === 'type' || key === 'parentBlockId' || key === 'order' || key === 'updatedAt' || key === 'deleted') {
      continue
    }
    content[key] = { value, updatedAt }
  }

  return {
    id: blockId,
    type,
    parentBlockId,
    order,
    content,
    updatedAt,
  }
}

function trackedBlockToBlock(block: TrackedBlock): Block {
  const content: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(block.content)) {
    content[key] = field.value
  }

  return {
    id: block.id,
    type: block.type,
    parentBlockId: block.parentBlockId,
    order: block.order,
    content,
    updatedAt: block.updatedAt,
  }
}

function makeInitialState(page: Page): { pageMeta: PageMeta; blocks: Record<string, TrackedBlock>; pageUpdatedAt: number } {
  const blocks: Record<string, TrackedBlock> = {}
  for (const block of page.blocks) {
    blocks[block.id] = makeTrackedBlock(block)
  }

  return {
    pageMeta: {
      id: page.id,
      title: page.title,
      parentId: page.parentId,
      order: page.order,
      updatedAt: page.updatedAt,
    },
    blocks,
    pageUpdatedAt: page.updatedAt,
  }
}

function mergeEdit(block: TrackedBlock | undefined, edit: Record<string, unknown>, updatedAt: number): TrackedBlock {
  if (!block) {
    throw new Error('mergeEdit: unknown blockId')
  }

  const nextContent: Record<string, TrackedField> = { ...block.content }
  for (const [key, value] of Object.entries(edit)) {
    const existing = nextContent[key]
    if (!existing || updatedAt >= existing.updatedAt) {
      nextContent[key] = { value, updatedAt }
    }
  }

  return {
    ...block,
    content: nextContent,
    updatedAt: Math.max(block.updatedAt, updatedAt),
  }
}

export interface CollabDocOptions {
  page: Page
  now?: () => number
}

export interface CollabDoc {
  applyLocalEdit(blockId: string, edit: Record<string, unknown>): void
  applyRemoteUpdate(update: Uint8Array): void
  localUpdates$: Observable<Uint8Array>
  changes$: Observable<void>
  awareness: Awareness
  getPage(): Page
  readonly lastActivityAt: number
  destroy(): void
}

export function createCollabDoc(options: CollabDocOptions): CollabDoc {
  const now = options.now ?? (() => Date.now())
  const state = makeInitialState(options.page)
  const localUpdatesSubject = new Subject<Uint8Array>()
  const changesSubject = new Subject<void>()
  const ydoc = new Y.Doc()
  const awareness = new Awareness(ydoc)
  let lastActivityAt = options.page.updatedAt

  function emitChange(): void {
    changesSubject.next()
  }

  function applyMessage(message: BlockEditMessage) {
    if (message.pageId !== state.pageMeta.id) {
      return
    }

    const existing = state.blocks[message.blockId]
    state.blocks[message.blockId] = existing
      ? mergeEdit(existing, message.edit, message.updatedAt)
      : makeBlockFromEdit(message.blockId, message.edit, message.updatedAt)
    state.pageUpdatedAt = Math.max(state.pageUpdatedAt, message.updatedAt)
    lastActivityAt = now()
    emitChange()
  }

  return {
    applyLocalEdit(blockId, edit) {
      const timestamp = now()
      const block = state.blocks[blockId]
      state.blocks[blockId] = block
        ? mergeEdit(block, edit, timestamp)
        : makeBlockFromEdit(blockId, edit, timestamp)
      state.pageUpdatedAt = Math.max(state.pageUpdatedAt, timestamp)
      lastActivityAt = timestamp
      localUpdatesSubject.next(encodeMessage({ pageId: state.pageMeta.id, blockId, edit, updatedAt: timestamp }))
      emitChange()
    },

    applyRemoteUpdate(update) {
      const message = decodeMessage(update)
      applyMessage(message)
    },

    localUpdates$: localUpdatesSubject.asObservable(),
    changes$: changesSubject.asObservable(),
    awareness,

    getPage() {
      return {
        id: state.pageMeta.id,
        title: state.pageMeta.title,
        parentId: state.pageMeta.parentId,
        order: state.pageMeta.order,
        blocks: Object.values(state.blocks)
          .map(trackedBlockToBlock)
          .sort((a, b) => a.order - b.order),
        updatedAt: state.pageUpdatedAt,
      }
    },

    get lastActivityAt() {
      return lastActivityAt
    },

    destroy() {
      awareness.destroy()
      localUpdatesSubject.complete()
      changesSubject.complete()
      ydoc.destroy()
    },
  }
}

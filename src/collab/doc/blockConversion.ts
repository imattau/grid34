import * as Y from 'yjs'
import type { Block, Page } from '../../storage/repo/types'

const BLOCKS_MAP_KEY = 'blocks'
const CONTENT_PREFIX = 'content:'
const FIELD_SEPARATOR = '::'
const METADATA_KEYS = new Set(['id', 'type', 'parentBlockId', 'order', 'updatedAt', 'deleted'])

function blockFieldKey(blockId: string, field: string): string {
  return `${blockId}${FIELD_SEPARATOR}${field}`
}

function parseBlockFieldKey(key: string): { blockId: string; field: string } | null {
  const separatorIndex = key.indexOf(FIELD_SEPARATOR)
  if (separatorIndex <= 0) return null
  return {
    blockId: key.slice(0, separatorIndex),
    field: key.slice(separatorIndex + FIELD_SEPARATOR.length),
  }
}

export type PageMeta = Pick<Page, 'id' | 'title' | 'parentId' | 'order'> & { updatedAt?: number }

export function pageToYDoc(page: Page): Y.Doc {
  const ydoc = new Y.Doc()
  const blocksMap = ydoc.getMap<unknown>(BLOCKS_MAP_KEY)

  ydoc.transact(() => {
    for (const block of page.blocks) {
      blocksMap.set(blockFieldKey(block.id, 'id'), block.id)
      blocksMap.set(blockFieldKey(block.id, 'type'), block.type)
      blocksMap.set(blockFieldKey(block.id, 'parentBlockId'), block.parentBlockId)
      blocksMap.set(blockFieldKey(block.id, 'order'), block.order)
      blocksMap.set(blockFieldKey(block.id, 'updatedAt'), block.updatedAt)
      for (const [key, value] of Object.entries(block.content)) {
        blocksMap.set(blockFieldKey(block.id, `${CONTENT_PREFIX}${key}`), value)
      }
    }
  })

  return ydoc
}

export function yDocToPage(ydoc: Y.Doc, meta: PageMeta): Page {
  const blocksMap = ydoc.getMap<unknown>(BLOCKS_MAP_KEY)
  const groupedBlocks = new Map<
    string,
    {
      id?: string
      type?: string
      parentBlockId?: string | null
      order?: number
      updatedAt?: number
      deleted?: boolean
      content: Record<string, unknown>
    }
  >()

  blocksMap.forEach((value, key) => {
    const parsed = parseBlockFieldKey(key)
    if (!parsed) return

    const block = groupedBlocks.get(parsed.blockId) ?? { content: {} }
    groupedBlocks.set(parsed.blockId, block)

    if (parsed.field === 'id') {
      block.id = value as string
    } else if (parsed.field === 'type') {
      block.type = value as string
    } else if (parsed.field === 'parentBlockId') {
      block.parentBlockId = value as string | null
    } else if (parsed.field === 'order') {
      block.order = value as number
    } else if (parsed.field === 'updatedAt') {
      block.updatedAt = value as number
    } else if (parsed.field === 'deleted') {
      block.deleted = value === true
    } else if (parsed.field.startsWith(CONTENT_PREFIX)) {
      block.content[parsed.field.slice(CONTENT_PREFIX.length)] = value
    }
  })

  const blocks: Block[] = []
  for (const block of groupedBlocks.values()) {
    if (block.deleted === true) continue
    if (!block.id || !block.type) continue

    blocks.push({
      id: block.id,
      type: block.type,
      parentBlockId: block.parentBlockId ?? null,
      order: block.order ?? 0,
      content: block.content,
      updatedAt: block.updatedAt ?? meta.updatedAt ?? 0,
    })
  }

  blocks.sort((a, b) => a.order - b.order)

  const updatedAt = blocks.length > 0 ? Math.max(...blocks.map((block) => block.updatedAt)) : (meta.updatedAt ?? 0)

  return {
    id: meta.id,
    title: meta.title,
    parentId: meta.parentId,
    order: meta.order,
    blocks,
    updatedAt,
  }
}

export function applyBlockEdit(
  ydoc: Y.Doc,
  blockId: string,
  edit: Record<string, unknown>,
  updatedAt: number,
  origin: unknown = 'local'
): void {
  const blocksMap = ydoc.getMap<unknown>(BLOCKS_MAP_KEY)
  ydoc.transact(() => {
    const hasExistingBlock = blocksMap.has(blockFieldKey(blockId, 'id'))
    const type = edit.type
    const parentBlockId = edit.parentBlockId
    const order = edit.order
    const deleted = edit.deleted

    if (typeof type === 'string') {
      blocksMap.set(blockFieldKey(blockId, 'type'), type)
    } else if (!hasExistingBlock) {
      blocksMap.set(blockFieldKey(blockId, 'type'), 'paragraph')
    }

    if (parentBlockId === null || typeof parentBlockId === 'string') {
      blocksMap.set(blockFieldKey(blockId, 'parentBlockId'), parentBlockId)
    } else if (!hasExistingBlock) {
      blocksMap.set(blockFieldKey(blockId, 'parentBlockId'), null)
    }

    if (typeof order === 'number') {
      blocksMap.set(blockFieldKey(blockId, 'order'), order)
    } else if (!hasExistingBlock) {
      blocksMap.set(blockFieldKey(blockId, 'order'), updatedAt)
    }

    for (const [key, value] of Object.entries(edit)) {
      if (METADATA_KEYS.has(key)) continue
      blocksMap.set(blockFieldKey(blockId, `${CONTENT_PREFIX}${key}`), value)
    }

    if (deleted === true) {
      blocksMap.set(blockFieldKey(blockId, 'deleted'), true)
    } else if (deleted === false) {
      blocksMap.delete(blockFieldKey(blockId, 'deleted'))
    }

    blocksMap.set(blockFieldKey(blockId, 'id'), blockId)
    blocksMap.set(blockFieldKey(blockId, 'updatedAt'), updatedAt)
  }, origin)
}

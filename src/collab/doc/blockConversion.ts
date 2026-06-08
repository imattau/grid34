import * as Y from 'yjs'
import type { Block, Page } from '../../storage/repo/types'

const BLOCKS_MAP_KEY = 'blocks'
const CONTENT_PREFIX = 'content:'

export type PageMeta = Pick<Page, 'id' | 'title' | 'parentId' | 'order'> & { updatedAt?: number }

export function pageToYDoc(page: Page): Y.Doc {
  const ydoc = new Y.Doc()
  const blocksMap = ydoc.getMap<Y.Map<unknown>>(BLOCKS_MAP_KEY)

  ydoc.transact(() => {
    for (const block of page.blocks) {
      const blockMap = new Y.Map<unknown>()
      blockMap.set('id', block.id)
      blockMap.set('type', block.type)
      blockMap.set('parentBlockId', block.parentBlockId)
      blockMap.set('order', block.order)
      blockMap.set('updatedAt', block.updatedAt)
      for (const [key, value] of Object.entries(block.content)) {
        blockMap.set(`${CONTENT_PREFIX}${key}`, value)
      }
      blocksMap.set(block.id, blockMap)
    }
  })

  return ydoc
}

export function yDocToPage(ydoc: Y.Doc, meta: PageMeta): Page {
  const blocksMap = ydoc.getMap<Y.Map<unknown>>(BLOCKS_MAP_KEY)
  const blocks: Block[] = []

  blocksMap.forEach((blockMap) => {
    const content: Record<string, unknown> = {}
    for (const [key, value] of blockMap.entries()) {
      if (key.startsWith(CONTENT_PREFIX)) {
        content[key.slice(CONTENT_PREFIX.length)] = value
      }
    }
    blocks.push({
      id: blockMap.get('id') as string,
      type: blockMap.get('type') as string,
      parentBlockId: blockMap.get('parentBlockId') as string | null,
      order: blockMap.get('order') as number,
      content,
      updatedAt: blockMap.get('updatedAt') as number,
    })
  })

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
  edit: Partial<Block['content']>,
  updatedAt: number
): void {
  const blocksMap = ydoc.getMap<Y.Map<unknown>>(BLOCKS_MAP_KEY)
  const blockMap = blocksMap.get(blockId)
  if (!blockMap) {
    throw new Error(`applyBlockEdit: unknown blockId "${blockId}"`)
  }

  ydoc.transact(() => {
    for (const [key, value] of Object.entries(edit)) {
      blockMap.set(`${CONTENT_PREFIX}${key}`, value)
    }
    blockMap.set('updatedAt', updatedAt)
  })
}

import type { Database } from 'sql.js'
import type { PageTreeState } from '../repo/types'

export function applyStateToIndex(db: Database, state: PageTreeState): void {
  for (const page of Object.values(state.pages)) {
    const pageId = typeof page.id === 'string' && page.id.trim().length > 0 ? page.id : 'unknown-page'
    const pageTitle = typeof page.title === 'string' && page.title.trim().length > 0 ? page.title : 'Untitled'
    const parentId = typeof page.parentId === 'string' && page.parentId.trim().length > 0 ? page.parentId : null
    const order = typeof page.order === 'number' && Number.isFinite(page.order) ? page.order : 0
    const updatedAt = typeof page.updatedAt === 'number' && Number.isFinite(page.updatedAt) ? page.updatedAt : Date.now()

    if (page.deleted) {
      db.run('DELETE FROM pages WHERE id = ?', [pageId])
      db.run('DELETE FROM blocks WHERE page_id = ?', [pageId])
      continue
    }

    db.run(
      `INSERT OR REPLACE INTO pages (id, title, parent_id, order_index, icon, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [pageId, pageTitle, parentId, order, page.icon ?? null, updatedAt]
    )

    const currentBlockIds = page.blocks.map((block) => block.id)
    if (currentBlockIds.length === 0) {
      db.run('DELETE FROM blocks WHERE page_id = ?', [pageId])
    } else {
      const placeholders = currentBlockIds.map(() => '?').join(', ')
      db.run(`DELETE FROM blocks WHERE page_id = ? AND id NOT IN (${placeholders})`, [pageId, ...currentBlockIds])
    }

    for (const block of page.blocks) {
      const blockId = typeof block.id === 'string' && block.id.trim().length > 0 ? block.id : `${pageId}-block`
      const blockType = typeof block.type === 'string' && block.type.trim().length > 0 ? block.type : 'paragraph'
      const blockParentId = typeof block.parentBlockId === 'string' && block.parentBlockId.trim().length > 0 ? block.parentBlockId : null
      const blockOrder = typeof block.order === 'number' && Number.isFinite(block.order) ? block.order : 0
      const blockUpdatedAt = typeof block.updatedAt === 'number' && Number.isFinite(block.updatedAt) ? block.updatedAt : Date.now()
      db.run(
        `INSERT OR REPLACE INTO blocks
           (id, page_id, parent_block_id, type, order_index, content_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          blockId,
          pageId,
          blockParentId,
          blockType,
          blockOrder,
          JSON.stringify(block.content),
          blockUpdatedAt,
        ]
      )
    }
  }
}

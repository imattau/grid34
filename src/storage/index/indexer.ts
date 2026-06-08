import type { Database } from 'sql.js'
import type { PageTreeState } from '../repo/types'

export function applyStateToIndex(db: Database, state: PageTreeState): void {
  for (const page of Object.values(state.pages)) {
    if (page.deleted) {
      db.run('DELETE FROM pages WHERE id = ?', [page.id])
      db.run('DELETE FROM blocks WHERE page_id = ?', [page.id])
      continue
    }

    db.run(
      `INSERT OR REPLACE INTO pages (id, title, parent_id, order_index, icon, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [page.id, page.title, page.parentId, page.order, page.icon ?? null, page.updatedAt]
    )

    const currentBlockIds = page.blocks.map((block) => block.id)
    if (currentBlockIds.length === 0) {
      db.run('DELETE FROM blocks WHERE page_id = ?', [page.id])
    } else {
      const placeholders = currentBlockIds.map(() => '?').join(', ')
      db.run(`DELETE FROM blocks WHERE page_id = ? AND id NOT IN (${placeholders})`, [page.id, ...currentBlockIds])
    }

    for (const block of page.blocks) {
      db.run(
        `INSERT OR REPLACE INTO blocks
           (id, page_id, parent_block_id, type, order_index, content_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          block.id,
          page.id,
          block.parentBlockId,
          block.type,
          block.order,
          JSON.stringify(block.content),
          block.updatedAt,
        ]
      )
    }
  }
}

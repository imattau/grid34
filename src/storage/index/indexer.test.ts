import { beforeEach, describe, expect, it } from 'vitest'
import initSqlJs, { type Database } from 'sql.js'
import { CREATE_SCHEMA_SQL } from './schema'
import { applyStateToIndex } from './indexer'
import type { PageTreeState } from '../repo/types'

let db: Database

beforeEach(async () => {
  const SQL = await initSqlJs()
  db = new SQL.Database()
  db.run(CREATE_SCHEMA_SQL)
})

function rows(sql: string, params: unknown[] = []): unknown[][] {
  const result = db.exec(sql, params as any)
  return result.length ? result[0].values : []
}

describe('applyStateToIndex', () => {
  it('inserts a new page and its blocks into SQLite', () => {
    const state: PageTreeState = {
      pages: {
        'page-1': {
          id: 'page-1',
          title: 'My Page',
          parentId: null,
          order: 0,
          updatedAt: 1000,
          blocks: [
            { id: 'block-1', type: 'paragraph', parentBlockId: null, order: 0, content: { text: 'Hi' }, updatedAt: 1000 },
          ],
        },
      },
    }

    applyStateToIndex(db, state)

    expect(rows('SELECT title FROM pages WHERE id = ?', ['page-1'])).toEqual([['My Page']])
    expect(rows('SELECT type FROM blocks WHERE id = ?', ['block-1'])).toEqual([['paragraph']])
  })
})

describe('applyStateToIndex re-indexing', () => {
  it('removes blocks that no longer exist in the page when re-indexed', () => {
    const withTwoBlocks: PageTreeState = {
      pages: {
        'page-1': {
          id: 'page-1',
          title: 'My Page',
          parentId: null,
          order: 0,
          updatedAt: 1000,
          blocks: [
            { id: 'block-1', type: 'paragraph', parentBlockId: null, order: 0, content: {}, updatedAt: 1000 },
            { id: 'block-2', type: 'paragraph', parentBlockId: null, order: 1, content: {}, updatedAt: 1000 },
          ],
        },
      },
    }
    applyStateToIndex(db, withTwoBlocks)

    const withOneBlock: PageTreeState = {
      pages: {
        'page-1': {
          ...withTwoBlocks.pages['page-1'],
          updatedAt: 2000,
          blocks: [withTwoBlocks.pages['page-1'].blocks[0]],
        },
      },
    }
    applyStateToIndex(db, withOneBlock)

    expect(rows('SELECT id FROM blocks WHERE page_id = ?', ['page-1'])).toEqual([['block-1']])
  })
})

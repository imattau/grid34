import { beforeAll, describe, expect, it } from 'vitest'
import initSqlJs, { type Database } from 'sql.js'
import { CREATE_SCHEMA_SQL } from './schema'

let db: Database

beforeAll(async () => {
  const SQL = await initSqlJs()
  db = new SQL.Database()
  db.run(CREATE_SCHEMA_SQL)
})

describe('schema', () => {
  it('creates the expected tables', () => {
    const result = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    const tableNames = result[0].values.map((row) => row[0])

    expect(tableNames).toEqual(['blocks', 'db_properties', 'db_rows', 'pages', 'sync_state'])
  })

  it('allows inserting and querying a page row', () => {
    db.run(
      'INSERT INTO pages (id, title, parent_id, order_index, updated_at) VALUES (?, ?, ?, ?, ?)',
      ['page-1', 'My Page', null, 0, 1000]
    )

    const result = db.exec('SELECT title FROM pages WHERE id = ?', ['page-1'])
    expect(result[0].values[0][0]).toBe('My Page')
  })
})

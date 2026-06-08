import { beforeEach, describe, expect, it } from 'vitest'
import { firstValueFrom } from 'rxjs'
import initSqlJs, { type Database } from 'sql.js'
import { CREATE_SCHEMA_SQL } from '../../storage/index/schema'
import { createDbViewStore } from './dbViewStore'
import type { Row } from '../types'

let db: Database

beforeEach(async () => {
  const SQL = await initSqlJs()
  db = new SQL.Database()
  db.run(CREATE_SCHEMA_SQL)

  db.run(
    `INSERT INTO blocks (id, page_id, parent_block_id, type, order_index, content_json, updated_at)
     VALUES ('db-1', 'page-1', NULL, 'database', 0, '{}', 1000)`
  )
  db.run(
    `INSERT INTO db_properties (database_block_id, name, type, config_json) VALUES
       ('db-1', 'name', 'text', '{}'),
       ('db-1', 'qty', 'number', '{}')`
  )
  db.run(
    `INSERT INTO db_rows (id, database_block_id, properties_json) VALUES
       ('row-1', 'db-1', '{"name":"Apples","qty":3}'),
       ('row-2', 'db-1', '{"name":"Bananas","qty":5}')`
  )
})

describe('DbViewStore.observeRows', () => {
  it('emits all rows for a database block when no filter/sort/columns are given', async () => {
    const store = createDbViewStore(db)
    const rows = await firstValueFrom(store.observeRows('db-1', { databaseId: 'db-1' }))

    expect(rows).toEqual([
      { id: 'row-1', values: { name: 'Apples', qty: 3 } },
      { id: 'row-2', values: { name: 'Bananas', qty: 5 } },
    ])
  })

  it('applies an equality filter from the ViewSpec', async () => {
    const store = createDbViewStore(db)
    const rows = await firstValueFrom(store.observeRows('db-1', { databaseId: 'db-1', filter: { name: 'Bananas' } }))

    expect(rows).toEqual([{ id: 'row-2', values: { name: 'Bananas', qty: 5 } }])
  })

  it('applies a sort from the ViewSpec', async () => {
    const store = createDbViewStore(db)
    const rows = await firstValueFrom(
      store.observeRows('db-1', { databaseId: 'db-1', sort: { property: 'qty', direction: 'desc' } })
    )

    expect(rows.map((r) => r.id)).toEqual(['row-2', 'row-1'])
  })

  it('re-emits updated rows when notifyChanged is called for the same database block', async () => {
    const store = createDbViewStore(db)
    const emissions: Row[][] = []
    const subscription = store.observeRows('db-1', { databaseId: 'db-1' }).subscribe((rows) => emissions.push(rows))

    db.run(`UPDATE db_rows SET properties_json = '{"name":"Apples","qty":10}' WHERE id = 'row-1'`)
    store.notifyChanged('db-1')

    expect(emissions.at(-1)).toEqual([
      { id: 'row-1', values: { name: 'Apples', qty: 10 } },
      { id: 'row-2', values: { name: 'Bananas', qty: 5 } },
    ])

    subscription.unsubscribe()
  })
})

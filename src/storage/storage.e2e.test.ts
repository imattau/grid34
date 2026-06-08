import { beforeEach, describe, expect, it } from 'vitest'
import initSqlJs, { type Database } from 'sql.js'
import { EventStore } from 'applesauce-core'
import { generateSecretKey, finalizeEvent } from 'nostr-tools/pure'
import { CREATE_SCHEMA_SQL } from './index/schema'
import { applyStateToIndex } from './index/indexer'
import { reduceRepo } from './repo/repoReducer'
import { createRepoStore } from './store/repoStore'
import { buildPatchEventTemplate } from './commit/commitBuilder'
import { decryptContent, generateCEK } from './crypto/cryptoBox'
import type { Patch, PageTreeState, Page } from './repo/types'

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

describe('storage layer end-to-end', () => {
  it('takes a page edit through commit, publish, sync, reduce, and index — converging in SQLite', () => {
    const cek = generateCEK()
    const sk = generateSecretKey()
    const eventStore = new EventStore()
    eventStore.verifyEvent = undefined
    const repoStore = createRepoStore(eventStore as any, { repoId: 'workspace-repo' })

    const patches: Patch[] = []
    repoStore.patches$.subscribe((event: any) => {
      const page = JSON.parse(decryptContent(event.content, cek)) as Page
      patches.push({ id: event.id, pageId: page.id, page, createdAt: event.created_at })
    })

    const page: Page = {
      id: 'page-1',
      title: 'Converged Page',
      parentId: null,
      order: 0,
      updatedAt: 1000,
      blocks: [
        { id: 'block-1', type: 'paragraph', parentBlockId: null, order: 0, content: { text: 'hi' }, updatedAt: 1000 },
      ],
    }
    const template = buildPatchEventTemplate({ page, repoId: 'workspace-repo', cek, createdAt: 1000 })
    const signed = finalizeEvent(template, sk)
    eventStore.add(signed)

    const state: PageTreeState = reduceRepo({ pages: {} }, patches)
    applyStateToIndex(db, state)

    expect(rows('SELECT title FROM pages WHERE id = ?', ['page-1'])).toEqual([['Converged Page']])
    expect(rows('SELECT type, content_json FROM blocks WHERE id = ?', ['block-1'])).toEqual([
      ['paragraph', JSON.stringify({ text: 'hi' })],
    ])
  })
})

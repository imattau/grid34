import { describe, expect, it } from 'vitest'
import type { Page } from '../storage/repo/types'
import { createRevisionHistoryState, recordRevision, REVISION_COOLDOWN_MS } from './revisionHistory'

function makePage(overrides: Partial<Page> = {}): Page {
  return {
    id: 'page-1',
    title: 'Page',
    parentId: null,
    order: 0,
    updatedAt: 1000,
    blocks: [],
    ...overrides,
  }
}

describe('revisionHistory', () => {
  it('throttles revisions for the same page unless forced or content changes after the cooldown', () => {
    const state = createRevisionHistoryState()
    const page = makePage()

    expect(recordRevision({ page, createdAt: 1_000, id: 'rev-1', state })).toBe(true)
    expect(recordRevision({ page, createdAt: 2_000, id: 'rev-2', state })).toBe(false)
    expect(recordRevision({ page, createdAt: REVISION_COOLDOWN_MS + 1_000, id: 'rev-3', state })).toBe(false)

    expect(recordRevision({ page: makePage({ updatedAt: 2_000 }), createdAt: REVISION_COOLDOWN_MS + 2_000, id: 'rev-4', state })).toBe(true)
    expect(recordRevision({ page: makePage({ updatedAt: 3_000 }), createdAt: REVISION_COOLDOWN_MS + 3_000, id: 'rev-5', state, force: true })).toBe(true)
  })
})

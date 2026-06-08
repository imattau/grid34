import { describe, expect, it } from 'vitest'
import { reduceRepo } from './repoReducer'
import type { Patch, PageTreeState } from './types'

const emptyState: PageTreeState = { pages: {} }

function makePatch(overrides: Partial<Patch> = {}): Patch {
  return {
    id: 'patch-1',
    pageId: 'page-1',
    createdAt: 1000,
    page: {
      id: 'page-1',
      title: 'My Page',
      parentId: null,
      order: 0,
      blocks: [],
      updatedAt: 1000,
    },
    ...overrides,
  }
}

describe('reduceRepo', () => {
  it('adds a page from a single patch applied to empty state', () => {
    const patch = makePatch()
    const state = reduceRepo(emptyState, [patch])

    expect(state.pages['page-1']).toEqual(patch.page)
  })
})

describe('reduceRepo conflict resolution', () => {
  it('keeps the patch with the later createdAt when two patches touch the same page', () => {
    const older = makePatch({
      id: 'patch-old',
      createdAt: 1000,
      page: { id: 'page-1', title: 'Older title', parentId: null, order: 0, blocks: [], updatedAt: 1000 },
    })
    const newer = makePatch({
      id: 'patch-new',
      createdAt: 2000,
      page: { id: 'page-1', title: 'Newer title', parentId: null, order: 0, blocks: [], updatedAt: 2000 },
    })

    const state = reduceRepo(emptyState, [newer, older])

    expect(state.pages['page-1'].title).toBe('Newer title')
  })
})

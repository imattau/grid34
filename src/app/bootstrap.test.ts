import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyWorkspaceConfigPayload } from '../App'

const { publishMock, querySyncMock, subscribeManyMock } = vi.hoisted(() => ({
  publishMock: vi.fn(() => [Promise.resolve()]),
  querySyncMock: vi.fn(() => []),
  subscribeManyMock: vi.fn(),
}))

vi.mock('nostr-tools/pool', () => ({
  SimplePool: class MockSimplePool {
    publish = publishMock
    querySync = querySyncMock
    subscribeMany = subscribeManyMock
    destroy = vi.fn()
    constructor(_options?: unknown) {}
  },
}))

import { createWorkspace } from './workspace'

beforeEach(() => {
  publishMock.mockClear()
  querySyncMock.mockReset()
  querySyncMock.mockImplementation(() => [])
  subscribeManyMock.mockClear()
})

afterEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('workspace bootstrap', () => {
  it('hydrates the workspace registry and active repo from a Nostr payload', () => {
    const changed = applyWorkspaceConfigPayload({
      workspaces: ['workspace-remote'],
      activeRepoId: 'workspace-remote',
      updatedAt: 123,
    })

    expect(changed).toBe(true)
    expect(JSON.parse(localStorage.getItem('grid34_workspaces') ?? '[]')).toEqual(['workspace-remote'])
    expect(localStorage.getItem('grid34_active_repo_id')).toBe('workspace-remote')
  })

  it('falls back to the first stored workspace when the active repo key is missing', async () => {
    localStorage.setItem('grid34_workspaces', JSON.stringify(['workspace-remote']))
    localStorage.setItem(
      'grid34_state_workspace-remote',
      JSON.stringify({
        pages: {
          'page-1': {
            id: 'page-1',
            title: 'Remote workspace',
            parentId: null,
            order: 0,
            updatedAt: 1000,
            blocks: [],
          },
        },
      })
    )
    localStorage.setItem('grid34_db_rows_workspace-remote', JSON.stringify({}))

    const workspace = await createWorkspace()

    expect(workspace.repoId).toBe('workspace-remote')
    expect(workspace.selectedPageId).toBe('page-1')

    workspace.destroy()
  })

  it('applies directly published page changes to the local workspace state and records revisions', async () => {
    const workspace = await createWorkspace()

    const pageId = workspace.draftStore.createPage(null, 'Synced page')

    await vi.waitFor(() => {
      expect(workspace.repoStore.getPage(pageId)).toMatchObject({
        id: pageId,
        title: 'Synced page',
      })
      expect(workspace.repoStore.listPageRevisions(pageId).length).toBeGreaterThan(0)
    })

    workspace.destroy()
  })

  it('automatically purges revisions older than 30 days and publishes deletion events', async () => {
    const pageId = 'page-to-purge'
    const oldRevisionId = 'event-old-123'
    const newRevisionId = 'event-new-456'
    const repoId = 'workspace-repo'
    const revisionsKey = `grid34_revisions_${repoId}`

    const thirtyOneDaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000
    const oneDayAgo = Date.now() - 1 * 24 * 60 * 60 * 1000

    const initialHistory = {
      pages: {
        [pageId]: [
          {
            id: newRevisionId,
            pageId,
            page: { id: pageId, title: 'New title', parentId: null, order: 0, updatedAt: oneDayAgo, blocks: [] },
            createdAt: oneDayAgo,
          },
          {
            id: oldRevisionId,
            pageId,
            page: { id: pageId, title: 'Old title', parentId: null, order: 0, updatedAt: thirtyOneDaysAgo, blocks: [] },
            createdAt: thirtyOneDaysAgo,
          },
        ]
      },
      lastRecordedAt: { [pageId]: oneDayAgo },
      lastSignature: { [pageId]: '{}' }
    }

    localStorage.setItem(revisionsKey, JSON.stringify(initialHistory))

    const workspace = await createWorkspace()

    const revisions = workspace.repoStore.listPageRevisions(pageId)
    expect(revisions.length).toBe(1)
    expect(revisions[0].id).toBe(newRevisionId)

    expect(publishMock).toHaveBeenCalledWith(
      [expect.any(String)],
      expect.objectContaining({
        kind: 5,
        tags: [['e', oldRevisionId]]
      })
    )

    workspace.destroy()
  })
})

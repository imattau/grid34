import { afterEach, describe, expect, it } from 'vitest'
import { applyWorkspaceConfigPayload } from '../App'
import { createWorkspace } from './workspace'

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
})

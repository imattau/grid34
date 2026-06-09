import { afterEach, describe, expect, it } from 'vitest'
import {
  getVisibleWorkspaceIds,
  loadDeletedWorkspaces,
  loadWorkspaceIds,
  markWorkspaceDeleted,
  purgeWorkspaceLocalData,
  restoreWorkspace,
  saveWorkspaceIds,
  WORKSPACE_DELETE_GRACE_PERIOD_MS,
} from './workspaceLifecycle'

describe('workspaceLifecycle', () => {
  afterEach(() => {
    localStorage.clear()
  })

  it('tracks deleted workspaces as tombstones and filters them from visible workspace ids', () => {
    saveWorkspaceIds(['workspace-a', 'workspace-b'])

    const deletedAt = 1_700_000_000_000
    const record = markWorkspaceDeleted('workspace-a', deletedAt)

    expect(record).toEqual({
      repoId: 'workspace-a',
      deletedAt,
      purgeAt: deletedAt + WORKSPACE_DELETE_GRACE_PERIOD_MS,
    })
    expect(loadWorkspaceIds()).toEqual(['workspace-b'])
    expect(loadDeletedWorkspaces()).toEqual([record])
    expect(getVisibleWorkspaceIds(['workspace-a', 'workspace-b', 'workspace-c'])).toEqual(['workspace-b', 'workspace-c'])
  })

  it('restores a deleted workspace back into the active list', () => {
    saveWorkspaceIds(['workspace-b'])
    markWorkspaceDeleted('workspace-a', 1_700_000_000_000)

    restoreWorkspace('workspace-a')

    expect(loadDeletedWorkspaces()).toEqual([])
    expect(loadWorkspaceIds()).toEqual(['workspace-b', 'workspace-a'])
  })

  it('removes local workspace data without clearing the tombstone', () => {
    localStorage.setItem('grid34_state_workspace-a', '{}')
    localStorage.setItem('grid34_cek_workspace-a', 'cek')
    localStorage.setItem('grid34_signing_key_workspace-a', 'signing')
    localStorage.setItem('grid34_db_rows_workspace-a', '{}')
    localStorage.setItem('grid34_pages_workspace-a', '{}')
    localStorage.setItem('grid34_revisions_workspace-a', '{}')
    localStorage.setItem('grid34_workspace_owner_workspace-a', 'owner')
    localStorage.setItem('grid34_page_collaborators_workspace-a_page-1', '[]')
    markWorkspaceDeleted('workspace-a', 1_700_000_000_000)

    purgeWorkspaceLocalData('workspace-a')

    expect(localStorage.getItem('grid34_state_workspace-a')).toBeNull()
    expect(localStorage.getItem('grid34_cek_workspace-a')).toBeNull()
    expect(localStorage.getItem('grid34_signing_key_workspace-a')).toBeNull()
    expect(localStorage.getItem('grid34_db_rows_workspace-a')).toBeNull()
    expect(localStorage.getItem('grid34_pages_workspace-a')).toBeNull()
    expect(localStorage.getItem('grid34_revisions_workspace-a')).toBeNull()
    expect(localStorage.getItem('grid34_workspace_owner_workspace-a')).toBeNull()
    expect(localStorage.getItem('grid34_page_collaborators_workspace-a_page-1')).toBeNull()
    expect(loadDeletedWorkspaces()).toHaveLength(1)
  })
})

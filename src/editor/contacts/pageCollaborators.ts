import { loadWorkspaceAccessSnapshots } from './workspaceAccess'
import {
  loadCachedAccessibleWorkspaces,
  loadCachedPageCollaborators,
  loadCachedWorkspaceOwnerPubkey,
  saveCachedAccessibleWorkspace,
  saveCachedPageCollaborators,
  saveCachedWorkspaceOwnerPubkey,
} from './accessCache'

export function loadPageCollaborators(workspaceId: string, pageId: string): string[] {
  return loadCachedPageCollaborators(workspaceId, pageId)
}

export function savePageCollaborators(workspaceId: string, pageId: string, pubkeys: string[]): void {
  saveCachedPageCollaborators(workspaceId, pageId, pubkeys)
}

export async function loadPageCollaboratorsFromNostr(
  workspaceId: string,
  pageId: string,
  pubkey: string,
  relayUrls: string[]
): Promise<string[]> {
  if (!pubkey || relayUrls.length === 0) return []

  const snapshots = await loadWorkspaceAccessSnapshots(pubkey, relayUrls)
  const pageSnapshots = snapshots
    .filter((snapshot) => snapshot.workspaceId === workspaceId && snapshot.pageId === pageId)
    .sort((left, right) => right.updatedAt - left.updatedAt)

  const latest = pageSnapshots[0]
  if (!latest) return []

  return Array.from(new Set(latest.collaboratorPubkeys.filter((value) => typeof value === 'string' && value.trim().length > 0)))
}

export function loadWorkspaceOwnerPubkey(workspaceId: string): string | null {
  return loadCachedWorkspaceOwnerPubkey(workspaceId)
}

export function saveWorkspaceOwnerPubkey(workspaceId: string, pubkey: string): void {
  saveCachedWorkspaceOwnerPubkey(workspaceId, pubkey)
}

export function loadAccessibleWorkspaces(pubkey: string): string[] {
  return loadCachedAccessibleWorkspaces(pubkey)
}

export function saveAccessibleWorkspace(pubkey: string, workspaceId: string): void {
  saveCachedAccessibleWorkspace(pubkey, workspaceId)
}

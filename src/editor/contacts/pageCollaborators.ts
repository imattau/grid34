export function pageCollaboratorsStorageKey(workspaceId: string, pageId: string): string {
  return `grid34_page_collaborators_${workspaceId}_${pageId}`
}

export function workspaceOwnerStorageKey(workspaceId: string): string {
  return `grid34_workspace_owner_${workspaceId}`
}

function parseCollaborators(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as string[]
    return Array.from(new Set(parsed.filter((value) => typeof value === 'string' && value.trim().length > 0)))
  } catch {
    return []
  }
}

export function loadPageCollaborators(workspaceId: string, pageId: string): string[] {
  if (typeof window === 'undefined') return []
  return parseCollaborators(localStorage.getItem(pageCollaboratorsStorageKey(workspaceId, pageId)))
}

export function savePageCollaborators(workspaceId: string, pageId: string, pubkeys: string[]): void {
  if (typeof window === 'undefined') return
  const next = Array.from(new Set(pubkeys.filter((value) => value.trim().length > 0)))
  localStorage.setItem(pageCollaboratorsStorageKey(workspaceId, pageId), JSON.stringify(next))
}

export function loadWorkspaceOwnerPubkey(workspaceId: string): string | null {
  if (typeof window === 'undefined') return null
  const stored = localStorage.getItem(workspaceOwnerStorageKey(workspaceId))
  return stored && stored.trim().length > 0 ? stored : null
}

export function saveWorkspaceOwnerPubkey(workspaceId: string, pubkey: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(workspaceOwnerStorageKey(workspaceId), pubkey)
}

export function accessibleWorkspacesStorageKey(pubkey: string): string {
  return `grid34_accessible_workspaces_${pubkey}`
}

export function loadAccessibleWorkspaces(pubkey: string): string[] {
  if (typeof window === 'undefined') return []
  const stored = localStorage.getItem(accessibleWorkspacesStorageKey(pubkey))
  if (!stored) return []
  try {
    const parsed = JSON.parse(stored) as string[]
    return Array.from(new Set(parsed.filter((value) => typeof value === 'string' && value.trim().length > 0)))
  } catch {
    return []
  }
}

export function saveAccessibleWorkspace(pubkey: string, workspaceId: string): void {
  if (typeof window === 'undefined') return
  const current = loadAccessibleWorkspaces(pubkey)
  const next = Array.from(new Set([...current, workspaceId]))
  localStorage.setItem(accessibleWorkspacesStorageKey(pubkey), JSON.stringify(next))
}

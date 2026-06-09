function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  const stored = localStorage.getItem(key)
  if (!stored) return fallback
  try {
    return JSON.parse(stored) as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(key, JSON.stringify(value))
}

export function cachedPageCollaboratorsKey(workspaceId: string, pageId: string): string {
  return `grid34_page_collaborators_${workspaceId}_${pageId}`
}

export function cachedWorkspaceOwnerKey(workspaceId: string): string {
  return `grid34_workspace_owner_${workspaceId}`
}

export function cachedAccessibleWorkspacesKey(pubkey: string): string {
  return `grid34_accessible_workspaces_${pubkey}`
}

function normalizeList(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  return Array.from(new Set(values.filter((value) => typeof value === 'string' && value.trim().length > 0)))
}

export function loadCachedPageCollaborators(workspaceId: string, pageId: string): string[] {
  return normalizeList(readJson(cachedPageCollaboratorsKey(workspaceId, pageId), []))
}

export function saveCachedPageCollaborators(workspaceId: string, pageId: string, pubkeys: string[]): void {
  writeJson(cachedPageCollaboratorsKey(workspaceId, pageId), normalizeList(pubkeys))
}

export function loadCachedWorkspaceOwnerPubkey(workspaceId: string): string | null {
  if (typeof window === 'undefined') return null
  const key = cachedWorkspaceOwnerKey(workspaceId)
  const raw = localStorage.getItem(key)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as string | null
    if (typeof parsed === 'string' && parsed.trim().length > 0) return parsed
  } catch {
    if (raw.trim().length > 0) return raw
  }
  return null
}

export function saveCachedWorkspaceOwnerPubkey(workspaceId: string, pubkey: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(cachedWorkspaceOwnerKey(workspaceId), pubkey)
}

export function loadCachedAccessibleWorkspaces(pubkey: string): string[] {
  return normalizeList(readJson(cachedAccessibleWorkspacesKey(pubkey), []))
}

export function saveCachedAccessibleWorkspace(pubkey: string, workspaceId: string): void {
  const next = Array.from(new Set([...loadCachedAccessibleWorkspaces(pubkey), workspaceId]))
  writeJson(cachedAccessibleWorkspacesKey(pubkey), next)
}

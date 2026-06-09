const WORKSPACES_STORAGE_KEY = 'grid34_workspaces'
const DELETED_WORKSPACES_STORAGE_KEY = 'grid34_deleted_workspaces'
const ACTIVE_REPO_STORAGE_KEY = 'grid34_active_repo_id'
const WORKSPACE_DATA_PREFIXES = [
  'grid34_state_',
  'grid34_cek_',
  'grid34_signing_key_',
  'grid34_db_rows_',
  'grid34_pages_',
  'grid34_revisions_',
  'grid34_workspace_owner_',
  'grid34_workspace_config_event_',
]

export const WORKSPACE_DELETE_GRACE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000

export interface DeletedWorkspaceRecord {
  repoId: string
  deletedAt: number
  purgeAt: number
}

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

function normalizeIds(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  return Array.from(new Set(values.filter((value) => typeof value === 'string' && value.trim().length > 0)))
}

function normalizeDeletedRecords(values: unknown): DeletedWorkspaceRecord[] {
  if (!Array.isArray(values)) return []

  return values.filter((value): value is DeletedWorkspaceRecord => {
    if (!value || typeof value !== 'object') return false
    const record = value as Partial<DeletedWorkspaceRecord>
    return (
      typeof record.repoId === 'string' &&
      record.repoId.trim().length > 0 &&
      typeof record.deletedAt === 'number' &&
      typeof record.purgeAt === 'number'
    )
  })
}

export function loadWorkspaceIds(): string[] {
  return normalizeIds(readJson(WORKSPACES_STORAGE_KEY, []))
}

export function saveWorkspaceIds(workspaces: string[]): void {
  writeJson(WORKSPACES_STORAGE_KEY, normalizeIds(workspaces))
}

export function loadDeletedWorkspaces(): DeletedWorkspaceRecord[] {
  return normalizeDeletedRecords(readJson(DELETED_WORKSPACES_STORAGE_KEY, []))
}

export function saveDeletedWorkspaces(records: DeletedWorkspaceRecord[]): void {
  writeJson(DELETED_WORKSPACES_STORAGE_KEY, records)
}

export function mergeDeletedWorkspaceRecords(records: Record<string, number>): boolean {
  const current = loadDeletedWorkspaces()
  const currentMap = new Map(current.map((record) => [record.repoId, record]))
  let changed = false

  for (const [repoId, deletedAt] of Object.entries(records)) {
    if (typeof deletedAt !== 'number') continue
    const purgeAt = deletedAt + WORKSPACE_DELETE_GRACE_PERIOD_MS
    const existing = currentMap.get(repoId)
    if (!existing || existing.deletedAt !== deletedAt || existing.purgeAt !== purgeAt) {
      currentMap.set(repoId, { repoId, deletedAt, purgeAt })
      changed = true
    }
  }

  const next = Array.from(currentMap.values()).sort((left, right) => left.deletedAt - right.deletedAt)
  if (next.length !== current.length || next.some((record, index) => record.repoId !== current[index]?.repoId || record.deletedAt !== current[index]?.deletedAt || record.purgeAt !== current[index]?.purgeAt)) {
    changed = true
  }

  if (changed) {
    saveDeletedWorkspaces(next)
  }

  return changed
}

export function toDeletedWorkspaceRecordMap(records: DeletedWorkspaceRecord[]): Record<string, number> {
  return Object.fromEntries(records.map((record) => [record.repoId, record.deletedAt]))
}

export function isWorkspaceDeleted(repoId: string): boolean {
  return loadDeletedWorkspaces().some((record) => record.repoId === repoId)
}

export function getVisibleWorkspaceIds(workspaces: string[]): string[] {
  const deleted = new Set(loadDeletedWorkspaces().map((record) => record.repoId))
  return normalizeIds(workspaces).filter((repoId) => !deleted.has(repoId))
}

export function getDeletedWorkspaceIds(): string[] {
  return loadDeletedWorkspaces().map((record) => record.repoId)
}

export function getWorkspaceDeletionDeadline(repoId: string): number | null {
  const record = loadDeletedWorkspaces().find((entry) => entry.repoId === repoId)
  return record ? record.purgeAt : null
}

export function getWorkspaceFallbackId(currentRepoId: string | null, visibleWorkspaces: string[]): string {
  const next = visibleWorkspaces.find((repoId) => repoId !== currentRepoId)
  return next ?? visibleWorkspaces[0] ?? 'workspace-repo'
}

export function markWorkspaceDeleted(repoId: string, now = Date.now()): DeletedWorkspaceRecord {
  const record: DeletedWorkspaceRecord = {
    repoId,
    deletedAt: now,
    purgeAt: now + WORKSPACE_DELETE_GRACE_PERIOD_MS,
  }

  const nextWorkspaces = loadWorkspaceIds().filter((id) => id !== repoId)
  saveWorkspaceIds(nextWorkspaces)

  const records = loadDeletedWorkspaces().filter((entry) => entry.repoId !== repoId)
  records.push(record)
  saveDeletedWorkspaces(records.sort((left, right) => left.deletedAt - right.deletedAt))

  return record
}

export function restoreWorkspace(repoId: string): void {
  const records = loadDeletedWorkspaces().filter((record) => record.repoId !== repoId)
  saveDeletedWorkspaces(records)

  const nextWorkspaces = Array.from(new Set([...loadWorkspaceIds(), repoId]))
  saveWorkspaceIds(nextWorkspaces)
}

export function purgeWorkspaceLocalData(repoId: string): void {
  if (typeof window === 'undefined') return

  const exactKeys = WORKSPACE_DATA_PREFIXES.map((prefix) => `${prefix}${repoId}`)
  const collaboratorPrefix = `grid34_page_collaborators_${repoId}_`

  for (const key of exactKeys) {
    localStorage.removeItem(key)
  }

  for (let i = localStorage.length - 1; i >= 0; i -= 1) {
    const key = localStorage.key(i)
    if (!key) continue
    if (key.startsWith(collaboratorPrefix)) {
      localStorage.removeItem(key)
    }
  }
}

export function normalizeActiveWorkspaceId(activeRepoId: string | null, visibleWorkspaces: string[]): string {
  if (activeRepoId && visibleWorkspaces.includes(activeRepoId)) {
    return activeRepoId
  }

  return visibleWorkspaces[0] ?? 'workspace-repo'
}

export function settleWorkspaceDeletionState(): { visibleWorkspaces: string[]; deletedWorkspaces: DeletedWorkspaceRecord[] } {
  const workspaces = loadWorkspaceIds()
  const deletedWorkspaces = loadDeletedWorkspaces()
  const deleted = new Set(deletedWorkspaces.map((record) => record.repoId))
  const visibleWorkspaces = workspaces.filter((repoId) => !deleted.has(repoId))
  if (visibleWorkspaces.length !== workspaces.length) {
    saveWorkspaceIds(visibleWorkspaces)
  }
  return { visibleWorkspaces, deletedWorkspaces }
}

export function getWorkspaceConfigStorageKey(repoId: string): string {
  return `grid34_workspace_config_event_${repoId}`
}

export function clearWorkspaceDeletionRecord(repoId: string): void {
  const records = loadDeletedWorkspaces().filter((record) => record.repoId !== repoId)
  saveDeletedWorkspaces(records)
}

export function rememberWorkspaceConfigEventId(repoId: string, eventId: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(getWorkspaceConfigStorageKey(repoId), eventId)
}

export function loadWorkspaceConfigEventId(repoId: string): string | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(getWorkspaceConfigStorageKey(repoId))
  return raw && raw.trim().length > 0 ? raw : null
}

export function removeWorkspaceConfigEventId(repoId: string): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(getWorkspaceConfigStorageKey(repoId))
}

export function setActiveWorkspaceId(repoId: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(ACTIVE_REPO_STORAGE_KEY, repoId)
}

export function loadActiveWorkspaceId(): string | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(ACTIVE_REPO_STORAGE_KEY)
  return raw && raw.trim().length > 0 ? raw : null
}

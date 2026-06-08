import type { Page } from '../storage/repo/types'
import type { PageRevision } from '../editor/contexts/storeContexts'

export const REVISION_COOLDOWN_MS = 30_000
export const REVISION_LIMIT = 20

export interface RevisionHistoryState {
  pages: Record<string, PageRevision[]>
  lastRecordedAt: Record<string, number>
  lastSignature: Record<string, string>
}

export function serializePageRevision(page: Page): string {
  return JSON.stringify(page)
}

export function createRevisionHistoryState(existing?: Partial<RevisionHistoryState>): RevisionHistoryState {
  return {
    pages: existing?.pages ?? {},
    lastRecordedAt: existing?.lastRecordedAt ?? {},
    lastSignature: existing?.lastSignature ?? {},
  }
}

export function shouldRecordRevision(options: {
  page: Page
  createdAt: number
  force?: boolean
  state: RevisionHistoryState
}): boolean {
  if (options.force) return true

  const signature = serializePageRevision(options.page)
  const lastSignature = options.state.lastSignature[options.page.id]
  if (lastSignature === signature) return false

  const lastRecordedAt = options.state.lastRecordedAt[options.page.id] ?? 0
  if (lastRecordedAt > 0 && options.createdAt - lastRecordedAt < REVISION_COOLDOWN_MS) {
    return false
  }

  return true
}

export function recordRevision(options: {
  page: Page
  createdAt: number
  id: string
  force?: boolean
  state: RevisionHistoryState
}): boolean {
  if (!shouldRecordRevision(options)) return false

  const revisions = options.state.pages[options.page.id] ? [...options.state.pages[options.page.id]] : []
  if (revisions.some((revision) => revision.id === options.id)) return false

  const revision: PageRevision = {
    id: options.id,
    pageId: options.page.id,
    page: options.page,
    createdAt: options.createdAt,
  }

  revisions.unshift(revision)
  options.state.pages[options.page.id] = revisions.slice(0, REVISION_LIMIT)
  options.state.lastRecordedAt[options.page.id] = options.createdAt
  options.state.lastSignature[options.page.id] = serializePageRevision(options.page)
  return true
}

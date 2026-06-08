import { createContext, useContext } from 'react'
import type { Observable } from 'rxjs'
import type { DraftStore } from '../stores/draftStore'
import type { DbViewStore } from '../stores/dbViewStore'
import type { Page, PageTreeState } from '../../storage/repo/types'

export interface PageRevision {
  id: string
  pageId: string
  page: Page
  createdAt: number
}

export interface EditorRepoStore {
  pageTree$: Observable<PageTreeState>
  observePage(pageId: string): Observable<{ status: 'loading' | 'ready' | 'locked'; page?: Page }>
  listPageRevisions(pageId: string): PageRevision[]
}

export const RepoStoreContext = createContext<EditorRepoStore | null>(null)
export const DraftStoreContext = createContext<DraftStore | null>(null)
export const DbViewStoreContext = createContext<DbViewStore | null>(null)

function requireContext<T>(context: React.Context<T | null>, name: string): T {
  const value = useContext(context)
  if (value === null) {
    throw new Error(`${name} is not provided — wrap the component tree in its Provider`)
  }
  return value
}

export function useRepoStore(): EditorRepoStore {
  return requireContext(RepoStoreContext, 'RepoStoreContext')
}

export function useDraftStore(): DraftStore {
  return requireContext(DraftStoreContext, 'DraftStoreContext')
}

export function useDbViewStore(): DbViewStore {
  return requireContext(DbViewStoreContext, 'DbViewStoreContext')
}

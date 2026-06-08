import type { Patch, PageTreeState } from './types'

export function reduceRepo(initial: PageTreeState, patches: Patch[]): PageTreeState {
  const pages = { ...initial.pages }

  for (const patch of patches) {
    const existing = pages[patch.pageId]
    if (!existing || patch.page.updatedAt >= existing.updatedAt) {
      pages[patch.pageId] = patch.page
    }
  }

  return { pages }
}

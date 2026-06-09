import type { DraftRepoStore, DraftStore } from '../../editor/stores/draftStore'
import type { Page } from '../../storage/repo/types'
import { createCollabDocBackend, type CollabDocBackend } from './collabDraftStore'

interface LiveBackendEntry {
  backend: CollabDocBackend
  unsubscribe: () => void
}

export interface CreateLiveDraftStoreOptions {
  baseStore: DraftStore
  repoStore: DraftRepoStore
  checkpointDebounceMs: number
  now?: () => number
  onLivePage(page: Page): void
}

export interface LiveDraftStore extends DraftStore {
  destroy(): void
}

export function createLiveDraftStore(options: CreateLiveDraftStoreOptions): LiveDraftStore {
  const { baseStore, repoStore, checkpointDebounceMs, now, onLivePage } = options
  const liveBackends = new Map<string, LiveBackendEntry>()

  function disposeBackend(pageId: string): void {
    const entry = liveBackends.get(pageId)
    if (!entry) return
    entry.unsubscribe()
    entry.backend.destroy()
    liveBackends.delete(pageId)
  }

  function ensureBackend(pageId: string): CollabDocBackend | null {
    const page = repoStore.getPage(pageId)
    if (!page) return null

    const existing = liveBackends.get(pageId)
    if (existing) {
      const currentPage = existing.backend.buildCheckpointPage()
      if (currentPage.updatedAt === page.updatedAt) {
        return existing.backend
      }
      disposeBackend(pageId)
    }

    const backend = createCollabDocBackend({
      page,
      now,
      checkpointDebounceMs,
    })

    const subscription = backend.convergedPage$.subscribe((nextPage) => {
      onLivePage(nextPage)
    })

    liveBackends.set(pageId, {
      backend,
      unsubscribe: () => subscription.unsubscribe(),
    })

    return backend
  }

  return {
    ...baseStore,
    stage(pageId, blockId, edit) {
      const backend = ensureBackend(pageId)
      backend?.stage(blockId, edit)
      baseStore.stage(pageId, blockId, edit)
    },

    async flush(): Promise<void> {
      await baseStore.flush()
    },

    destroy(): void {
      for (const pageId of Array.from(liveBackends.keys())) {
        disposeBackend(pageId)
      }
    },
  }
}

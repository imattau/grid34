import { Observable } from 'rxjs'
import type { Block, Page } from '../../storage/repo/types'
import { createCollabDoc, type CollabDoc } from '../doc/collabDoc'

export interface CollabDocBackendOptions {
  page: Page
  now?: () => number
  checkpointDebounceMs: number
}

export interface CollabDocBackend {
  stage(blockId: string, edit: Record<string, unknown>): void
  convergedPage$: Observable<Page>
  shouldFlush(currentTime: number): boolean
  buildCheckpointPage(): Page
  collabDoc: CollabDoc
  destroy(): void
}

export function createCollabDocBackend(options: CollabDocBackendOptions): CollabDocBackend {
  const now = options.now ?? (() => Date.now())
  const collabDoc = createCollabDoc({ page: options.page, now })

  const convergedPage$ = new Observable<Page>((subscriber) => {
    subscriber.next(collabDoc.getPage())

    const subscription = collabDoc.changes$.subscribe(() => {
      subscriber.next(collabDoc.getPage())
    })

    return () => subscription.unsubscribe()
  })

  return {
    stage(blockId, edit) {
      collabDoc.applyLocalEdit(blockId, edit)
    },

    convergedPage$,

    shouldFlush(currentTime) {
      return currentTime - collabDoc.lastActivityAt > options.checkpointDebounceMs
    },

    buildCheckpointPage() {
      return collabDoc.getPage()
    },

    collabDoc,

    destroy() {
      collabDoc.destroy()
    },
  }
}

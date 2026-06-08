import { describe, expect, it, vi } from 'vitest'
import { createCollabDocBackend } from './collabDraftStore'
import type { Page } from '../../storage/repo/types'

function makePage(): Page {
  return {
    id: 'page-1',
    title: 'My Page',
    parentId: null,
    order: 0,
    blocks: [
      { id: 'block-1', type: 'paragraph', parentBlockId: null, order: 0, content: { text: 'hello' }, updatedAt: 1000 },
    ],
    updatedAt: 1000,
  }
}

describe('createCollabDocBackend', () => {
  it('stage() forwards to CollabDoc.applyLocalEdit and drafts$ derives from the converged Page', () => {
    let clock = 2000
    const backend = createCollabDocBackend({ page: makePage(), now: () => clock, checkpointDebounceMs: 5000 })

    const emissions: Page[] = []
    backend.convergedPage$.subscribe((page) => emissions.push(page))

    backend.stage('block-1', { text: 'hello world' })

    expect(emissions.at(-1)!.blocks[0].content).toEqual({ text: 'hello world' })
    expect(emissions.at(-1)!.blocks[0].updatedAt).toBe(2000)
  })

  it('shouldFlush() becomes true once lastActivityAt has been quiet for the checkpoint debounce window', () => {
    let clock = 2000
    const backend = createCollabDocBackend({ page: makePage(), now: () => clock, checkpointDebounceMs: 5000 })

    backend.stage('block-1', { text: 'edit' })
    expect(backend.shouldFlush(clock)).toBe(false)

    clock = 2000 + 5000
    expect(backend.shouldFlush(clock)).toBe(false)

    clock = 2000 + 5001
    expect(backend.shouldFlush(clock)).toBe(true)
  })

  it('buildCheckpointPage() converts the converged Yjs state to a Page for CommitBuilder, unchanged from the non-collaborative path', () => {
    let clock = 2000
    const backend = createCollabDocBackend({ page: makePage(), now: () => clock, checkpointDebounceMs: 5000 })

    backend.stage('block-1', { text: 'final text' })
    const checkpoint = backend.buildCheckpointPage()

    expect(checkpoint.id).toBe('page-1')
    expect(checkpoint.blocks[0].content).toEqual({ text: 'final text' })
    expect(checkpoint.updatedAt).toBe(2000)
  })

  it('destroy() tears down the underlying CollabDoc', () => {
    const backend = createCollabDocBackend({ page: makePage(), now: () => 2000, checkpointDebounceMs: 5000 })
    const destroySpy = vi.spyOn(backend.collabDoc, 'destroy')

    backend.destroy()

    expect(destroySpy).toHaveBeenCalled()
  })
})

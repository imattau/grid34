import { describe, expect, it } from 'vitest'
import { createCollabDocBackend } from './integration/collabDraftStore'
import type { Page } from '../storage/repo/types'

function sharedSeedPage(): Page {
  return {
    id: 'page-1',
    title: 'Shared Page',
    parentId: null,
    order: 0,
    blocks: [
      { id: 'block-1', type: 'paragraph', parentBlockId: null, order: 0, content: { text: 'seed' }, updatedAt: 1000 },
      { id: 'block-2', type: 'paragraph', parentBlockId: null, order: 1, content: { text: 'second block' }, updatedAt: 1000 },
    ],
    updatedAt: 1000,
  }
}

function meshThreeBackends(backends: ReturnType<typeof createCollabDocBackend>[]): void {
  backends.forEach((backend, index) => {
    backend.collabDoc.localUpdates$.subscribe((update) => {
      backends.forEach((other, otherIndex) => {
        if (otherIndex !== index) {
          other.collabDoc.applyRemoteUpdate(update)
        }
      })
    })
  })
}

describe('multi-peer collaboration end-to-end', () => {
  it('three concurrent editors converge to identical state and produce one coherent checkpoint Page', () => {
    let clock = 2000
    const seed = sharedSeedPage()

    const alice = createCollabDocBackend({ page: seed, now: () => clock, checkpointDebounceMs: 5000 })
    const bob = createCollabDocBackend({ page: seed, now: () => clock + 1, checkpointDebounceMs: 5000 })
    const carol = createCollabDocBackend({ page: seed, now: () => clock + 2, checkpointDebounceMs: 5000 })
    meshThreeBackends([alice, bob, carol])

    alice.stage('block-1', { text: 'edited by alice' })
    bob.stage('block-1', { align: 'center' })
    carol.stage('block-2', { text: 'edited by carol' })

    const alicePage = alice.buildCheckpointPage()
    const bobPage = bob.buildCheckpointPage()
    const carolPage = carol.buildCheckpointPage()

    expect(alicePage).toEqual(bobPage)
    expect(bobPage).toEqual(carolPage)

    const block1 = alicePage.blocks.find((block) => block.id === 'block-1')!
    expect(block1.content).toEqual({ text: 'edited by alice', align: 'center' })
    const block2 = alicePage.blocks.find((block) => block.id === 'block-2')!
    expect(block2.content).toEqual({ text: 'edited by carol' })

    clock = 2000 + 5001
    expect(alice.shouldFlush(clock)).toBe(true)
    expect(bob.shouldFlush(clock + 1)).toBe(true)
    expect(carol.shouldFlush(clock + 2)).toBe(true)

    const finalCheckpoint = alice.buildCheckpointPage()
    expect(finalCheckpoint.id).toBe('page-1')
    expect(finalCheckpoint.blocks).toHaveLength(2)

    alice.destroy()
    bob.destroy()
    carol.destroy()
  })

  it('a peer that was offline during edits converges on reconnect without conflict', () => {
    let clock = 3000
    const seed = sharedSeedPage()

    const alice = createCollabDocBackend({ page: seed, now: () => clock, checkpointDebounceMs: 5000 })
    const offlineBob = createCollabDocBackend({ page: seed, now: () => clock, checkpointDebounceMs: 5000 })

    const aliceUpdates: Uint8Array[] = []
    const bobUpdates: Uint8Array[] = []
    alice.collabDoc.localUpdates$.subscribe((update) => aliceUpdates.push(update))
    offlineBob.collabDoc.localUpdates$.subscribe((update) => bobUpdates.push(update))

    alice.stage('block-1', { text: 'alice edited while bob was offline' })
    offlineBob.stage('block-1', { align: 'right' })

    for (const update of aliceUpdates) {
      offlineBob.collabDoc.applyRemoteUpdate(update)
    }
    for (const update of bobUpdates) {
      alice.collabDoc.applyRemoteUpdate(update)
    }

    expect(alice.buildCheckpointPage()).toEqual(offlineBob.buildCheckpointPage())

    alice.destroy()
    offlineBob.destroy()
  })
})

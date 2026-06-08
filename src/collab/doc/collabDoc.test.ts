import { describe, expect, it } from 'vitest'
import { Awareness } from 'y-protocols/awareness'
import type { PresenceState } from '../types'
import { createCollabDoc } from './collabDoc'
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

describe('CollabDoc.applyLocalEdit / remoteUpdates$', () => {
  it('applying a local edit broadcasts a Yjs update and updates the readable Page', () => {
    const page = makePage()
    const doc = createCollabDoc({ page, now: () => 2000 })

    const broadcasts: Uint8Array[] = []
    doc.localUpdates$.subscribe((update) => broadcasts.push(update))

    doc.applyLocalEdit('block-1', { text: 'hello world' })

    expect(broadcasts).toHaveLength(1)
    expect(doc.getPage().blocks[0].content).toEqual({ text: 'hello world' })
    expect(doc.getPage().blocks[0].updatedAt).toBe(2000)
  })

  it('applying a remote update merges peer changes into the local doc', () => {
    const page = makePage()
    const docA = createCollabDoc({ page, now: () => 2000 })
    const docB = createCollabDoc({ page, now: () => 3000 })

    let remoteUpdate: Uint8Array | undefined
    docB.localUpdates$.subscribe((update) => {
      remoteUpdate = update
    })
    docB.applyLocalEdit('block-1', { text: 'edited on peer B' })

    docA.applyRemoteUpdate(remoteUpdate!)

    expect(docA.getPage().blocks[0].content).toEqual({ text: 'edited on peer B' })
  })

  it('two concurrent edits to different fields converge identically on both peers', () => {
    const page = makePage()
    const docA = createCollabDoc({ page, now: () => 2000 })
    const docB = createCollabDoc({ page, now: () => 2001 })

    const updatesA: Uint8Array[] = []
    const updatesB: Uint8Array[] = []
    docA.localUpdates$.subscribe((update) => updatesA.push(update))
    docB.localUpdates$.subscribe((update) => updatesB.push(update))

    docA.applyLocalEdit('block-1', { text: 'from A' })
    docB.applyLocalEdit('block-1', { align: 'center' })

    for (const update of updatesB) docA.applyRemoteUpdate(update)
    for (const update of updatesA) docB.applyRemoteUpdate(update)

    expect(docA.getPage()).toEqual(docB.getPage())
    expect(docA.getPage().blocks[0].content).toEqual({ text: 'from A', align: 'center' })
  })
})

describe('CollabDoc.awareness / lastActivityAt', () => {
  it('exposes an Awareness instance that carries PresenceState for local and remote peers', () => {
    const page = makePage()
    const doc = createCollabDoc({ page, now: () => 2000 })

    expect(doc.awareness).toBeInstanceOf(Awareness)

    const presence: PresenceState = { pubkey: 'pk-self', pageId: 'page-1', blockId: 'block-1', selection: { anchor: 0, head: 5 } }
    doc.awareness.setLocalState(presence)

    expect(doc.awareness.getLocalState()).toEqual(presence)
  })

  it('lastActivityAt advances on local edits and on remote updates', () => {
    const page = makePage()
    let clock = 1000
    const docA = createCollabDoc({ page, now: () => clock })
    const docB = createCollabDoc({ page, now: () => 5000 })

    expect(docA.lastActivityAt).toBe(page.updatedAt)

    clock = 2000
    docA.applyLocalEdit('block-1', { text: 'A edits' })
    expect(docA.lastActivityAt).toBe(2000)

    let remoteUpdate: Uint8Array | undefined
    docB.localUpdates$.subscribe((update) => {
      remoteUpdate = update
    })
    docB.applyLocalEdit('block-1', { text: 'B edits' })

    clock = 3000
    docA.applyRemoteUpdate(remoteUpdate!)
    expect(docA.lastActivityAt).toBe(3000)
  })
})

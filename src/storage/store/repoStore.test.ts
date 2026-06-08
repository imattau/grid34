import { describe, expect, it } from 'vitest'
import { EventStore } from 'applesauce-core'
import { finalizeEvent, generateSecretKey } from 'nostr-tools/pure'
import { createRepoStore } from './repoStore'

describe('createRepoStore', () => {
  it('emits patch events for a given repo as they are added to the event store', async () => {
    const eventStore = new EventStore()
    eventStore.verifyEvent = undefined
    const repoStore = createRepoStore(eventStore as any, { repoId: 'workspace-repo' })

    const received: string[] = []
    repoStore.patches$.subscribe((event: any) => received.push(event.id))

    const sk = generateSecretKey()
    const matching = finalizeEvent(
      { kind: 1617, created_at: 1000, tags: [['a', '30617:workspace-repo']], content: 'cipher-a' },
      sk
    )
    const nonMatching = finalizeEvent(
      { kind: 1617, created_at: 1000, tags: [['a', '30617:other-repo']], content: 'cipher-b' },
      sk
    )

    eventStore.add(matching)
    eventStore.add(nonMatching)

    expect(received).toEqual([matching.id])
  })
})

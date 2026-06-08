import { describe, expect, it } from 'vitest'
import type { NostrEvent } from 'nostr-tools/pure'
import { parseNostrContactList, parseProfileMetadata } from './nostrContacts'

describe('nostrContacts', () => {
  it('parses kind 3 contact tags into pubkeys and petnames', () => {
    const event = {
      id: 'evt-1',
      kind: 3,
      created_at: 1,
      pubkey: 'self',
      sig: 'sig',
      content: '',
      tags: [
        ['p', 'npub-a', 'wss://relay.example', 'Alice'],
        ['p', 'npub-b', '', 'Bob'],
        ['e', 'ignored'],
      ],
    } as NostrEvent

    expect(parseNostrContactList(event)).toEqual([
      { pubkey: 'npub-a', relay: 'wss://relay.example', petname: 'Alice' },
      { pubkey: 'npub-b', petname: 'Bob' },
    ])
  })

  it('parses kind 0 profile metadata into display fields', () => {
    const event = {
      id: 'evt-2',
      kind: 0,
      created_at: 2,
      pubkey: 'self',
      sig: 'sig',
      content: JSON.stringify({
        name: 'alice',
        display_name: 'Alice Smith',
        picture: 'https://example.com/alice.png',
      }),
      tags: [],
    } as NostrEvent

    expect(parseProfileMetadata(event)).toEqual({
      name: 'alice',
      displayName: 'Alice Smith',
      picture: 'https://example.com/alice.png',
    })
  })
})

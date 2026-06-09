import { describe, expect, it, vi } from 'vitest'
import { BehaviorSubject } from 'rxjs'
import { generateSecretKey, getPublicKey, type EventTemplate, type NostrEvent } from 'nostr-tools/pure'
import { createDiscoveryBridge, decryptPeerInfo, encryptPeerInfo, type CollaboratorListSource, type EphemeralEventPublisher } from './discoveryBridge'
import type { PeerInfo } from '../types'

describe('PeerInfo encrypt/decrypt', () => {
  it('round-trips a PeerInfo payload encrypted for a recipient', () => {
    const senderSk = generateSecretKey()
    const senderPk = getPublicKey(senderSk)
    const recipientSk = generateSecretKey()
    const recipientPk = getPublicKey(recipientSk)

    const peerInfo: PeerInfo = {
      pubkey: senderPk,
      peerId: '12D3KooWAbc123',
      multiaddrs: ['/ip4/127.0.0.1/tcp/4001'],
      updatedAt: 1000,
    }

    const ciphertext = encryptPeerInfo(peerInfo, senderSk, recipientPk)
    const decrypted = decryptPeerInfo(ciphertext, recipientSk, senderPk)

    expect(decrypted).toEqual(peerInfo)
  })

  it('returns null when decryption fails', () => {
    const senderSk = generateSecretKey()
    const senderPk = getPublicKey(senderSk)
    const recipientSk = generateSecretKey()
    const recipientPk = getPublicKey(recipientSk)
    const wrongSenderPk = getPublicKey(generateSecretKey())

    const peerInfo: PeerInfo = {
      pubkey: senderPk,
      peerId: '12D3KooWAbc123',
      multiaddrs: ['/ip4/127.0.0.1/tcp/4001'],
      updatedAt: 1000,
    }

    const ciphertext = encryptPeerInfo(peerInfo, senderSk, recipientPk)
    const decrypted = decryptPeerInfo(ciphertext, recipientSk, wrongSenderPk)

    expect(decrypted).toBeNull()
  })
})

describe('createDiscoveryBridge', () => {
  it('publishes one wrapped ephemeral event per authorized collaborator', async () => {
    const selfSk = generateSecretKey()
    const selfPk = getPublicKey(selfSk)
    const collabAPk = getPublicKey(generateSecretKey())
    const collabBPk = getPublicKey(generateSecretKey())

    const published: EventTemplate[] = []
    const publisher: EphemeralEventPublisher = {
      publish: vi.fn(async (template: EventTemplate) => {
        published.push(template)
        return { ...template, id: 'evt', pubkey: selfPk, sig: 'sig' } as NostrEvent
      }),
    }
    const collaboratorList: CollaboratorListSource = {
      getCollaboratorPubkeys: vi.fn(async () => [collabAPk, collabBPk]),
    }

    const bridge = createDiscoveryBridge({
      workspaceId: 'workspace-1',
      secretKey: selfSk,
      publisher,
      collaboratorList,
      eventStore: { subscribeEphemeral: () => ({ unsubscribe: () => {} }) },
    })

    await bridge.publishPeerInfo('workspace-1', ['/ip4/127.0.0.1/tcp/4001'])

    expect(published).toHaveLength(2)
    for (const template of published) {
      expect(template.kind).toBe(20001)
      expect(template.tags).toContainEqual(['p', expect.any(String)])
      expect(template.tags).toContainEqual(['workspace', 'workspace-1'])
    }
  })

  it('peers$ emits decrypted peers keyed by pubkey, skipping undecryptable events', () => {
    const selfSk = generateSecretKey()
    const selfPk = getPublicKey(selfSk)
    const senderSk = generateSecretKey()
    const senderPk = getPublicKey(senderSk)

    const peerInfo: PeerInfo = {
      pubkey: senderPk,
      peerId: 'peer-A',
      multiaddrs: ['/ip4/10.0.0.1/tcp/4001'],
      updatedAt: 2000,
    }
    const ciphertext = encryptPeerInfo(peerInfo, senderSk, selfPk)

    let handler: ((event: NostrEvent) => void) | undefined
    const bridge = createDiscoveryBridge({
      workspaceId: 'workspace-1',
      secretKey: selfSk,
      publisher: { publish: vi.fn(async (template: EventTemplate) => ({ ...template, id: 'evt', pubkey: selfPk, sig: 'sig' } as NostrEvent)) },
      collaboratorList: { getCollaboratorPubkeys: vi.fn(async () => [senderPk]) },
      eventStore: {
        subscribeEphemeral: (onEvent: (event: NostrEvent) => void) => {
          handler = onEvent
          return { unsubscribe: () => {} }
        },
      },
    })

    const emissions: Record<string, PeerInfo>[] = []
    bridge.peers$.subscribe((peers) => emissions.push(peers))

    handler!({
      id: 'evt-good',
      kind: 20001,
      created_at: 2000,
      pubkey: senderPk,
      sig: 'sig',
      tags: [['p', selfPk], ['workspace', 'workspace-1']],
      content: ciphertext,
    })
    handler!({
      id: 'evt-bad',
      kind: 20001,
      created_at: 2001,
      pubkey: senderPk,
      sig: 'sig',
      tags: [['p', selfPk], ['workspace', 'workspace-1']],
      content: 'not-decryptable-garbage',
    })

    expect(emissions.at(-1)).toEqual({ [senderPk]: peerInfo })
  })

  it('ignores peers from a different workspace or with a mismatched sender pubkey', () => {
    const selfSk = generateSecretKey()
    const selfPk = getPublicKey(selfSk)
    const senderSk = generateSecretKey()
    const senderPk = getPublicKey(senderSk)
    const wrongSenderPk = getPublicKey(generateSecretKey())

    const peerInfo: PeerInfo = {
      pubkey: senderPk,
      peerId: 'peer-A',
      multiaddrs: ['/ip4/10.0.0.1/tcp/4001'],
      updatedAt: 2000,
    }
    const ciphertext = encryptPeerInfo(peerInfo, senderSk, selfPk)

    let handler: ((event: NostrEvent) => void) | undefined
    const bridge = createDiscoveryBridge({
      workspaceId: 'workspace-1',
      secretKey: selfSk,
      publisher: { publish: vi.fn(async (template: EventTemplate) => ({ ...template, id: 'evt', pubkey: selfPk, sig: 'sig' } as NostrEvent)) },
      collaboratorList: { getCollaboratorPubkeys: vi.fn(async () => [senderPk]) },
      eventStore: {
        subscribeEphemeral: (onEvent: (event: NostrEvent) => void) => {
          handler = onEvent
          return { unsubscribe: () => {} }
        },
      },
    })

    const emissions: Record<string, PeerInfo>[] = []
    bridge.peers$.subscribe((peers) => emissions.push(peers))

    handler!({
      id: 'evt-wrong-workspace',
      kind: 20001,
      created_at: 2000,
      pubkey: senderPk,
      sig: 'sig',
      tags: [['p', selfPk], ['workspace', 'workspace-2']],
      content: ciphertext,
    })

    expect(emissions.at(-1)).toEqual({})

    handler!({
      id: 'evt-wrong-sender',
      kind: 20001,
      created_at: 2001,
      pubkey: wrongSenderPk,
      sig: 'sig',
      tags: [['p', selfPk], ['workspace', 'workspace-1']],
      content: ciphertext,
    })

    expect(emissions.at(-1)).toEqual({})
  })
})

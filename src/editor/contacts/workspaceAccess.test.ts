import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventTemplate } from 'nostr-tools/pure'

const { publishMock, querySyncMock, closeMock } = vi.hoisted(() => ({
  publishMock: vi.fn(() => []),
  querySyncMock: vi.fn(),
  closeMock: vi.fn(),
}))

vi.mock('nostr-tools/pool', () => ({
  SimplePool: class MockSimplePool {
    publish = publishMock
    querySync = querySyncMock
    close = closeMock

    constructor(_options?: unknown) {}
  },
}))

import {
  loadWorkspaceAccessSnapshots,
  publishWorkspaceAccessSnapshot,
  sendNostrDMInvite,
  loadIncomingDMInvites,
  type WorkspaceAccessSnapshot,
} from './workspaceAccess'

describe('workspaceAccess', () => {
  beforeEach(() => {
    publishMock.mockClear()
    querySyncMock.mockReset()
    closeMock.mockClear()
    delete (globalThis as typeof globalThis & { nostr?: unknown }).nostr
  })

  afterEach(() => {
    delete (globalThis as typeof globalThis & { nostr?: unknown }).nostr
  })

  it('encrypts workspace access snapshots per recipient before publishing', async () => {
    let callIndex = 0
    const encrypt = vi.fn(async (recipientPubkey: string, plaintext: string) => `enc:${recipientPubkey}:${plaintext}`)
    const signEvent = vi.fn(async (template: EventTemplate) => ({
      ...template,
      id: `signed-${++callIndex}`,
      pubkey: 'owner-pubkey',
    }))

    ;(globalThis as typeof globalThis & { nostr?: unknown }).nostr = {
      signEvent,
      nip04: {
        encrypt,
      },
    }

    const snapshot: WorkspaceAccessSnapshot = {
      workspaceId: 'workspace-1',
      collaboratorPubkeys: ['owner-pubkey', 'collab-1'],
      ownerPubkey: 'owner-pubkey',
      updatedAt: 1234567890,
    }

    const signed = await publishWorkspaceAccessSnapshot(['wss://relay-a', 'wss://relay-b'], snapshot)

    expect(signed?.id).toBe('signed-1')
    expect(signEvent).toHaveBeenCalledTimes(2)
    expect(encrypt).toHaveBeenCalledTimes(2)
    const normalizedSnapshot = JSON.stringify({ ...snapshot, revoked: false })
    expect(encrypt).toHaveBeenNthCalledWith(1, 'owner-pubkey', normalizedSnapshot)
    expect(encrypt).toHaveBeenNthCalledWith(2, 'collab-1', normalizedSnapshot)
    expect(signEvent.mock.calls[0]?.[0].tags).toEqual([])
    expect(signEvent.mock.calls[1]?.[0].tags).toEqual([])
    expect(publishMock).toHaveBeenCalledTimes(2)
    expect(publishMock.mock.calls[0]?.[0]).toEqual(['wss://relay-a', 'wss://relay-b'])
    expect(publishMock.mock.calls[1]?.[0]).toEqual(['wss://relay-a', 'wss://relay-b'])
    expect(signEvent.mock.calls[0]?.[0].content).toBe('enc:owner-pubkey:' + normalizedSnapshot)
    expect(signEvent.mock.calls[1]?.[0].content).toBe('enc:collab-1:' + normalizedSnapshot)
  })

  it('decrypts encrypted workspace access snapshots when loading', async () => {
    querySyncMock.mockResolvedValueOnce([
      {
        kind: 30434,
        created_at: 1234,
        pubkey: 'owner-pubkey',
        id: 'event-1',
        tags: [
          ['workspace', 'workspace-1'],
          ['p', 'collab-1'],
        ],
        content: 'ciphertext',
      },
    ])

    const decrypted = JSON.stringify({
      workspaceId: 'workspace-1',
      collaboratorPubkeys: ['owner-pubkey', 'collab-1'],
      ownerPubkey: 'owner-pubkey',
      updatedAt: 1234567890,
    })
    const decrypt = vi.fn().mockResolvedValue(decrypted)
    ;(globalThis as typeof globalThis & { nostr?: unknown }).nostr = {
      nip04: { decrypt },
    }

    const snapshots = await loadWorkspaceAccessSnapshots('collab-1', ['wss://relay-a'])

    expect(querySyncMock).toHaveBeenCalledWith(['wss://relay-a'], { kinds: [30434] }, { maxWait: 4000 })
    expect(decrypt).toHaveBeenCalledWith('collab-1', 'ciphertext')
    expect(snapshots).toEqual([
      {
        workspaceId: 'workspace-1',
        collaboratorPubkeys: ['owner-pubkey', 'collab-1'],
        ownerPubkey: 'owner-pubkey',
        updatedAt: 1234567890,
        pageId: undefined,
        revoked: false,
      },
    ])
  })

  it('still loads legacy plaintext workspace access snapshots', async () => {
    querySyncMock.mockResolvedValueOnce([
      {
        kind: 30434,
        created_at: 1234,
        pubkey: 'owner-pubkey',
        id: 'event-legacy',
        tags: [
          ['workspace', 'workspace-legacy'],
          ['p', 'collab-legacy'],
        ],
        content: JSON.stringify({
          workspaceId: 'workspace-legacy',
          collaboratorPubkeys: ['owner-pubkey', 'collab-legacy'],
          ownerPubkey: 'owner-pubkey',
          updatedAt: 987654321,
        }),
      },
    ])

    const decrypt = vi.fn().mockRejectedValue(new Error('not encrypted'))
    ;(globalThis as typeof globalThis & { nostr?: unknown }).nostr = {
      nip04: { decrypt },
    }

    const snapshots = await loadWorkspaceAccessSnapshots('collab-legacy', ['wss://relay-a'])

    expect(querySyncMock).toHaveBeenCalledWith(['wss://relay-a'], { kinds: [30434] }, { maxWait: 4000 })
    expect(decrypt).toHaveBeenCalledWith('collab-legacy', expect.any(String))
    expect(snapshots).toEqual([
      {
        workspaceId: 'workspace-legacy',
        collaboratorPubkeys: ['owner-pubkey', 'collab-legacy'],
        ownerPubkey: 'owner-pubkey',
        updatedAt: 987654321,
        pageId: undefined,
        revoked: false,
      },
    ])
  })

  it('sends Nostr DM invite (kind 4) encrypted to recipient', async () => {
    const encrypt = vi.fn(async (recipientPubkey: string, plaintext: string) => `enc:${recipientPubkey}:${plaintext}`)
    const signEvent = vi.fn(async (template: EventTemplate) => ({
      ...template,
      id: 'signed-dm-1',
      pubkey: 'sender-pubkey',
    }))

    ;(globalThis as typeof globalThis & { nostr?: unknown }).nostr = {
      signEvent,
      nip04: { encrypt },
    }

    const success = await sendNostrDMInvite('recipient-pubkey', 'workspace-dm-1', 'cek-hex-key', ['wss://relay-dm'])

    expect(success).toBe(true)
    expect(encrypt).toHaveBeenCalledWith('recipient-pubkey', JSON.stringify({
      type: 'grid34-workspace-invite',
      workspaceId: 'workspace-dm-1',
      cek: 'cek-hex-key',
    }))
    expect(signEvent).toHaveBeenCalledWith({
      kind: 4,
      created_at: expect.any(Number),
      tags: [['p', 'recipient-pubkey']],
      content: 'enc:recipient-pubkey:' + JSON.stringify({
        type: 'grid34-workspace-invite',
        workspaceId: 'workspace-dm-1',
        cek: 'cek-hex-key',
      }),
    })
    expect(publishMock).toHaveBeenCalledWith(['wss://relay-dm'], expect.objectContaining({ id: 'signed-dm-1' }))
  })

  it('loads and decrypts incoming workspace invite DMs', async () => {
    querySyncMock.mockResolvedValueOnce([
      {
        kind: 4,
        created_at: 1000,
        pubkey: 'sender-pubkey-1',
        content: 'ciphertext-1',
      },
      {
        kind: 4,
        created_at: 2000,
        pubkey: 'sender-pubkey-2',
        content: 'ciphertext-2',
      },
    ])

    const decrypt = vi.fn(async (senderPubkey: string, content: string) => {
      if (senderPubkey === 'sender-pubkey-1' && content === 'ciphertext-1') {
        return JSON.stringify({
          type: 'grid34-workspace-invite',
          workspaceId: 'workspace-dm-1',
          cek: 'cek-1',
        })
      }
      if (senderPubkey === 'sender-pubkey-2' && content === 'ciphertext-2') {
        return JSON.stringify({
          type: 'grid34-workspace-invite',
          workspaceId: 'workspace-dm-2',
          cek: 'cek-2',
        })
      }
      throw new Error('unknown ciphertext')
    })

    ;(globalThis as typeof globalThis & { nostr?: unknown }).nostr = {
      nip04: { decrypt },
    }

    const invites = await loadIncomingDMInvites('recipient-pubkey', ['wss://relay-dm'])

    expect(querySyncMock).toHaveBeenCalledWith(['wss://relay-dm'], { kinds: [4], '#p': ['recipient-pubkey'] }, { maxWait: 4000 })
    expect(decrypt).toHaveBeenCalledTimes(2)
    expect(invites).toEqual([
      {
        workspaceId: 'workspace-dm-2',
        cek: 'cek-2',
        senderPubkey: 'sender-pubkey-2',
        timestamp: 2000000,
      },
      {
        workspaceId: 'workspace-dm-1',
        cek: 'cek-1',
        senderPubkey: 'sender-pubkey-1',
        timestamp: 1000000,
      },
    ])
  })
})

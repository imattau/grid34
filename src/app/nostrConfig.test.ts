import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventTemplate } from 'nostr-tools/pure'

const { publishMock, getMock, querySyncMock, closeMock } = vi.hoisted(() => ({
  publishMock: vi.fn(() => []),
  getMock: vi.fn(),
  querySyncMock: vi.fn(),
  closeMock: vi.fn(),
}))

vi.mock('nostr-tools/pool', () => ({
  SimplePool: class MockSimplePool {
    publish = publishMock
    get = getMock
    querySync = querySyncMock
    close = closeMock

    constructor(_options?: unknown) {}
  },
}))

import { saveWorkspacesToNostr, syncWorkspacesFromNostr } from './nostrConfig'

describe('nostrConfig', () => {
  beforeEach(() => {
    publishMock.mockClear()
    getMock.mockReset()
    querySyncMock.mockReset()
    closeMock.mockClear()
    localStorage.clear()
    delete (globalThis as typeof globalThis & { nostr?: unknown }).nostr
  })

  afterEach(() => {
    localStorage.clear()
    delete (globalThis as typeof globalThis & { nostr?: unknown }).nostr
  })

  it('publishes workspace config without public routing tags', async () => {
    const encrypt = vi.fn().mockResolvedValue('ciphertext')
    const signEvent = vi.fn(async (template: EventTemplate) => ({ ...template, id: 'signed', pubkey: 'pubkey-1' }))
    ;(globalThis as typeof globalThis & { nostr?: unknown }).nostr = {
      nip04: { encrypt, decrypt: vi.fn() },
      signEvent,
    }

    localStorage.setItem('grid34_cek_repo-1', 'cek-1')

    await saveWorkspacesToNostr('pubkey-1', ['repo-1'], 'repo-1', ['wss://relay-a'])

    expect(encrypt).toHaveBeenCalledWith('pubkey-1', expect.stringContaining('"workspaces":["repo-1"]'))
    expect(signEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 30078,
        tags: [],
        content: 'ciphertext',
      })
    )
    expect(publishMock).toHaveBeenCalledWith(['wss://relay-a'], expect.objectContaining({ id: 'signed' }))
  })

  it('loads the latest encrypted workspace config without relying on a d tag', async () => {
    querySyncMock.mockResolvedValue([
      {
        id: 'old',
        kind: 30078,
        created_at: 1000,
        pubkey: 'pubkey-1',
        tags: [],
        content: 'cipher-old',
      },
      {
        id: 'new',
        kind: 30078,
        created_at: 2000,
        pubkey: 'pubkey-1',
        tags: [],
        content: 'cipher-new',
      },
    ])

    const decrypt = vi.fn()
      .mockResolvedValueOnce(JSON.stringify({ workspaces: ['repo-old'], activeRepoId: 'repo-old', updatedAt: 1000 }))
      .mockResolvedValueOnce(JSON.stringify({ workspaces: ['repo-new'], activeRepoId: 'repo-new', updatedAt: 2000, ceks: { 'repo-new': 'cek-new' } }))
    ;(globalThis as typeof globalThis & { nostr?: unknown }).nostr = {
      nip04: { decrypt, encrypt: vi.fn() },
    }

    const payload = await syncWorkspacesFromNostr('pubkey-1', ['wss://relay-a'])

    expect(querySyncMock).toHaveBeenCalledWith(['wss://relay-a'], { kinds: [30078], authors: ['pubkey-1'] })
    expect(payload).toEqual({
      workspaces: ['repo-new'],
      activeRepoId: 'repo-new',
      updatedAt: 2000,
      ceks: { 'repo-new': 'cek-new' },
    })
    expect(localStorage.getItem('grid34_cek_repo-new')).toBe('cek-new')
    expect(decrypt).toHaveBeenCalledTimes(2)
  })
})

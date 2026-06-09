import { BehaviorSubject, type Observable } from 'rxjs'
import { getPublicKey, type EventTemplate, type NostrEvent } from 'nostr-tools/pure'
import { decrypt, encrypt, getConversationKey } from 'nostr-tools/nip44'
import type { PeerInfo } from '../types'

const PEER_INFO_EVENT_KIND = 20001

function hasTag(event: NostrEvent, name: string, value: string): boolean {
  return event.tags.some((tag) => tag[0] === name && tag[1] === value)
}

function normalizePeerInfo(peerInfo: PeerInfo): PeerInfo | null {
  if (typeof peerInfo.pubkey !== 'string' || peerInfo.pubkey.trim().length === 0) return null
  if (typeof peerInfo.peerId !== 'string' || peerInfo.peerId.trim().length === 0) return null
  if (!Array.isArray(peerInfo.multiaddrs) || peerInfo.multiaddrs.some((multiaddr) => typeof multiaddr !== 'string')) return null
  if (typeof peerInfo.updatedAt !== 'number' || Number.isNaN(peerInfo.updatedAt)) return null

  return {
    pubkey: peerInfo.pubkey,
    peerId: peerInfo.peerId,
    multiaddrs: Array.from(new Set(peerInfo.multiaddrs.filter((multiaddr) => multiaddr.trim().length > 0))),
    updatedAt: peerInfo.updatedAt,
  }
}

export function encryptPeerInfo(peerInfo: PeerInfo, senderSecretKey: Uint8Array, recipientPubkey: string): string {
  const conversationKey = getConversationKey(senderSecretKey, recipientPubkey)
  return encrypt(JSON.stringify(peerInfo), conversationKey)
}

export function decryptPeerInfo(
  ciphertext: string,
  recipientSecretKey: Uint8Array,
  senderPubkey: string
): PeerInfo | null {
  try {
    const conversationKey = getConversationKey(recipientSecretKey, senderPubkey)
    const json = decrypt(ciphertext, conversationKey)
    const parsed = JSON.parse(json) as PeerInfo
    return normalizePeerInfo(parsed)
  } catch (error) {
    console.warn('[DiscoveryBridge] failed to decrypt PeerInfo', error)
    return null
  }
}

export interface EphemeralEventPublisher {
  publish(template: EventTemplate): Promise<NostrEvent>
}

export interface CollaboratorListSource {
  getCollaboratorPubkeys(workspaceId: string): Promise<string[]>
}

export interface EphemeralEventStore {
  subscribeEphemeral(onEvent: (event: NostrEvent) => void): { unsubscribe(): void }
}

export interface DiscoveryBridgeOptions {
  workspaceId?: string
  secretKey: Uint8Array
  publisher: EphemeralEventPublisher
  collaboratorList: CollaboratorListSource
  eventStore: EphemeralEventStore
  peerId?: string
}

export interface DiscoveryBridge {
  publishPeerInfo(workspaceId: string, multiaddrs: string[]): Promise<void>
  peers$: Observable<Record<string, PeerInfo>>
}

export function createDiscoveryBridge(options: DiscoveryBridgeOptions): DiscoveryBridge {
  const { workspaceId, secretKey, publisher, collaboratorList, eventStore, peerId = getPublicKey(secretKey) } = options
  const selfPubkey = getPublicKey(secretKey)
  const scopedWorkspaceId = workspaceId?.trim() || null
  const peersSubject = new BehaviorSubject<Record<string, PeerInfo>>({})

  eventStore.subscribeEphemeral((event) => {
    if (event.kind !== PEER_INFO_EVENT_KIND) return
    if (scopedWorkspaceId && !hasTag(event, 'workspace', scopedWorkspaceId)) return
    if (!event.pubkey || !hasTag(event, 'p', selfPubkey)) return

    const peerInfo = decryptPeerInfo(event.content, secretKey, event.pubkey)
    if (peerInfo === null) {
      console.warn('[DiscoveryBridge] skipping undecryptable PeerInfo event', event.id)
      return
    }

    if (peerInfo.pubkey !== event.pubkey) {
      console.warn('[DiscoveryBridge] skipping mismatched PeerInfo pubkey', event.id)
      return
    }

    const current = peersSubject.getValue()
    const existing = current[event.pubkey]
    if (existing && existing.updatedAt > peerInfo.updatedAt) {
      return
    }

    peersSubject.next({
      ...current,
      [event.pubkey]: peerInfo,
    })
  })

  return {
    async publishPeerInfo(requestedWorkspaceId: string, multiaddrs: string[]): Promise<void> {
      if (scopedWorkspaceId && requestedWorkspaceId !== scopedWorkspaceId) {
        throw new Error(`publishPeerInfo called for mismatched workspace "${requestedWorkspaceId}"`)
      }

      const collaboratorPubkeys = await collaboratorList.getCollaboratorPubkeys(requestedWorkspaceId)
      const peerInfo: PeerInfo = { pubkey: selfPubkey, peerId, multiaddrs, updatedAt: Date.now() }

      for (const recipientPubkey of collaboratorPubkeys) {
        const ciphertext = encryptPeerInfo(peerInfo, secretKey, recipientPubkey)
        const template: EventTemplate = {
          kind: PEER_INFO_EVENT_KIND,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ['p', recipientPubkey],
            ['workspace', requestedWorkspaceId],
          ],
          content: ciphertext,
        }
        await publisher.publish(template)
      }
    },
    peers$: peersSubject.asObservable(),
  }
}

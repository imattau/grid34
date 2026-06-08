import { BehaviorSubject, type Observable } from 'rxjs'
import { getPublicKey, type EventTemplate, type NostrEvent } from 'nostr-tools/pure'
import { decrypt, encrypt, getConversationKey } from 'nostr-tools/nip44'
import type { PeerInfo } from '../types'

const PEER_INFO_EVENT_KIND = 20001

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
    return JSON.parse(json) as PeerInfo
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
  const { secretKey, publisher, collaboratorList, eventStore, peerId = getPublicKey(secretKey) } = options
  const selfPubkey = getPublicKey(secretKey)
  const peersSubject = new BehaviorSubject<Record<string, PeerInfo>>({})

  eventStore.subscribeEphemeral((event) => {
    const peerInfo = decryptPeerInfo(event.content, secretKey, event.pubkey)
    if (peerInfo === null) {
      console.warn('[DiscoveryBridge] skipping undecryptable PeerInfo event', event.id)
      return
    }

    peersSubject.next({
      ...peersSubject.getValue(),
      [event.pubkey]: peerInfo,
    })
  })

  return {
    async publishPeerInfo(workspaceId: string, multiaddrs: string[]): Promise<void> {
      const collaboratorPubkeys = await collaboratorList.getCollaboratorPubkeys(workspaceId)
      const peerInfo: PeerInfo = { pubkey: selfPubkey, peerId, multiaddrs, updatedAt: Date.now() }

      for (const recipientPubkey of collaboratorPubkeys) {
        const ciphertext = encryptPeerInfo(peerInfo, secretKey, recipientPubkey)
        const template: EventTemplate = {
          kind: PEER_INFO_EVENT_KIND,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ['p', recipientPubkey],
            ['workspace', workspaceId],
          ],
          content: ciphertext,
        }
        await publisher.publish(template)
      }
    },
    peers$: peersSubject.asObservable(),
  }
}

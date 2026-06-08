import type { Observable } from 'rxjs'
import type { PeerInfo } from '../types'

export interface MockLibp2pNode {
  subscribe(topic: string): void
  unsubscribe(topic: string): void
  dial(multiaddr: string): Promise<void>
  hangUp(multiaddr: string): Promise<void>
}

export interface RoomManagerOptions {
  node: MockLibp2pNode
  peers$: Observable<Record<string, PeerInfo>>
}

export interface RoomManager {
  joinRoom(workspaceId: string, pageId: string): Promise<void>
  leaveRoom(workspaceId: string, pageId: string): Promise<void>
}

function roomTopic(workspaceId: string, pageId: string): string {
  return `${workspaceId}:${pageId}`
}

export function createRoomManager(options: RoomManagerOptions): RoomManager {
  const { node, peers$ } = options
  let currentPeers: Record<string, PeerInfo> = {}
  peers$.subscribe((peers) => {
    currentPeers = peers
  })

  const openRooms = new Map<string, Set<string>>()

  function multiaddrsDialedElsewhere(multiaddr: string, exceptTopic: string): boolean {
    for (const [topic, addrs] of openRooms) {
      if (topic !== exceptTopic && addrs.has(multiaddr)) return true
    }
    return false
  }

  async function dialPeersForRoom(topic: string): Promise<void> {
    const dialed = openRooms.get(topic)
    if (!dialed) return

    for (const peer of Object.values(currentPeers)) {
      for (const multiaddr of peer.multiaddrs) {
        if (dialed.has(multiaddr)) continue
        await node.dial(multiaddr)
        dialed.add(multiaddr)
      }
    }
  }

  return {
    async joinRoom(workspaceId: string, pageId: string): Promise<void> {
      const topic = roomTopic(workspaceId, pageId)
      if (openRooms.has(topic)) return

      node.subscribe(topic)
      openRooms.set(topic, new Set<string>())
      await dialPeersForRoom(topic)
    },

    async leaveRoom(workspaceId: string, pageId: string): Promise<void> {
      const topic = roomTopic(workspaceId, pageId)
      const dialed = openRooms.get(topic)
      if (!dialed) return

      node.unsubscribe(topic)
      openRooms.delete(topic)

      for (const multiaddr of dialed) {
        if (!multiaddrsDialedElsewhere(multiaddr, topic)) {
          await node.hangUp(multiaddr)
        }
      }
    },
  }
}

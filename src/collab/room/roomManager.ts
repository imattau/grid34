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

interface OpenRoomState {
  dialed: Set<string>
}

function roomTopic(workspaceId: string, pageId: string): string {
  return `${workspaceId}:${pageId}`
}

export function createRoomManager(options: RoomManagerOptions): RoomManager {
  const { node, peers$ } = options
  let currentPeers: Record<string, PeerInfo> = {}
  const openRooms = new Map<string, OpenRoomState>()

  function currentPeerMultiaddrs(): Set<string> {
    const multiaddrs = new Set<string>()
    for (const peer of Object.values(currentPeers)) {
      for (const multiaddr of peer.multiaddrs) {
        multiaddrs.add(multiaddr)
      }
    }
    return multiaddrs
  }

  function multiaddrsDialedElsewhere(multiaddr: string, exceptTopic: string): boolean {
    for (const [topic, room] of openRooms) {
      if (topic !== exceptTopic && room.dialed.has(multiaddr)) return true
    }
    return false
  }

  async function syncRoom(topic: string): Promise<void> {
    const room = openRooms.get(topic)
    if (!room) return

    const peerMultiaddrs = currentPeerMultiaddrs()

    for (const peer of Object.values(currentPeers)) {
      for (const multiaddr of peer.multiaddrs) {
        if (room.dialed.has(multiaddr)) continue
        await node.dial(multiaddr)
        room.dialed.add(multiaddr)
      }
    }

    for (const multiaddr of Array.from(room.dialed)) {
      if (peerMultiaddrs.has(multiaddr)) continue
      if (multiaddrsDialedElsewhere(multiaddr, topic)) continue
      await node.hangUp(multiaddr)
      room.dialed.delete(multiaddr)
    }
  }

  peers$.subscribe((peers) => {
    currentPeers = peers
    void Promise.all(Array.from(openRooms.keys()).map(async (topic) => syncRoom(topic)))
  })

  return {
    async joinRoom(workspaceId: string, pageId: string): Promise<void> {
      const topic = roomTopic(workspaceId, pageId)
      if (openRooms.has(topic)) return

      node.subscribe(topic)
      openRooms.set(topic, { dialed: new Set<string>() })
      await syncRoom(topic)
    },

    async leaveRoom(workspaceId: string, pageId: string): Promise<void> {
      const topic = roomTopic(workspaceId, pageId)
      const room = openRooms.get(topic)
      if (!room) return

      node.unsubscribe(topic)
      openRooms.delete(topic)

      for (const multiaddr of room.dialed) {
        if (!multiaddrsDialedElsewhere(multiaddr, topic)) {
          await node.hangUp(multiaddr)
        }
      }
    },
  }
}

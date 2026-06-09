import { describe, expect, it, vi } from 'vitest'
import { BehaviorSubject } from 'rxjs'
import { createRoomManager, type MockLibp2pNode } from './roomManager'
import type { PeerInfo } from '../types'

function makeMockNode(): MockLibp2pNode {
  return {
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    dial: vi.fn(async () => {}),
    hangUp: vi.fn(async () => {}),
  }
}

describe('createRoomManager', () => {
  it('joins the gossipsub topic workspaceId:pageId and dials known peers', async () => {
    const node = makeMockNode()
    const peerA: PeerInfo = { pubkey: 'pkA', peerId: 'peerA', multiaddrs: ['/ip4/10.0.0.1/tcp/4001'], updatedAt: 1 }
    const peers$ = new BehaviorSubject<Record<string, PeerInfo>>({ pkA: peerA })

    const manager = createRoomManager({ node, peers$ })
    await manager.joinRoom('workspace-1', 'page-1')

    expect(node.subscribe).toHaveBeenCalledWith('workspace-1:page-1')
    expect(node.dial).toHaveBeenCalledWith(peerA.multiaddrs[0])
  })

  it('leaveRoom unsubscribes from the topic and disconnects peers no longer shared with any open room', async () => {
    const node = makeMockNode()
    const peerA: PeerInfo = { pubkey: 'pkA', peerId: 'peerA', multiaddrs: ['/ip4/10.0.0.1/tcp/4001'], updatedAt: 1 }
    const peers$ = new BehaviorSubject<Record<string, PeerInfo>>({ pkA: peerA })

    const manager = createRoomManager({ node, peers$ })
    await manager.joinRoom('workspace-1', 'page-1')
    await manager.leaveRoom('workspace-1', 'page-1')

    expect(node.unsubscribe).toHaveBeenCalledWith('workspace-1:page-1')
    expect(node.hangUp).toHaveBeenCalledWith(peerA.multiaddrs[0])
  })

  it('does not disconnect a peer still shared by another open room', async () => {
    const node = makeMockNode()
    const peerA: PeerInfo = { pubkey: 'pkA', peerId: 'peerA', multiaddrs: ['/ip4/10.0.0.1/tcp/4001'], updatedAt: 1 }
    const peers$ = new BehaviorSubject<Record<string, PeerInfo>>({ pkA: peerA })

    const manager = createRoomManager({ node, peers$ })
    await manager.joinRoom('workspace-1', 'page-1')
    await manager.joinRoom('workspace-1', 'page-2')
    await manager.leaveRoom('workspace-1', 'page-1')

    expect(node.hangUp).not.toHaveBeenCalled()

    await manager.leaveRoom('workspace-1', 'page-2')
    expect(node.hangUp).toHaveBeenCalledWith(peerA.multiaddrs[0])
  })

  it('dials newly discovered peers after a room is already open', async () => {
    const node = makeMockNode()
    const peers$ = new BehaviorSubject<Record<string, PeerInfo>>({})
    const manager = createRoomManager({ node, peers$ })

    await manager.joinRoom('workspace-1', 'page-1')

    const peerA: PeerInfo = { pubkey: 'pkA', peerId: 'peerA', multiaddrs: ['/ip4/10.0.0.1/tcp/4001'], updatedAt: 1 }
    peers$.next({ pkA: peerA })

    expect(node.dial).toHaveBeenCalledWith(peerA.multiaddrs[0])
  })
})

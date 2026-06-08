/**
 * Connection-bootstrap payload exchanged via encrypted ephemeral Nostr events
 * so authorized collaborators can dial each other directly over libp2p.
 */
export interface PeerInfo {
  pubkey: string
  peerId: string
  multiaddrs: string[]
  updatedAt: number
}

/**
 * Live cursor/selection presence for one collaborator on one page.
 */
export interface PresenceState {
  pubkey: string
  pageId: string
  blockId: string | null
  selection: { anchor: number; head: number } | null
}

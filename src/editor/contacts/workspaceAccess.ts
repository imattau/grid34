import { SimplePool } from 'nostr-tools/pool'
import type { EventTemplate, NostrEvent } from 'nostr-tools/pure'

export const WORKSPACE_ACCESS_EVENT_KIND = 30434

export interface WorkspaceAccessSnapshot {
  workspaceId: string
  pageId?: string
  collaboratorPubkeys: string[]
  ownerPubkey?: string
  updatedAt: number
  revoked?: boolean
}

function uniqueRelayUrls(relayUrls: string[]): string[] {
  return Array.from(new Set(relayUrls.filter((relay) => relay.trim().length > 0)))
}

function normalizeWorkspaceAccessSnapshot(content: Partial<WorkspaceAccessSnapshot>, event: NostrEvent): WorkspaceAccessSnapshot | null {
  if (typeof content.workspaceId !== 'string' || content.workspaceId.trim().length === 0) {
    return null
  }

  const collaboratorPubkeys = Array.isArray(content.collaboratorPubkeys)
    ? Array.from(
        new Set(content.collaboratorPubkeys.filter((value) => typeof value === 'string' && value.trim().length > 0))
      )
    : []

  return {
    workspaceId: content.workspaceId,
    pageId: typeof content.pageId === 'string' && content.pageId.trim().length > 0 ? content.pageId : undefined,
    collaboratorPubkeys,
    ownerPubkey: typeof content.ownerPubkey === 'string' && content.ownerPubkey.trim().length > 0 ? content.ownerPubkey : undefined,
    updatedAt: typeof content.updatedAt === 'number' ? content.updatedAt : event.created_at * 1000,
    revoked: content.revoked === true,
  }
}

function parseWorkspaceAccessSnapshot(event: NostrEvent): WorkspaceAccessSnapshot | null {
  try {
    return normalizeWorkspaceAccessSnapshot(JSON.parse(event.content) as Partial<WorkspaceAccessSnapshot>, event)
  } catch {
    return null
  }
}

type NostrBrowserApi = {
  signEvent?: (template: EventTemplate) => Promise<NostrEvent>
  nip04?: {
    encrypt?: (pubkey: string, plaintext: string) => Promise<string>
    decrypt?: (pubkey: string, ciphertext: string) => Promise<string>
  }
}

function getNostrApi(): NostrBrowserApi | undefined {
  return (globalThis as typeof globalThis & { nostr?: NostrBrowserApi }).nostr
}

function uniqueRecipients(snapshot: WorkspaceAccessSnapshot): string[] {
  return Array.from(
    new Set(
      [
        snapshot.ownerPubkey,
        ...snapshot.collaboratorPubkeys,
      ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0))
  )
}

async function encodeWorkspaceAccessSnapshot(
  recipientPubkey: string,
  snapshot: WorkspaceAccessSnapshot
): Promise<string | null> {
  const nostr = getNostrApi()
  if (!nostr?.nip04?.encrypt) return null

  try {
    return await nostr.nip04.encrypt(recipientPubkey, JSON.stringify(snapshot))
  } catch (error) {
    console.warn('[WorkspaceAccess] failed to encrypt snapshot payload', error)
    return null
  }
}

async function decodeWorkspaceAccessSnapshot(event: NostrEvent, recipientPubkey: string): Promise<WorkspaceAccessSnapshot | null> {
  const nostr = getNostrApi()
  if (nostr?.nip04?.decrypt) {
    try {
      const decrypted = await nostr.nip04.decrypt(recipientPubkey, event.content)
      const parsed = JSON.parse(decrypted) as Partial<WorkspaceAccessSnapshot>
      const normalized = normalizeWorkspaceAccessSnapshot(parsed, event)
      if (normalized) return normalized
    } catch {
      // Fall back to the legacy plaintext format below.
    }
  }

  return parseWorkspaceAccessSnapshot(event)
}

export async function publishWorkspaceAccessSnapshot(
  relayUrls: string[],
  snapshot: WorkspaceAccessSnapshot
): Promise<NostrEvent | null> {
  const nostr = getNostrApi()
  if (!nostr?.signEvent || !nostr.nip04?.encrypt) return null

  const relays = uniqueRelayUrls(relayUrls)
  if (relays.length === 0) return null

  const contentSnapshot: WorkspaceAccessSnapshot = {
    ...snapshot,
    collaboratorPubkeys: Array.from(new Set(snapshot.collaboratorPubkeys.filter((value) => value.trim().length > 0))),
    revoked: snapshot.revoked === true,
  }

  const pool = new SimplePool({ enablePing: true, enableReconnect: true })
  try {
    const recipients = uniqueRecipients(contentSnapshot)
    const signedEvents: NostrEvent[] = []

    for (const recipientPubkey of recipients) {
      const encryptedContent = await encodeWorkspaceAccessSnapshot(recipientPubkey, contentSnapshot)
      if (!encryptedContent) continue

      const template: EventTemplate = {
        kind: WORKSPACE_ACCESS_EVENT_KIND,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: encryptedContent,
      }

      const signed = await nostr.signEvent(template)
      signedEvents.push(signed)
    }

    if (signedEvents.length === 0) return null
    for (const signed of signedEvents) {
      await Promise.all(pool.publish(relays, signed))
    }
    return signedEvents[0] ?? null
  } finally {
    pool.close(relays)
  }
}

export async function loadWorkspaceAccessSnapshots(pubkey: string, relayUrls: string[]): Promise<WorkspaceAccessSnapshot[]> {
  const relays = uniqueRelayUrls(relayUrls)
  if (!pubkey || relays.length === 0) return []

  const pool = new SimplePool({ enablePing: true, enableReconnect: true })
  try {
    const events = await pool.querySync(
      relays,
      {
        kinds: [WORKSPACE_ACCESS_EVENT_KIND],
      },
      { maxWait: 4000 }
    )

    const snapshots = new Map<string, { createdAt: number; snapshot: WorkspaceAccessSnapshot }>()
    for (const event of events) {
      const snapshot = await decodeWorkspaceAccessSnapshot(event, pubkey)
      if (!snapshot) continue

      const existing = snapshots.get(snapshot.workspaceId)
      if (!existing || snapshot.updatedAt >= existing.snapshot.updatedAt) {
        snapshots.set(snapshot.workspaceId, { createdAt: event.created_at, snapshot })
      }
    }

    return Array.from(snapshots.values())
      .map(({ snapshot }) => snapshot)
      .filter((snapshot) => !snapshot.revoked)
      .filter((snapshot) => snapshot.collaboratorPubkeys.includes(pubkey) || snapshot.ownerPubkey === pubkey)
      .sort((left, right) => right.updatedAt - left.updatedAt)
  } catch (error) {
    console.warn('[WorkspaceAccess] failed to load workspace access snapshots', error)
    return []
  } finally {
    pool.close(relays)
  }
}

export async function loadWorkspaceAccessWorkspaces(pubkey: string, relayUrls: string[]): Promise<WorkspaceAccessSnapshot[]> {
  return (await loadWorkspaceAccessSnapshots(pubkey, relayUrls)).filter((snapshot) => !snapshot.pageId)
}

export interface IncomingWorkspaceInvite {
  workspaceId: string
  cek: string // hex
  senderPubkey: string
  timestamp: number
}

export async function sendNostrDMInvite(
  recipientPubkey: string,
  workspaceId: string,
  hexCek: string,
  relayUrls: string[]
): Promise<boolean> {
  const nostr = getNostrApi()
  if (!nostr?.signEvent || !nostr.nip04?.encrypt) return false

  const relays = uniqueRelayUrls(relayUrls)
  if (relays.length === 0) return false

  try {
    const invitePayload = {
      type: 'grid34-workspace-invite',
      workspaceId,
      cek: hexCek,
    }
    const encryptedContent = await nostr.nip04.encrypt(recipientPubkey, JSON.stringify(invitePayload))
    const template = {
      kind: 4,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['p', recipientPubkey]],
      content: encryptedContent,
    }
    const signed = await nostr.signEvent(template)
    const pool = new SimplePool({ enablePing: true, enableReconnect: true })
    try {
      await Promise.all(pool.publish(relays, signed))
    } finally {
      pool.close(relays)
    }
    return true
  } catch (error) {
    console.warn('[WorkspaceAccess] failed to send Nostr DM invite', error)
    return false
  }
}

export async function loadIncomingDMInvites(
  pubkey: string,
  relayUrls: string[]
): Promise<IncomingWorkspaceInvite[]> {
  const relays = uniqueRelayUrls(relayUrls)
  if (!pubkey || relays.length === 0) return []

  const nostr = getNostrApi()
  if (!nostr?.nip04?.decrypt) return []

  const pool = new SimplePool({ enablePing: true, enableReconnect: true })
  try {
    const events = await pool.querySync(
      relays,
      {
        kinds: [4],
        '#p': [pubkey],
      },
      { maxWait: 4000 }
    )

    const invites: IncomingWorkspaceInvite[] = []
    for (const event of events) {
      try {
        const decrypted = await nostr.nip04.decrypt(event.pubkey, event.content)
        const parsed = JSON.parse(decrypted) as Record<string, unknown>
        if (
          parsed &&
          parsed.type === 'grid34-workspace-invite' &&
          typeof parsed.workspaceId === 'string' &&
          typeof parsed.cek === 'string'
        ) {
          invites.push({
            workspaceId: parsed.workspaceId,
            cek: parsed.cek,
            senderPubkey: event.pubkey,
            timestamp: event.created_at * 1000,
          })
        }
      } catch {
        // Skip undecryptable DMs or non-invite DMs
      }
    }

    const newestInvites = new Map<string, IncomingWorkspaceInvite>()
    for (const invite of invites) {
      const existing = newestInvites.get(invite.workspaceId)
      if (!existing || invite.timestamp > existing.timestamp) {
        newestInvites.set(invite.workspaceId, invite)
      }
    }

    return Array.from(newestInvites.values()).sort((a, b) => b.timestamp - a.timestamp)
  } catch (error) {
    console.warn('[WorkspaceAccess] failed to load incoming DM invites', error)
    return []
  } finally {
    pool.close(relays)
  }
}

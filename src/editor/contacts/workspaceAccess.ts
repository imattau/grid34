import { SimplePool } from 'nostr-tools/pool'
import type { EventTemplate, NostrEvent } from 'nostr-tools/pure'

export const WORKSPACE_ACCESS_EVENT_KIND = 30434

export interface WorkspaceAccessSnapshot {
  workspaceId: string
  collaboratorPubkeys: string[]
  ownerPubkey?: string
  updatedAt: number
  revoked?: boolean
}

function uniqueRelayUrls(relayUrls: string[]): string[] {
  return Array.from(new Set(relayUrls.filter((relay) => relay.trim().length > 0)))
}

function parseWorkspaceAccessSnapshot(event: NostrEvent): WorkspaceAccessSnapshot | null {
  try {
    const content = JSON.parse(event.content) as Partial<WorkspaceAccessSnapshot>
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
      collaboratorPubkeys,
      ownerPubkey: typeof content.ownerPubkey === 'string' && content.ownerPubkey.trim().length > 0 ? content.ownerPubkey : undefined,
      updatedAt: typeof content.updatedAt === 'number' ? content.updatedAt : event.created_at * 1000,
      revoked: content.revoked === true,
    }
  } catch {
    return null
  }
}

function getNostrApi(): { signEvent?: (template: EventTemplate) => Promise<NostrEvent> } | undefined {
  return (globalThis as typeof globalThis & { nostr?: { signEvent?: (template: EventTemplate) => Promise<NostrEvent> } }).nostr
}

export async function publishWorkspaceAccessSnapshot(
  relayUrls: string[],
  snapshot: WorkspaceAccessSnapshot
): Promise<NostrEvent | null> {
  const nostr = getNostrApi()
  if (!nostr?.signEvent) return null

  const relays = uniqueRelayUrls(relayUrls)
  if (relays.length === 0) return null

  const contentSnapshot: WorkspaceAccessSnapshot = {
    ...snapshot,
    collaboratorPubkeys: Array.from(new Set(snapshot.collaboratorPubkeys.filter((value) => value.trim().length > 0))),
    revoked: snapshot.revoked === true,
  }

  const template: EventTemplate = {
    kind: WORKSPACE_ACCESS_EVENT_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['workspace', snapshot.workspaceId],
      ...contentSnapshot.collaboratorPubkeys.map((pubkey) => ['p', pubkey] as [string, string]),
    ],
    content: JSON.stringify(contentSnapshot),
  }

  const signed = await nostr.signEvent(template)
  const pool = new SimplePool({ enablePing: true, enableReconnect: true })
  try {
    await Promise.all(pool.publish(relays, signed))
    return signed
  } finally {
    pool.close(relays)
  }
}

export async function loadWorkspaceAccessWorkspaces(pubkey: string, relayUrls: string[]): Promise<WorkspaceAccessSnapshot[]> {
  const relays = uniqueRelayUrls(relayUrls)
  if (!pubkey || relays.length === 0) return []

  const pool = new SimplePool({ enablePing: true, enableReconnect: true })
  try {
    const events = await pool.querySync(
      relays,
      {
        kinds: [WORKSPACE_ACCESS_EVENT_KIND],
        '#p': [pubkey],
      },
      { maxWait: 4000 }
    )

    const snapshots = new Map<string, { createdAt: number; snapshot: WorkspaceAccessSnapshot }>()
    for (const event of events) {
      const snapshot = parseWorkspaceAccessSnapshot(event)
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

import { SimplePool } from 'nostr-tools/pool'
import type { NostrEvent } from 'nostr-tools/pure'

export interface NostrContact {
  pubkey: string
  relay?: string
  petname?: string
  name?: string
  displayName?: string
  picture?: string
}

function dedupeContacts(contacts: NostrContact[]): NostrContact[] {
  const byPubkey = new Map<string, NostrContact>()
  for (const contact of contacts) {
    if (!contact.pubkey) continue
    byPubkey.set(contact.pubkey, contact)
  }
  return Array.from(byPubkey.values())
}

export function parseNostrContactList(event: NostrEvent): NostrContact[] {
  return dedupeContacts(
    event.tags.flatMap((tag) => {
      if (tag[0] !== 'p' || !tag[1]) return []
      return [
        {
          pubkey: tag[1],
          relay: tag[2] || undefined,
          petname: tag[3] || undefined,
        },
      ]
    })
  )
}

export function parseProfileMetadata(event: NostrEvent): Pick<NostrContact, 'name' | 'displayName' | 'picture'> {
  try {
    const metadata = JSON.parse(event.content) as Record<string, unknown>
    const name = typeof metadata.name === 'string' ? metadata.name : undefined
    const displayName = typeof metadata.display_name === 'string' ? metadata.display_name : undefined
    const picture = typeof metadata.picture === 'string' ? metadata.picture : undefined
    return { name, displayName, picture }
  } catch {
    return {}
  }
}

async function loadContactProfiles(pubkeys: string[], relayUrls: string[]): Promise<Map<string, Pick<NostrContact, 'name' | 'displayName' | 'picture'>>> {
  const uniqueRelays = Array.from(new Set(relayUrls.filter((relay) => relay.trim().length > 0)))
  if (uniqueRelays.length === 0 || pubkeys.length === 0) return new Map()

  const pool = new SimplePool({ enablePing: true, enableReconnect: true })
  try {
    const events = await pool.querySync(uniqueRelays, {
      kinds: [0],
      authors: Array.from(new Set(pubkeys)),
    })

    const profiles = new Map<string, { createdAt: number; profile: Pick<NostrContact, 'name' | 'displayName' | 'picture'> }>()
    for (const event of events) {
      const profile = parseProfileMetadata(event)
      const existing = profiles.get(event.pubkey)
      if (!existing || event.created_at >= existing.createdAt) {
        profiles.set(event.pubkey, { createdAt: event.created_at, profile })
      }
    }

    return new Map(Array.from(profiles.entries()).map(([pubkey, value]) => [pubkey, value.profile]))
  } catch (error) {
    console.warn('[NostrContacts] failed to load contact profiles', error)
    return new Map()
  } finally {
    pool.close(uniqueRelays)
  }
}

export async function loadNostrContacts(pubkey: string, relayUrls: string[]): Promise<NostrContact[]> {
  const uniqueRelays = Array.from(new Set(relayUrls.filter((relay) => relay.trim().length > 0)))
  if (!pubkey || uniqueRelays.length === 0) return []

  const pool = new SimplePool({ enablePing: true, enableReconnect: true })
  try {
    const event = await pool.get(uniqueRelays, {
      kinds: [3],
      authors: [pubkey],
    })

    if (!event) return []
    const contacts = parseNostrContactList(event)
    const profiles = await loadContactProfiles(contacts.map((contact) => contact.pubkey), uniqueRelays)
    return contacts
      .map((contact) => ({
        ...contact,
        ...profiles.get(contact.pubkey),
      }))
      .sort((left, right) => {
        const leftLabel = left.displayName ?? left.name ?? left.petname ?? left.pubkey
        const rightLabel = right.displayName ?? right.name ?? right.petname ?? right.pubkey
        return leftLabel.localeCompare(rightLabel)
      })
  } catch (error) {
    console.warn('[NostrContacts] failed to load contact list', error)
    return []
  } finally {
    pool.close(uniqueRelays)
  }
}

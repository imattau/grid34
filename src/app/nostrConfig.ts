import { SimplePool } from 'nostr-tools/pool'
import type { NostrEvent } from 'nostr-tools/pure'

export interface WorkspacesConfigPayload {
  workspaces: string[]
  activeRepoId: string
  updatedAt: number
  ceks?: Record<string, string> // Map of repoId to JSON-serialized CEK byte array
}

export async function syncWorkspacesFromNostr(
  pubkey: string,
  relays: string[]
): Promise<WorkspacesConfigPayload | null> {
  if (typeof window === 'undefined' || !(window as any).nostr) return null

  try {
    const pool = new SimplePool({ enablePing: true, enableReconnect: true })
    const filter = {
      kinds: [30078],
      authors: [pubkey],
      '#d': ['grid34_workspaces_config'],
    }
    const event = await pool.get(relays, filter)
    pool.close(relays)

    if (event && event.content) {
      const decrypted = await (window as any).nostr.nip04.decrypt(pubkey, event.content)
      const data = JSON.parse(decrypted) as WorkspacesConfigPayload
      if (data && Array.isArray(data.workspaces)) {
        // Sync encrypted CEK keys back to localStorage if not present locally
        if (data.ceks) {
          for (const [repoId, cekJson] of Object.entries(data.ceks)) {
            const localKey = `grid34_cek_${repoId}`
            if (!localStorage.getItem(localKey)) {
              localStorage.setItem(localKey, cekJson)
            }
          }
        }
        return data
      }
    }
  } catch (err) {
    console.warn('Failed to load workspaces config from Nostr:', err)
  }
  return null
}

export async function saveWorkspacesToNostr(
  pubkey: string,
  workspaces: string[],
  activeRepoId: string,
  relays: string[]
): Promise<void> {
  if (typeof window === 'undefined' || !(window as any).nostr) return

  try {
    const pool = new SimplePool({ enablePing: true, enableReconnect: true })
    
    // Gather CEK keys for all workspaces from localStorage
    const ceks: Record<string, string> = {}
    for (const repoId of workspaces) {
      const localKey = `grid34_cek_${repoId}`
      const storedCek = localStorage.getItem(localKey)
      if (storedCek) {
        ceks[repoId] = storedCek
      }
    }

    const payload: WorkspacesConfigPayload = {
      workspaces,
      activeRepoId,
      updatedAt: Date.now(),
      ceks,
    }
    const encrypted = await (window as any).nostr.nip04.encrypt(pubkey, JSON.stringify(payload))
    const template = {
      kind: 30078,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['d', 'grid34_workspaces_config']],
      content: encrypted,
    }
    const signed = await (window as any).nostr.signEvent(template)
    await Promise.all(pool.publish(relays, signed))
    pool.close(relays)
  } catch (err) {
    console.warn('Failed to publish workspaces config to Nostr:', err)
  }
}

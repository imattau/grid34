export type MediaServerKind = 'blossom' | 'nip96'

export interface MediaServerTarget {
  kind: MediaServerKind
  url: string
}

export interface MediaServerLists {
  blossom: string[]
  nip96: string[]
}

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

function uniqueUrls(urls: string[]): string[] {
  return Array.from(new Set(urls.map(normalizeUrl).filter((value) => value.length > 0)))
}

function parseUrlList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return uniqueUrls(value.filter((item): item is string => typeof item === 'string'))
  }

  if (typeof value === 'string') {
    return uniqueUrls(
      value
        .split(/[\n,]/)
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
    )
  }

  return []
}

function collectUrlStrings(value: unknown): string[] {
  if (Array.isArray(value)) {
    return uniqueUrls(value.flatMap((item) => collectUrlStrings(item)))
  }

  if (typeof value === 'string') {
    return parseUrlList(value)
  }

  if (!value || typeof value !== 'object') {
    return []
  }

  const record = value as Record<string, unknown>
  const collected: string[] = []
  for (const nested of Object.values(record)) {
    collected.push(...collectUrlStrings(nested))
  }
  return uniqueUrls(collected)
}

function normalizeServerListValue(value: unknown, preferredKeys: string[] = []): string[] {
  const direct = parseUrlList(value)
  if (direct.length > 0) return direct

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return []
  }

  const record = value as Record<string, unknown>
  for (const key of preferredKeys) {
    const urls = parseUrlList(record[key])
    if (urls.length > 0) return urls
  }

  return collectUrlStrings(value)
}

function getStoredNostrUserPubkey(): string | null {
  if (typeof window === 'undefined') return null
  const stored = sessionStorage.getItem('nostr_user')
  if (!stored) return null
  try {
    const parsed = JSON.parse(stored) as { pubkey?: string }
    return typeof parsed.pubkey === 'string' && parsed.pubkey.trim().length > 0 ? parsed.pubkey : null
  } catch {
    return null
  }
}

function readStoredMediaServerLists(): MediaServerLists {
  if (typeof window === 'undefined') return { blossom: [], nip96: [] }

  const pubkey = getStoredNostrUserPubkey()
  const keys = [
    'grid34_media_servers',
    pubkey ? `grid34_media_servers_${pubkey}` : null,
    'grid34_blossom_servers',
    pubkey ? `grid34_blossom_servers_${pubkey}` : null,
    'grid34_nip96_servers',
    pubkey ? `grid34_nip96_servers_${pubkey}` : null,
  ].filter((value): value is string => typeof value === 'string')

  const next: MediaServerLists = { blossom: [], nip96: [] }

  for (const key of keys) {
    const raw = localStorage.getItem(key)
    if (!raw) continue

    try {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) {
        const urls = parseUrlList(parsed)
        next.blossom.push(...urls)
        next.nip96.push(...urls)
        continue
      }

      if (parsed && typeof parsed === 'object') {
        const maybeRecord = parsed as Record<string, unknown>
        next.blossom.push(...normalizeServerListValue(maybeRecord.blossom ?? parsed, ['blossom', 'servers', 'urls', 'items', 'list']))
        next.nip96.push(...normalizeServerListValue(maybeRecord.nip96 ?? parsed, ['nip96', 'servers', 'urls', 'items', 'list']))
      }
    } catch {
      next.blossom.push(...parseUrlList(raw))
    }
  }

  return {
    blossom: uniqueUrls(next.blossom),
    nip96: uniqueUrls(next.nip96),
  }
}

async function resolveMaybePromise<T>(value: T | Promise<T>): Promise<T> {
  return await value
}

function getNostrApi(): any {
  return (globalThis as typeof globalThis & { nostr?: any }).nostr
}

async function readNostrProvidedMediaServerLists(): Promise<MediaServerLists> {
  const api = getNostrApi()
  if (!api) return { blossom: [], nip96: [] }

  const next: MediaServerLists = { blossom: [], nip96: [] }

  try {
    if (typeof api.getBlossomServers === 'function') {
      next.blossom.push(...normalizeServerListValue(await resolveMaybePromise(api.getBlossomServers()), ['blossom', 'servers', 'urls', 'items', 'list']))
    }
  } catch {
    // Ignore extension-specific failures and continue with other sources.
  }

  try {
    if (typeof api.getNip96Servers === 'function') {
      next.nip96.push(...normalizeServerListValue(await resolveMaybePromise(api.getNip96Servers()), ['nip96', 'servers', 'urls', 'items', 'list']))
    }
  } catch {
    // Ignore extension-specific failures and continue with other sources.
  }

  try {
    if (typeof api.getMediaServers === 'function') {
      const servers = await resolveMaybePromise(api.getMediaServers())
      if (Array.isArray(servers)) {
        const urls = parseUrlList(servers)
        next.blossom.push(...urls)
        next.nip96.push(...urls)
      } else if (servers && typeof servers === 'object') {
        const record = servers as Record<string, unknown>
        next.blossom.push(...normalizeServerListValue(record.blossom ?? servers, ['blossom', 'servers', 'urls', 'items', 'list']))
        next.nip96.push(...normalizeServerListValue(record.nip96 ?? servers, ['nip96', 'servers', 'urls', 'items', 'list']))
      }
    }
  } catch {
    // Ignore extension-specific failures and continue with other sources.
  }

  return {
    blossom: uniqueUrls(next.blossom),
    nip96: uniqueUrls(next.nip96),
  }
}

export async function resolveMediaServerLists(): Promise<MediaServerLists> {
  const nostrLists = await readNostrProvidedMediaServerLists()
  const storedLists = readStoredMediaServerLists()

  return {
    blossom: uniqueUrls([...nostrLists.blossom, ...storedLists.blossom]),
    nip96: uniqueUrls([...nostrLists.nip96, ...storedLists.nip96]),
  }
}

export function buildMediaServerTargets(
  lists: MediaServerLists,
  fallback?: { kind: MediaServerKind; url: string }
): MediaServerTarget[] {
  const targets: MediaServerTarget[] = [
    ...lists.blossom.map((url) => ({ kind: 'blossom' as const, url })),
    ...lists.nip96.map((url) => ({ kind: 'nip96' as const, url })),
  ]

  if (targets.length > 0) {
    return targets
  }

  if (fallback && fallback.url.trim().length > 0) {
    return [{ kind: fallback.kind, url: normalizeUrl(fallback.url) }]
  }

  return []
}

export function chooseFirstServedUrl(urls: string[]): string {
  return uniqueUrls(urls)[0] ?? ''
}

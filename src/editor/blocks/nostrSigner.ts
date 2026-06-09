import { BlossomClient } from 'nostr-tools/nipb7'
import { PlainKeySigner } from 'nostr-tools/signer'

type NostrAuthTemplate = {
  kind: number
  tags: string[][]
  content: string
  created_at: number
}

export interface NostrBrowserSignerApi {
  getPublicKey?: () => Promise<string>
  signEvent?: (template: NostrAuthTemplate) => Promise<{ pubkey?: string }>
}

function getNostrApi(): NostrBrowserSignerApi | undefined {
  return (globalThis as typeof globalThis & { nostr?: NostrBrowserSignerApi }).nostr
}

export function createBrowserSigner() {
  const nostr = getNostrApi()
  if (nostr?.getPublicKey && nostr?.signEvent) {
    return {
      getPublicKey: async () => await nostr.getPublicKey!(),
      signEvent: async (template: NostrAuthTemplate) => await nostr.signEvent!(template),
    }
  }

  const stored = localStorage.getItem('grid34_workspace_signing_key')
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as number[]
      return new PlainKeySigner(new Uint8Array(parsed))
    } catch (error) {
      console.error('Failed to construct browser signer from local fallback key', error)
    }
  }

  throw new Error('Signer unavailable. Please log in with a Nostr extension or generate a local key.')
}

export function createBlossomClient(target: string): BlossomClient {
  return new BlossomClient(target, createBrowserSigner())
}

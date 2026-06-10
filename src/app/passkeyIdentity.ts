import { generateSecretKey, getPublicKey, finalizeEvent, type EventTemplate, type NostrEvent } from 'nostr-tools/pure'
import { encrypt as nip04Encrypt, decrypt as nip04Decrypt } from 'nostr-tools/nip04'
import { bytesToHex, hexToBytes, encryptContent, decryptContent } from '../storage/crypto/cryptoBox'

const STORAGE_KEY = 'grid34_passkey_identity'

export interface PasskeyIdentityRecord {
  version: 1
  credentialId: string
  encryptedNsec: string
  pubkey: string
}

// SHA-256('grid34-passkey-nsec-v1')
const PRF_SALT = new Uint8Array([
  130, 122, 130, 168, 209, 154, 213, 214, 142, 143, 1, 219, 58, 219, 221, 220, 21, 201, 128, 123, 255, 188, 110, 109,
  165, 112, 88, 63, 193, 242, 8, 180,
])

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToArrayBuffer(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
  const binary = atob(padded + padding)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

function isValidRecord(value: unknown): value is PasskeyIdentityRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    record.version === 1 &&
    typeof record.credentialId === 'string' &&
    typeof record.encryptedNsec === 'string' &&
    typeof record.pubkey === 'string'
  )
}

function readStoredRecord(): PasskeyIdentityRecord | null {
  if (typeof window === 'undefined') return null
  const stored = localStorage.getItem(STORAGE_KEY)
  if (!stored) return null
  try {
    const parsed = JSON.parse(stored)
    return isValidRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function hasStoredPasskeyIdentity(): boolean {
  return readStoredRecord() !== null
}

export function getStoredPasskeyPubkey(): string | null {
  const record = readStoredRecord()
  return record ? record.pubkey : null
}

export function clearPasskeyIdentity(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export async function isPRFSupported(): Promise<boolean> {
  return (
    typeof window !== 'undefined' &&
    !!window.PublicKeyCredential &&
    typeof navigator?.credentials?.create === 'function'
  )
}

async function normalizePRFKey(prfResult: ArrayBuffer): Promise<Uint8Array> {
  if (prfResult.byteLength === 32) {
    return new Uint8Array(prfResult)
  }
  const digest = await crypto.subtle.digest('SHA-256', prfResult)
  return new Uint8Array(digest)
}

function extractPRFResult(credential: PublicKeyCredential): ArrayBuffer | undefined {
  const extensions = credential.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer } } }
  return extensions.prf?.results?.first
}

export async function registerPasskeyIdentity(): Promise<{ secretKey: Uint8Array; pubkey: string }> {
  if (!(await isPRFSupported())) {
    throw new Error('Passkeys are not supported in this browser.')
  }

  const prfSalt = PRF_SALT

  const credential = (await navigator.credentials.create({
    publicKey: {
      rp: { name: 'Grid34', id: location.hostname },
      user: {
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: 'grid34-identity',
        displayName: 'Grid34 Identity',
      },
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
      extensions: { prf: { eval: { first: prfSalt } } },
    },
  })) as PublicKeyCredential | null

  if (!credential) {
    throw new Error('Passkey registration was cancelled.')
  }

  let prfResult = extractPRFResult(credential)

  if (prfResult === undefined) {
    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ id: credential.rawId, type: 'public-key' }],
        userVerification: 'required',
        extensions: { prf: { eval: { first: prfSalt } } },
      },
    })) as PublicKeyCredential | null

    if (assertion) {
      prfResult = extractPRFResult(assertion)
    }
  }

  if (prfResult === undefined) {
    throw new Error('This device does not support passkey-based encryption (PRF extension required).')
  }

  const prfKey = await normalizePRFKey(prfResult)

  const secretKey = generateSecretKey()
  const pubkey = getPublicKey(secretKey)
  const encryptedNsec = encryptContent(bytesToHex(secretKey), prfKey)
  const credentialId = arrayBufferToBase64Url(credential.rawId)

  const record: PasskeyIdentityRecord = { version: 1, credentialId, encryptedNsec, pubkey }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(record))

  return { secretKey, pubkey }
}

export async function unlockPasskeyIdentity(): Promise<{ secretKey: Uint8Array; pubkey: string }> {
  const record = readStoredRecord()
  if (!record) {
    throw new Error('No passkey identity found on this device.')
  }

  const prfSalt = PRF_SALT
  const credentialIdBytes = base64UrlToArrayBuffer(record.credentialId)

  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ id: credentialIdBytes, type: 'public-key' }],
      userVerification: 'required',
      extensions: { prf: { eval: { first: prfSalt } } },
    },
  })) as PublicKeyCredential | null

  if (!credential) {
    throw new Error('Passkey unlock was cancelled.')
  }

  const prfResult = extractPRFResult(credential)
  if (prfResult === undefined) {
    throw new Error('Passkey unlock failed: PRF extension result unavailable.')
  }

  const prfKey = await normalizePRFKey(prfResult)
  const nsecHex = decryptContent(record.encryptedNsec, prfKey)
  const secretKey = hexToBytes(nsecHex)

  return { secretKey, pubkey: record.pubkey }
}

export interface PasskeySignerShim {
  getPublicKey: () => Promise<string>
  signEvent: (template: EventTemplate) => Promise<NostrEvent>
  nip04: {
    encrypt: (pubkey: string, plaintext: string) => Promise<string>
    decrypt: (pubkey: string, ciphertext: string) => Promise<string>
  }
  __grid34Passkey: true
}

export function buildPasskeySignerShim(secretKey: Uint8Array): PasskeySignerShim {
  return {
    getPublicKey: async () => getPublicKey(secretKey),
    signEvent: async (template: EventTemplate) => finalizeEvent(template, secretKey),
    nip04: {
      encrypt: async (pubkey: string, plaintext: string) => nip04Encrypt(secretKey, pubkey, plaintext),
      decrypt: async (pubkey: string, ciphertext: string) => nip04Decrypt(secretKey, pubkey, ciphertext),
    },
    __grid34Passkey: true,
  }
}

export function isPasskeyShim(nostr: unknown): boolean {
  return !!nostr && typeof nostr === 'object' && (nostr as { __grid34Passkey?: unknown }).__grid34Passkey === true
}

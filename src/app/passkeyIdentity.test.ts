import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getPublicKey } from 'nostr-tools/pure'
import {
  buildPasskeySignerShim,
  clearPasskeyIdentity,
  getStoredPasskeyPubkey,
  hasStoredPasskeyIdentity,
  registerPasskeyIdentity,
  unlockPasskeyIdentity,
} from './passkeyIdentity'

const FIXED_PRF_BYTES = new Uint8Array(32)
for (let i = 0; i < 32; i++) FIXED_PRF_BYTES[i] = i + 1
const FIXED_PRF_BUFFER = FIXED_PRF_BYTES.buffer

const FIXED_RAW_ID = new Uint8Array([1, 2, 3, 4, 5]).buffer

function mockCredentialsWithPRF() {
  Object.defineProperty(globalThis.navigator, 'credentials', {
    value: {
      create: async () => ({
        rawId: FIXED_RAW_ID,
        getClientExtensionResults: () => ({ prf: { results: { first: FIXED_PRF_BUFFER }, enabled: true } }),
      }),
      get: async () => ({
        rawId: FIXED_RAW_ID,
        getClientExtensionResults: () => ({ prf: { results: { first: FIXED_PRF_BUFFER }, enabled: true } }),
      }),
    },
    configurable: true,
  })
}

function mockCredentialsWithoutPRF() {
  Object.defineProperty(globalThis.navigator, 'credentials', {
    value: {
      create: async () => ({
        rawId: FIXED_RAW_ID,
        getClientExtensionResults: () => ({}),
      }),
      get: async () => ({
        rawId: FIXED_RAW_ID,
        getClientExtensionResults: () => ({}),
      }),
    },
    configurable: true,
  })
}

describe('passkeyIdentity', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    Object.defineProperty(window, 'PublicKeyCredential', {
      value: function PublicKeyCredential() {},
      configurable: true,
      writable: true,
    })
  })

  afterEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    delete (window as { PublicKeyCredential?: unknown }).PublicKeyCredential
  })

  it('hasStoredPasskeyIdentity / getStoredPasskeyPubkey / clearPasskeyIdentity behave correctly', () => {
    expect(hasStoredPasskeyIdentity()).toBe(false)
    expect(getStoredPasskeyPubkey()).toBeNull()

    localStorage.setItem(
      'grid34_passkey_identity',
      JSON.stringify({ version: 1, credentialId: 'abc', encryptedNsec: 'enc', pubkey: 'deadbeef' })
    )

    expect(hasStoredPasskeyIdentity()).toBe(true)
    expect(getStoredPasskeyPubkey()).toBe('deadbeef')

    clearPasskeyIdentity()
    expect(hasStoredPasskeyIdentity()).toBe(false)
    expect(getStoredPasskeyPubkey()).toBeNull()
  })

  it('registerPasskeyIdentity stores a valid record and returns a consistent keypair', async () => {
    mockCredentialsWithPRF()

    const { secretKey, pubkey } = await registerPasskeyIdentity()

    expect(getPublicKey(secretKey)).toBe(pubkey)

    const stored = localStorage.getItem('grid34_passkey_identity')
    expect(stored).toBeTruthy()
    const record = JSON.parse(stored!)
    expect(record.version).toBe(1)
    expect(typeof record.credentialId).toBe('string')
    expect(typeof record.encryptedNsec).toBe('string')
    expect(record.pubkey).toBe(pubkey)
  })

  it('unlockPasskeyIdentity round-trips the secret key after registration', async () => {
    mockCredentialsWithPRF()

    const registered = await registerPasskeyIdentity()
    const unlocked = await unlockPasskeyIdentity()

    expect(unlocked.pubkey).toBe(registered.pubkey)
    expect(unlocked.secretKey).toEqual(registered.secretKey)
  })

  it('unlockPasskeyIdentity throws when no identity is stored', async () => {
    mockCredentialsWithPRF()
    await expect(unlockPasskeyIdentity()).rejects.toThrow('No passkey identity found on this device.')
  })

  it('registerPasskeyIdentity throws when PRF is unavailable', async () => {
    mockCredentialsWithoutPRF()

    await expect(registerPasskeyIdentity()).rejects.toThrow(
      'This device does not support passkey-based encryption (PRF extension required).'
    )
  })

  it('buildPasskeySignerShim provides a working signer', async () => {
    mockCredentialsWithPRF()
    const { secretKey, pubkey } = await registerPasskeyIdentity()

    const signer = buildPasskeySignerShim(secretKey)

    expect(await signer.getPublicKey()).toBe(pubkey)

    const event = await signer.signEvent({
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: 'hello',
    })
    expect(event.pubkey).toBe(pubkey)

    const ciphertext = await signer.nip04.encrypt(pubkey, 'secret message')
    const plaintext = await signer.nip04.decrypt(pubkey, ciphertext)
    expect(plaintext).toBe('secret message')
  })
})

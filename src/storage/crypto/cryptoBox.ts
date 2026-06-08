import { decrypt as nip44Decrypt, encrypt as nip44Encrypt, getConversationKey } from 'nostr-tools/nip44'

export type CEK = Uint8Array

const CEK_BYTE_LENGTH = 32

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Invalid hex string length')
  }

  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16)
  }

  return bytes
}

export function generateCEK(): CEK {
  return globalThis.crypto.getRandomValues(new Uint8Array(CEK_BYTE_LENGTH))
}

export function wrapCEK(cek: CEK, ownerSecretKey: Uint8Array, recipientPubkey: string): string {
  const conversationKey = getConversationKey(ownerSecretKey, recipientPubkey)
  return nip44Encrypt(bytesToHex(cek), conversationKey)
}

export function unwrapCEK(wrapped: string, recipientSecretKey: Uint8Array, ownerPubkey: string): CEK {
  const conversationKey = getConversationKey(recipientSecretKey, ownerPubkey)
  const hex = nip44Decrypt(wrapped, conversationKey)
  return hexToBytes(hex)
}

export function encryptContent(plaintext: string, cek: CEK): string {
  return nip44Encrypt(plaintext, cek)
}

export function decryptContent(ciphertext: string, cek: CEK): string {
  return nip44Decrypt(ciphertext, cek)
}

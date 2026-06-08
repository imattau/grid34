import { describe, expect, it } from 'vitest'
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import { decryptContent, encryptContent, generateCEK, unwrapCEK, wrapCEK } from './cryptoBox'

describe('CEK wrap/unwrap', () => {
  it('round-trips a CEK wrapped for a recipient and unwrapped by them', () => {
    const ownerSk = generateSecretKey()
    const recipientSk = generateSecretKey()
    const recipientPk = getPublicKey(recipientSk)

    const cek = generateCEK()
    const wrapped = wrapCEK(cek, ownerSk, recipientPk)

    const ownerPk = getPublicKey(ownerSk)
    const unwrapped = unwrapCEK(wrapped, recipientSk, ownerPk)

    expect(unwrapped).toEqual(cek)
  })
})

describe('content encryption', () => {
  it('round-trips JSON content through encryptContent/decryptContent', () => {
    const cek = generateCEK()
    const page = { id: 'page-1', title: 'Hello', blocks: [] }

    const ciphertext = encryptContent(JSON.stringify(page), cek)
    expect(ciphertext).not.toContain('Hello')

    const plaintext = decryptContent(ciphertext, cek)
    expect(JSON.parse(plaintext)).toEqual(page)
  })
})

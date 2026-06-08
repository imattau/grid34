import { describe, expect, it, vi } from 'vitest'
import { generateSecretKey, finalizeEvent, type EventTemplate } from 'nostr-tools/pure'
import { publishPatch, type RelayPublisher, type Signer } from './publisher'

describe('publishPatch', () => {
  it('signs the template with the provided signer and publishes to all relays', async () => {
    const sk = generateSecretKey()
    const signer: Signer = {
      signEvent: async (template: EventTemplate) => finalizeEvent(template, sk),
    }

    const published: { url: string; eventId: string }[] = []
    const relayPublisher: RelayPublisher = {
      publish: vi.fn(async (url: string, event) => {
        published.push({ url, eventId: event.id })
      }),
    }

    const template: EventTemplate = {
      kind: 1617,
      created_at: 1000,
      tags: [['a', '30617:workspace-repo']],
      content: 'cipher',
    }

    const signed = await publishPatch(template, signer, relayPublisher, ['wss://relay-a', 'wss://relay-b'])

    expect(signed.id).toBeTruthy()
    expect(published).toEqual([
      { url: 'wss://relay-a', eventId: signed.id },
      { url: 'wss://relay-b', eventId: signed.id },
    ])
  })
})

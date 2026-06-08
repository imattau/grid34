export interface EventTemplateLike {
  kind: number
  created_at: number
  tags: string[][]
  content: string
}

export interface NostrEventLike extends EventTemplateLike {
  id: string
  pubkey?: string
  sig?: string
}

export interface Signer {
  signEvent(template: EventTemplateLike): Promise<NostrEventLike>
}

export interface RelayPublisher {
  publish(relayUrl: string, event: NostrEventLike): Promise<void>
}

export async function publishPatch(
  template: EventTemplateLike,
  signer: Signer,
  relayPublisher: RelayPublisher,
  relayUrls: string[]
): Promise<NostrEventLike> {
  const signed = await signer.signEvent(template)

  for (const url of relayUrls) {
    await relayPublisher.publish(url, signed)
  }

  return signed
}

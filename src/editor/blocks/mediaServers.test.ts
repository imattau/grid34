import { describe, expect, it, vi } from 'vitest'
import { buildMediaServerTargets, chooseFirstServedUrl } from './mediaServers'

describe('mediaServers', () => {
  it('prefers configured lists over the fallback target', () => {
    expect(
      buildMediaServerTargets(
        { blossom: ['https://one.example', 'https://two.example'], nip96: ['https://nip.example'] },
        { kind: 'blossom', url: 'https://fallback.example' }
      )
    ).toEqual([
      { kind: 'blossom', url: 'https://one.example' },
      { kind: 'blossom', url: 'https://two.example' },
      { kind: 'nip96', url: 'https://nip.example' },
    ])
  })

  it('falls back to a single configured target when no list is available', () => {
    expect(buildMediaServerTargets({ blossom: [], nip96: [] }, { kind: 'blossom', url: 'https://fallback.example/' })).toEqual([
      { kind: 'blossom', url: 'https://fallback.example' },
    ])
  })

  it('chooses the first served url from a deduplicated list', () => {
    expect(chooseFirstServedUrl(['https://a.example', 'https://a.example', 'https://b.example'])).toBe('https://a.example')
  })
})

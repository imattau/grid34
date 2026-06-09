import { describe, expect, it, vi } from 'vitest'
import { mentionSuggestionConfig } from './mentionSuggestions'
import * as contactModule from '../contacts/nostrContacts'

describe('mentionSuggestions', () => {
  it('filters items correctly based on case-insensitive matches on petname, displayName, name, or pubkey', () => {
    const mockContacts = [
      { pubkey: 'pubkey1', petname: 'Alice', name: 'alice_uninvited', displayName: 'Alice In Wonderland' },
      { pubkey: 'pubkey2', petname: 'Bob', name: 'bob_builder' },
      { pubkey: 'pubkey3', name: 'Charlie' },
    ]
    
    vi.spyOn(contactModule, 'getCachedContacts').mockReturnValue(mockContacts)

    const res1 = mentionSuggestionConfig.items({ query: 'ali' })
    expect(res1).toHaveLength(1)
    expect(res1[0].pubkey).toBe('pubkey1')

    const res2 = mentionSuggestionConfig.items({ query: 'builder' })
    expect(res2).toHaveLength(1)
    expect(res2[0].pubkey).toBe('pubkey2')

    const res3 = mentionSuggestionConfig.items({ query: 'pubkey3' })
    expect(res3).toHaveLength(1)
    expect(res3[0].pubkey).toBe('pubkey3')

    const res4 = mentionSuggestionConfig.items({ query: 'BOB' })
    expect(res4).toHaveLength(1)
    expect(res4[0].pubkey).toBe('pubkey2')
  })
})

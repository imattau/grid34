import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { mentionSuggestionConfig } from './mentionSuggestions'
import * as contactModule from '../contacts/nostrContacts'

vi.mock('@tiptap/react', () => {
  return {
    ReactRenderer: vi.fn().mockImplementation(function (_Component: unknown, _options: unknown) {
      this.element = document.createElement('div')
      this.updateProps = vi.fn()
      this.destroy = vi.fn()
      this.ref = {
        onKeyDown: vi.fn().mockReturnValue(true),
      }
    }),
  }
})

describe('mentionSuggestions', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('filters items correctly based on case-insensitive matches on petname, displayName, name, or pubkey', () => {
    const mockContacts = [
      { pubkey: 'pubkey1', petname: 'Alice', name: 'alice_uninvited', displayName: 'Alice In Wonderland' },
      { pubkey: 'pubkey2', petname: 'Bob', name: 'bob_builder' },
      { pubkey: 'pubkey3', name: 'Charlie' },
    ]
    
    vi.spyOn(contactModule, 'getCachedMentionContacts').mockReturnValue(
      mockContacts.map((contact) => ({
        contact,
        searchText: [contact.petname, contact.displayName, contact.name, contact.pubkey].filter(Boolean).join(' ').toLowerCase(),
      }))
    )

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

  it('returns no suggestion items when the cached contact list is empty', () => {
    vi.spyOn(contactModule, 'getCachedMentionContacts').mockReturnValue([])

    expect(mentionSuggestionConfig.items({ query: '' })).toEqual([])
  })

  it('limits the number of rendered mention suggestions', () => {
    const mockContacts = Array.from({ length: 12 }, (_, index) => ({
      pubkey: `pubkey-${index}`,
      displayName: `Person ${index}`,
    }))

    vi.spyOn(contactModule, 'getCachedMentionContacts').mockReturnValue(
      mockContacts.map((contact) => ({
        contact,
        searchText: `${contact.displayName?.toLowerCase()} ${contact.pubkey}`,
      }))
    )

    const res = mentionSuggestionConfig.items({ query: 'person' })
    expect(res).toHaveLength(8)
    expect(res[0].pubkey).toBe('pubkey-0')
    expect(res[7].pubkey).toBe('pubkey-7')
  })

  it('mounts the rendered suggestion component into the popup container', () => {
    vi.spyOn(contactModule, 'getCachedMentionContacts').mockReturnValue([
      {
        contact: { pubkey: 'pubkey1', displayName: 'Alice' },
        searchText: 'alice pubkey1',
      },
    ])

    const renderer = mentionSuggestionConfig.render()

    renderer.onStart({
      editor: {},
      items: [{ pubkey: 'pubkey1', displayName: 'Alice' }],
      clientRect: () =>
        new DOMRect(10, 20, 30, 40),
    })

    const popup = document.querySelector('.mention-suggestions-popup')
    expect(popup).not.toBeNull()
    expect(popup?.childElementCount).toBe(1)
    expect(popup?.firstElementChild).toBeInstanceOf(HTMLElement)

    renderer.onExit()
    expect(document.querySelector('.mention-suggestions-popup')).toBeNull()
  })
})

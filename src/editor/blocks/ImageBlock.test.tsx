import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { ImageBlock } from './ImageBlock'
import { DraftStoreContext } from '../contexts/storeContexts'
import type { DraftStore } from '../stores/draftStore'
import type { Block } from '../../storage/repo/types'

vi.mock('../../storage/crypto/cryptoBox', () => ({
  encryptContent: vi.fn((value: string) => value),
  decryptContent: vi.fn((value: string) => value),
}))

function makeBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: 'block-img-1',
    type: 'image',
    parentBlockId: null,
    order: 0,
    content: { url: undefined, caption: '' },
    updatedAt: 1000,
    ...overrides,
  }
}

function renderWithDraftStore(block: Block, draftStore: Partial<DraftStore>) {
  return render(
    <DraftStoreContext.Provider value={draftStore as DraftStore}>
      <ImageBlock block={block} pageId="page-1" />
    </DraftStoreContext.Provider>
  )
}

describe('ImageBlock', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders upload panel when no url is present', () => {
    renderWithDraftStore(makeBlock(), { cek: new Uint8Array(32) })
    expect(screen.getByText('Upload Encrypted Image')).toBeInTheDocument()
    expect(screen.getByText('Select Image')).toBeInTheDocument()
  })

  it('renders loading or fetching message if url is provided', () => {
    const block = makeBlock({ content: { url: 'https://example.com/enc.txt', caption: 'Test Encrypted Image' } })
    renderWithDraftStore(block, { cek: new Uint8Array(32) })
    expect(screen.getByText('Decrypting Image...')).toBeInTheDocument()
  })

  it('shows the first mirror that successfully serves the encrypted payload', async () => {
    const block = makeBlock({
      content: {
        url: 'https://primary.example/enc.txt',
        mirrorUrls: ['https://mirror-fast.example/enc.txt', 'https://mirror-slow.example/enc.txt'],
        caption: 'Mirrored Image',
      },
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('primary.example')) {
        return Promise.resolve({
          ok: false,
          status: 503,
          text: async () => 'unavailable',
        } as Response)
      }

      if (url.includes('mirror-fast.example')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ mimeType: 'image/png', data: 'data:image/png;base64,SECOND' }),
        } as Response)
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ mimeType: 'image/png', data: 'data:image/png;base64,THIRD' }),
      } as Response)
    })

    renderWithDraftStore(block, { cek: new Uint8Array(32) })

    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Mirrored Image' })).toHaveAttribute('src', expect.stringContaining('SECOND'))
    })
  })
})

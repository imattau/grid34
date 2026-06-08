import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ImageBlock } from './ImageBlock'
import { DraftStoreContext } from '../contexts/storeContexts'
import type { DraftStore } from '../stores/draftStore'
import type { Block } from '../../storage/repo/types'

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
})

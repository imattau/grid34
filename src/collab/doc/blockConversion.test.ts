import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { applyBlockEdit, pageToYDoc, yDocToPage } from './blockConversion'
import type { Page } from '../../storage/repo/types'

function makePage(): Page {
  return {
    id: 'page-1',
    title: 'My Page',
    parentId: null,
    order: 0,
    blocks: [
      { id: 'block-1', type: 'paragraph', parentBlockId: null, order: 0, content: { text: 'hello' }, updatedAt: 1000 },
      { id: 'block-2', type: 'heading', parentBlockId: null, order: 1, content: { text: 'Title', level: 1 }, updatedAt: 1000 },
    ],
    updatedAt: 1000,
  }
}

describe('Page <-> Y.Doc conversion', () => {
  it('round-trips a Page through a Y.Doc unchanged', () => {
    const page = makePage()
    const ydoc = pageToYDoc(page)
    const result = yDocToPage(ydoc, {
      id: page.id,
      title: page.title,
      parentId: page.parentId,
      order: page.order,
      updatedAt: page.updatedAt,
    })

    expect(result).toEqual(page)
  })

  it('applyBlockEdit mutates the shared block content and bumps updatedAt', () => {
    const page = makePage()
    const ydoc = pageToYDoc(page)

    applyBlockEdit(ydoc, 'block-1', { text: 'hello world' }, 2000)
    const result = yDocToPage(ydoc, {
      id: page.id,
      title: page.title,
      parentId: page.parentId,
      order: page.order,
    })

    const edited = result.blocks.find((block) => block.id === 'block-1')!
    expect(edited.content).toEqual({ text: 'hello world' })
    expect(edited.updatedAt).toBe(2000)

    const untouched = result.blocks.find((block) => block.id === 'block-2')!
    expect(untouched.content).toEqual({ text: 'Title', level: 1 })
    expect(untouched.updatedAt).toBe(1000)
  })
})

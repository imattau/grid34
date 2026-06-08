import { useState } from 'react'
import { useDraftStore } from '../contexts/storeContexts'
import type { Block } from '../../storage/repo/types'

export interface BlockProps {
  block: Block
  pageId: string
}

export function ParagraphBlock({ block, pageId }: BlockProps) {
  const draftStore = useDraftStore()
  const [text, setText] = useState(() => (block.content.text as string) ?? '')

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const value = event.target.value
    setText(value)
    draftStore.stage(pageId, block.id, { ...block.content, text: value })
  }

  return <input type="text" aria-label="Paragraph text" value={text} onChange={handleChange} />
}

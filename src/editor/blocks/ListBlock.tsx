import { useState } from 'react'
import { useDraftStore } from '../contexts/storeContexts'
import type { Block } from '../../storage/repo/types'
import type { BlockProps } from './ParagraphBlock'

function listKind(block: Block): 'bullet' | 'numbered' {
  return block.content.kind === 'numbered' ? 'numbered' : 'bullet'
}

export function ListBlock({ block, pageId }: BlockProps) {
  const draftStore = useDraftStore()
  const [text, setText] = useState(() => (block.content.text as string) ?? '')
  const kind = listKind(block)
  const marker = kind === 'numbered' ? `${block.order + 1}.` : '•'

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const value = event.target.value
    setText(value)
    draftStore.stage(pageId, block.id, { ...block.content, text: value, kind })
  }

  return (
    <div role="listitem">
      <span aria-hidden="true">{marker}</span>
      <input type="text" aria-label="List item text" value={text} onChange={handleChange} />
    </div>
  )
}

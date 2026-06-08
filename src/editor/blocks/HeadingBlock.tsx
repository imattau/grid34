import { useState } from 'react'
import { useDraftStore } from '../contexts/storeContexts'
import type { Block } from '../../storage/repo/types'
import type { BlockProps } from './ParagraphBlock'

const HEADING_TAGS = { 1: 'h1', 2: 'h2', 3: 'h3' } as const

function headingLevel(block: Block): 1 | 2 | 3 {
  const level = block.content.level
  return level === 1 || level === 2 || level === 3 ? level : 1
}

export function HeadingBlock({ block, pageId }: BlockProps) {
  const draftStore = useDraftStore()
  const [text, setText] = useState(() => (block.content.text as string) ?? '')
  const level = headingLevel(block)
  const Tag = HEADING_TAGS[level]

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const value = event.target.value
    setText(value)
    draftStore.stage(pageId, block.id, { ...block.content, text: value, level })
  }

  return (
    <Tag>
      <input type="text" aria-label={`Heading ${level} text`} value={text} onChange={handleChange} />
    </Tag>
  )
}

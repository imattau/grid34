import type { ComponentType } from 'react'
import { ParagraphBlock, type BlockProps } from './ParagraphBlock'
import { HeadingBlock } from './HeadingBlock'
import { ListBlock } from './ListBlock'
import { DatabaseBlock } from './DatabaseBlock'

export type BlockType = 'paragraph' | 'heading' | 'list' | 'database'

export type { BlockProps }

export const blockComponentRegistry: Record<BlockType, ComponentType<BlockProps>> = {
  paragraph: ParagraphBlock,
  heading: HeadingBlock,
  list: ListBlock,
  database: DatabaseBlock,
}

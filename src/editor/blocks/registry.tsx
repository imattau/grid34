import type { ComponentType } from 'react'
import { ParagraphBlock, type BlockProps } from './ParagraphBlock'
import { HeadingBlock } from './HeadingBlock'
import { ListBlock } from './ListBlock'
import { DatabaseBlock } from './DatabaseBlock'
import { DividerBlock } from './DividerBlock'
import { ImageBlock } from './ImageBlock'
import { TodoBlock } from './TodoBlock'
import { CalloutBlock } from './CalloutBlock'
import { CodeBlock } from './CodeBlock'

export type BlockType =
  | 'paragraph'
  | 'heading'
  | 'list'
  | 'database'
  | 'divider'
  | 'image'
  | 'todo'
  | 'callout'
  | 'code'

export type { BlockProps }

export const blockComponentRegistry: Record<BlockType, ComponentType<BlockProps>> = {
  paragraph: ParagraphBlock,
  heading: HeadingBlock,
  list: ListBlock,
  database: DatabaseBlock,
  divider: DividerBlock,
  image: ImageBlock,
  todo: TodoBlock,
  callout: CalloutBlock,
  code: CodeBlock,
}

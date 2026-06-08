import { describe, expect, it } from 'vitest'
import { blockComponentRegistry } from './registry'
import { ParagraphBlock } from './ParagraphBlock'
import { HeadingBlock } from './HeadingBlock'
import { ListBlock } from './ListBlock'
import { DatabaseBlock } from './DatabaseBlock'
import { DividerBlock } from './DividerBlock'
import { ImageBlock } from './ImageBlock'
import { TodoBlock } from './TodoBlock'
import { CalloutBlock } from './CalloutBlock'
import { CodeBlock } from './CodeBlock'

describe('blockComponentRegistry', () => {
  it('maps each v1 BlockType to its component', () => {
    expect(blockComponentRegistry.paragraph).toBe(ParagraphBlock)
    expect(blockComponentRegistry.heading).toBe(HeadingBlock)
    expect(blockComponentRegistry.list).toBe(ListBlock)
    expect(blockComponentRegistry.database).toBe(DatabaseBlock)
    expect(blockComponentRegistry.divider).toBe(DividerBlock)
    expect(blockComponentRegistry.image).toBe(ImageBlock)
    expect(blockComponentRegistry.todo).toBe(TodoBlock)
    expect(blockComponentRegistry.callout).toBe(CalloutBlock)
    expect(blockComponentRegistry.code).toBe(CodeBlock)
  })
})

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
import { TableBlock } from './TableBlock'
import { QuoteBlock } from './QuoteBlock'
import { ToggleBlock } from './ToggleBlock'
import { BookmarkBlock } from './BookmarkBlock'
import { RelationBlock } from './RelationBlock'
import { TemplateBlock } from './TemplateBlock'

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
    expect(blockComponentRegistry.table).toBe(TableBlock)
    expect(blockComponentRegistry.quote).toBe(QuoteBlock)
    expect(blockComponentRegistry.toggle).toBe(ToggleBlock)
    expect(blockComponentRegistry.bookmark).toBe(BookmarkBlock)
    expect(blockComponentRegistry.relation).toBe(RelationBlock)
    expect(blockComponentRegistry.template).toBe(TemplateBlock)
  })
})

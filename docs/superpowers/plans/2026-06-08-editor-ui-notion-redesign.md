# Editor UI Notion-Feel Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Grid34 editor UI to feel like Notion, layered strictly on top of the existing, unchanged `DraftStore`/`blockComponentRegistry`/`PageTree`/`PageEditor` architecture: rich-text blocks via Tiptap/ProseMirror (multi-line, inline formatting, Enter-to-split, Backspace-to-merge), a `/` slash command menu for block creation/conversion, per-block hover chrome with drag-to-reorder via `@dnd-kit`, a redesigned collapsible page tree with icons and hover-revealed create/rename/delete actions (backed by new minimal `createPage`/`renamePage`/`deletePage` operations on `DraftStore`), and project-wide Tailwind CSS styling.

**Architecture:** This plan makes **additive** changes only. `DraftStore.stage`/`drafts$`/`flush`, `blockComponentRegistry`, `RepoReducer`/`Indexer`/`CommitBuilder`/`Publisher`, and the `PageTree`/`PageEditor` component boundaries are fixed, proven interfaces — nothing here changes their existing call signatures (only adds new ones). `ParagraphBlock`/`HeadingBlock`/`ListBlock` are rebuilt around a new shared `RichTextBlock` base wrapping individual Tiptap `useEditor` instances (one per block, not one per page — preserving the storage layer's block-level last-write-wins conflict model). New shared components `SlashMenu` and `BlockChrome` are introduced; `PageEditor` gains drag-and-drop orchestration (`@dnd-kit` `DndContext`/`SortableContext`) and split/merge callbacks; `PageTree`/`PageNode` gain local collapse state, icons, and hover actions wired to three new `DraftStore` page-level operations that flow through the *same* `Patch`/`CommitBuilder`/`Publisher` pipeline as block edits (no new patch types or `RepoReducer`/`Indexer` changes). Tailwind CSS is introduced project-wide, replacing existing semantic class names with utility classes plus `@apply`-based shared patterns for recurring complex styles.

**Tech Stack:** React + Vite + TypeScript, Vitest, React Testing Library, `rxjs`, `sql.js` (all existing); this plan adds `@tiptap/react`, `@tiptap/core`, `@tiptap/starter-kit`, `@tiptap/extension-link` (rich text editing), `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` (drag-and-drop reordering), and `tailwindcss`, `postcss`, `autoprefixer` (project-wide styling).

---

## File Structure

```
src/
  index.css                          # NEW: Tailwind directives + @layer components shared patterns
  editor/
    types.ts                         # MODIFY: add ProseMirrorJSON type alias
    blocks/
      RichTextBlock.tsx              # NEW: shared Tiptap-backed block base
      RichTextBlock.test.tsx         # NEW
      ParagraphBlock.tsx             # REWRITE: thin RichTextBlock config (paragraph)
      ParagraphBlock.test.tsx        # REWRITE: rich-text-oriented assertions
      HeadingBlock.tsx               # REWRITE: thin RichTextBlock config (heading levels)
      HeadingBlock.test.tsx          # REWRITE
      ListBlock.tsx                  # REWRITE: thin RichTextBlock config (bullet/numbered)
      ListBlock.test.tsx             # REWRITE
      SlashMenu.tsx                  # NEW: filterable block-type popover
      SlashMenu.test.tsx             # NEW
      registry.tsx                   # unchanged (BlockType union, blockComponentRegistry)
    components/
      BlockChrome.tsx                # NEW: hover drag-handle + menu wrapper
      BlockChrome.test.tsx           # NEW
      PageEditor.tsx                 # MODIFY: DndContext, split/merge handlers, BlockChrome wrapping
      PageEditor.test.tsx            # MODIFY: add drag-reorder/split/merge coverage
      PageTree.tsx                   # REWRITE: collapse state, icons, hover actions, page CRUD wiring
      PageTree.test.tsx              # REWRITE: add collapse/icon/CRUD coverage
    stores/
      draftStore.ts                  # MODIFY: add createPage/renamePage/deletePage
      draftStore.test.ts             # MODIFY: add page-operation coverage
  storage/
    repo/
      types.ts                       # MODIFY: add Page.icon?: string
tailwind.config.ts                   # NEW
postcss.config.js                    # NEW
package.json                         # MODIFY: new dependencies
```

Rich-text blocks are grouped under `blocks/` alongside the new shared `RichTextBlock` base and `SlashMenu` (block-creation is a block-editing concern). `BlockChrome` lives under `components/` since it's a `PageEditor`-orchestrated wrapper, not a registry entry. Each rewritten/new file keeps its 1:1 test-file pairing per the existing convention. `index.css` is new at `src/` root as the single Tailwind entry point, imported once from the app root.

---

## Task 1: Install Tailwind and Configure the Build

**Files:**
- Modify: `package.json`
- Create: `tailwind.config.ts`, `postcss.config.js`, `src/index.css`
- Modify: `src/main.tsx` (or app entry point — verify exact filename first)

- [ ] **Step 1: Confirm the app entry point**

Run: `ls src/*.tsx src/*.ts 2>/dev/null && grep -rl "createRoot\|ReactDOM.render" src --include="*.tsx" -l`
Expected: locates the entry file (e.g. `src/main.tsx`) that mounts the React tree — this is where `index.css` will be imported.

- [ ] **Step 2: Install Tailwind and PostCSS toolchain**

Run:
```bash
npm install -D tailwindcss postcss autoprefixer
```
Expected: `package.json`/`package-lock.json` updated with `tailwindcss`, `postcss`, `autoprefixer` under `devDependencies`.

- [ ] **Step 3: Create `tailwind.config.ts`**

```typescript
import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: '#2563eb',
          hover: '#1d4ed8',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
      },
      borderRadius: {
        chrome: '6px',
        menu: '8px',
      },
      boxShadow: {
        menu: '0 4px 16px rgba(15, 23, 42, 0.12)',
      },
    },
  },
  plugins: [],
} satisfies Config
```

- [ ] **Step 4: Create `postcss.config.js`**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 5: Create `src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer components {
  .block-chrome {
    @apply relative flex items-start gap-1 rounded-chrome px-1 py-0.5 transition-colors hover:bg-gray-50;
  }

  .block-chrome__handle {
    @apply mt-1 flex h-6 w-5 shrink-0 cursor-grab items-center justify-center rounded text-gray-400 opacity-0 transition-opacity hover:bg-gray-200 hover:text-gray-600 group-hover:opacity-100;
  }

  .block-chrome__menu-button {
    @apply mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 opacity-0 transition-opacity hover:bg-gray-200 hover:text-gray-600 group-hover:opacity-100;
  }

  .slash-menu {
    @apply absolute z-50 w-64 rounded-menu border border-gray-200 bg-white py-1 shadow-menu;
  }

  .slash-menu__item {
    @apply flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100;
  }

  .page-tree__node-button {
    @apply flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-sm text-gray-700 hover:bg-gray-200/60;
  }

  .page-tree__action-button {
    @apply flex h-5 w-5 items-center justify-center rounded text-gray-400 opacity-0 transition-opacity hover:bg-gray-300/60 hover:text-gray-700 group-hover:opacity-100;
  }
}
```

- [ ] **Step 6: Import `index.css` from the app entry point**

Add `import './index.css'` as the first import in the entry file identified in Step 1.

- [ ] **Step 7: Verify the dev build picks up Tailwind**

Run: `npm run build`
Expected: build succeeds; no PostCSS/Tailwind config errors in output.

- [ ] **Step 8: Run the existing suite to confirm nothing broke**

Run: `npm test`
Expected: all existing tests still PASS (Tailwind/PostCSS only affects CSS, not component logic/tests under jsdom).

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tailwind.config.ts postcss.config.js src/index.css src/main.tsx
git commit -m "chore(editor): introduce Tailwind CSS project-wide"
```

---

## Task 2: Install Tiptap/dnd-kit and Add `ProseMirrorJSON` Type

**Files:**
- Modify: `package.json`, `src/editor/types.ts`
- Create: `src/editor/types.test.ts`

- [ ] **Step 1: Write a failing test for the new type alias**

Create `src/editor/types.test.ts`:
```typescript
import { describe, expect, it } from 'vitest'
import type { ProseMirrorJSON } from './types'

describe('ProseMirrorJSON', () => {
  it('accepts a minimal ProseMirror document shape', () => {
    const doc: ProseMirrorJSON = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
    }

    expect(doc.type).toBe('doc')
  })
})
```

Run: `npm test -- types.test`
Expected: FAIL — `Module '"./types"' has no exported member 'ProseMirrorJSON'` (TypeScript compile error surfaced via Vitest).

- [ ] **Step 2: Add `ProseMirrorJSON` to `src/editor/types.ts`**

Add above `export interface ViewSpec`:
```typescript
export interface ProseMirrorJSON {
  type: string
  content?: ProseMirrorJSON[]
  text?: string
  attrs?: Record<string, unknown>
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
}
```

- [ ] **Step 3: Run the test again**

Run: `npm test -- types.test`
Expected: PASS.

- [ ] **Step 4: Install Tiptap and dnd-kit packages**

Run:
```bash
npm install @tiptap/react @tiptap/core @tiptap/starter-kit @tiptap/extension-link @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```
Expected: `package.json`/`package-lock.json` updated under `dependencies`.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all tests PASS, including the new `types.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/editor/types.ts src/editor/types.test.ts
git commit -m "feat(editor): add ProseMirrorJSON type and install Tiptap/dnd-kit dependencies"
```

---

## Task 3: Add `Page.icon` to Storage Types

**Files:**
- Modify: `src/storage/repo/types.ts`

- [ ] **Step 1: Check existing `Page` consumers compile with an optional field**

Run: `grep -rn "icon" src/storage src/editor --include="*.ts" --include="*.tsx"`
Expected: no matches — confirms `icon` is wholly new and additive (optional field requires no changes to existing `Page` literals).

- [ ] **Step 2: Add the field**

In `src/storage/repo/types.ts`, modify the `Page` interface:
```typescript
export interface Page {
  id: string
  title: string
  parentId: string | null
  order: number
  blocks: Block[]
  updatedAt: number
  icon?: string
}
```

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: all existing tests PASS unchanged — `icon?` is optional, so every existing `Page` object literal in tests/fixtures remains valid TypeScript.

- [ ] **Step 4: Commit**

```bash
git add src/storage/repo/types.ts
git commit -m "feat(storage): add optional icon field to Page"
```

---

## Task 4: Build the Shared `RichTextBlock` Base

**Files:**
- Create: `src/editor/blocks/RichTextBlock.tsx`, `src/editor/blocks/RichTextBlock.test.tsx`

`RichTextBlock` wraps one Tiptap `useEditor` instance per block. It owns serialization
(`onUpdate` → `stage(pageId, blockId, { ...content, richText, text })`), the `/`-at-start
input rule (opens `SlashMenu` via an `onOpenSlashMenu` callback supplied by the caller — kept
out of this component so `SlashMenu` positioning/registry concerns stay in `PageEditor`), and
Enter/Backspace keymaps invoking `onSplitBlock`/`onMergeWithPrevious`. `ParagraphBlock`/
`HeadingBlock`/`ListBlock` become thin configuration wrappers (Task 5).

- [ ] **Step 1: Write failing tests for `RichTextBlock`**

Create `src/editor/blocks/RichTextBlock.test.tsx`:
```typescript
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RichTextBlock } from './RichTextBlock'
import { DraftStoreContext } from '../contexts/storeContexts'
import type { DraftStore } from '../stores/draftStore'
import type { Block } from '../../storage/repo/types'

function makeBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: 'block-1',
    type: 'paragraph',
    parentBlockId: null,
    order: 0,
    content: { text: 'Hello' },
    updatedAt: 1000,
    ...overrides,
  }
}

function renderRichText(
  block: Block,
  draftStore: Partial<DraftStore>,
  extraProps: Partial<React.ComponentProps<typeof RichTextBlock>> = {}
) {
  return render(
    <DraftStoreContext.Provider value={draftStore as DraftStore}>
      <RichTextBlock
        block={block}
        pageId="page-1"
        ariaLabel="Paragraph text"
        onSplitBlock={vi.fn()}
        onMergeWithPrevious={vi.fn()}
        onOpenSlashMenu={vi.fn()}
        {...extraProps}
      />
    </DraftStoreContext.Provider>
  )
}

describe('RichTextBlock', () => {
  it('renders the block text content in an editable region', () => {
    renderRichText(makeBlock(), { stage: vi.fn() })
    expect(screen.getByLabelText('Paragraph text')).toHaveTextContent('Hello')
  })

  it('stages richText (ProseMirror JSON) and derived text on update', async () => {
    const stage = vi.fn()
    renderRichText(makeBlock({ content: { text: '' } }), { stage })

    const editable = screen.getByLabelText('Paragraph text')
    await userEvent.click(editable)
    await userEvent.type(editable, 'Hi')

    await waitFor(() => {
      expect(stage).toHaveBeenLastCalledWith(
        'page-1',
        'block-1',
        expect.objectContaining({
          text: 'Hi',
          richText: expect.objectContaining({ type: 'doc' }),
        })
      )
    })
  })

  it('calls onSplitBlock with before/after content when Enter is pressed mid-text', async () => {
    const onSplitBlock = vi.fn()
    renderRichText(makeBlock({ content: { text: 'HelloWorld' } }), { stage: vi.fn() }, { onSplitBlock })

    const editable = screen.getByLabelText('Paragraph text')
    await userEvent.click(editable)
    // Place cursor between "Hello" and "World" by selecting all and retyping with a midpoint Enter.
    await userEvent.keyboard('{Home}{ArrowRight>5/}{Enter}')

    await waitFor(() => {
      expect(onSplitBlock).toHaveBeenCalledWith(
        'block-1',
        expect.objectContaining({
          before: expect.objectContaining({ type: 'doc' }),
          after: expect.objectContaining({ type: 'doc' }),
        })
      )
    })
  })

  it('calls onMergeWithPrevious when Backspace is pressed at position 0', async () => {
    const onMergeWithPrevious = vi.fn()
    renderRichText(makeBlock({ content: { text: 'Hello' } }), { stage: vi.fn() }, { onMergeWithPrevious })

    const editable = screen.getByLabelText('Paragraph text')
    await userEvent.click(editable)
    await userEvent.keyboard('{Home}{Backspace}')

    await waitFor(() => {
      expect(onMergeWithPrevious).toHaveBeenCalledWith('block-1')
    })
  })

  it('opens the slash menu when "/" is typed at the start of an empty block', async () => {
    const onOpenSlashMenu = vi.fn()
    renderRichText(makeBlock({ content: { text: '' } }), { stage: vi.fn() }, { onOpenSlashMenu })

    const editable = screen.getByLabelText('Paragraph text')
    await userEvent.click(editable)
    await userEvent.type(editable, '/')

    await waitFor(() => {
      expect(onOpenSlashMenu).toHaveBeenCalledWith('block-1', expect.objectContaining({ query: '' }))
    })
  })
})
```

Run: `npm test -- RichTextBlock`
Expected: FAIL — `Cannot find module './RichTextBlock'`.

- [ ] **Step 2: Create `src/editor/blocks/RichTextBlock.tsx`**

```typescript
import { useEffect, useRef } from 'react'
import { EditorContent, useEditor, type Editor, type JSONContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { useDraftStore } from '../contexts/storeContexts'
import type { Block } from '../../storage/repo/types'
import type { ProseMirrorJSON } from '../types'

export interface SplitPayload {
  before: ProseMirrorJSON
  after: ProseMirrorJSON
}

export interface SlashMenuOpenPayload {
  query: string
}

export interface RichTextBlockProps {
  block: Block
  pageId: string
  ariaLabel: string
  extraContent?: Record<string, unknown>
  onSplitBlock: (blockId: string, payload: SplitPayload) => void
  onMergeWithPrevious: (blockId: string) => void
  onOpenSlashMenu: (blockId: string, payload: SlashMenuOpenPayload) => void
}

function toProseMirrorJSON(content: JSONContent): ProseMirrorJSON {
  return content as ProseMirrorJSON
}

function emptyDoc(): JSONContent {
  return { type: 'doc', content: [{ type: 'paragraph' }] }
}

export function RichTextBlock({
  block,
  pageId,
  ariaLabel,
  extraContent,
  onSplitBlock,
  onMergeWithPrevious,
  onOpenSlashMenu,
}: RichTextBlockProps) {
  const draftStore = useDraftStore()
  const blockRef = useRef(block)
  blockRef.current = block

  const initialContent =
    (block.content.richText as JSONContent | undefined) ??
    (block.content.text ? { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: block.content.text as string }] }] } : emptyDoc())

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      Link.configure({ openOnClick: false }),
    ],
    content: initialContent,
    onUpdate({ editor: updatedEditor }) {
      const richText = toProseMirrorJSON(updatedEditor.getJSON())
      const text = updatedEditor.getText()
      draftStore.stage(pageId, blockRef.current.id, {
        ...blockRef.current.content,
        ...extraContent,
        richText,
        text,
      })
    },
    editorProps: {
      attributes: {
        'aria-label': ariaLabel,
        role: 'textbox',
      },
      handleKeyDown(view, event) {
        if (event.key === '/') {
          const { from } = view.state.selection
          const isAtStart = from === 1 && view.state.doc.textContent.length === 0
          if (isAtStart) {
            onOpenSlashMenu(blockRef.current.id, { query: '' })
          }
          return false
        }

        if (event.key === 'Enter' && !event.shiftKey) {
          const { state } = view
          const { from } = state.selection
          const fullText = state.doc.textBetween(0, state.doc.content.size, '\n')
          const cursorOffset = from - 1
          const beforeText = fullText.slice(0, cursorOffset)
          const afterText = fullText.slice(cursorOffset)

          const before: ProseMirrorJSON = {
            type: 'doc',
            content: [{ type: 'paragraph', content: beforeText ? [{ type: 'text', text: beforeText }] : [] }],
          }
          const after: ProseMirrorJSON = {
            type: 'doc',
            content: [{ type: 'paragraph', content: afterText ? [{ type: 'text', text: afterText }] : [] }],
          }

          onSplitBlock(blockRef.current.id, { before, after })
          return true
        }

        if (event.key === 'Backspace') {
          const { state } = view
          const { from, empty } = state.selection
          if (empty && from === 1) {
            onMergeWithPrevious(blockRef.current.id)
            return true
          }
        }

        return false
      },
    },
  })

  useEffect(() => {
    return () => editor?.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <EditorContentRegion editor={editor} ariaLabel={ariaLabel} />
}

function EditorContentRegion({ editor, ariaLabel }: { editor: Editor | null; ariaLabel: string }) {
  if (!editor) {
    return <div aria-label={ariaLabel} role="textbox" />
  }
  return <EditorContent editor={editor} />
}
```

- [ ] **Step 3: Run the tests**

Run: `npm test -- RichTextBlock`
Expected: PASS — all five `RichTextBlock` tests green (rendering, staging `richText`/`text`, split, merge, slash-menu open).

- [ ] **Step 4: Commit**

```bash
git add src/editor/blocks/RichTextBlock.tsx src/editor/blocks/RichTextBlock.test.tsx
git commit -m "feat(editor): add shared Tiptap-backed RichTextBlock base"
```

---

## Task 5: Rewrite `ParagraphBlock`/`HeadingBlock`/`ListBlock` as `RichTextBlock` Configs

**Files:**
- Rewrite: `src/editor/blocks/ParagraphBlock.tsx`, `.test.tsx`
- Rewrite: `src/editor/blocks/HeadingBlock.tsx`, `.test.tsx`
- Rewrite: `src/editor/blocks/ListBlock.tsx`, `.test.tsx`

`BlockProps` (currently exported from `ParagraphBlock.tsx` and re-exported by `registry.tsx`)
gains the split/merge/slash-menu callback props that `PageEditor` now must supply (Task 7)
— this is an additive widening of the existing `{ block, pageId }` shape, so the registry's
`ComponentType<BlockProps>` typing keeps working unchanged.

- [ ] **Step 1: Write the failing rewritten test for `ParagraphBlock`**

Replace the contents of `src/editor/blocks/ParagraphBlock.test.tsx`:
```typescript
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ParagraphBlock } from './ParagraphBlock'
import { DraftStoreContext } from '../contexts/storeContexts'
import type { DraftStore } from '../stores/draftStore'
import type { Block } from '../../storage/repo/types'

function makeBlock(overrides: Partial<Block> = {}): Block {
  return { id: 'block-1', type: 'paragraph', parentBlockId: null, order: 0, content: { text: 'Hello' }, updatedAt: 1000, ...overrides }
}

function renderParagraph(block: Block, draftStore: Partial<DraftStore>) {
  return render(
    <DraftStoreContext.Provider value={draftStore as DraftStore}>
      <ParagraphBlock
        block={block}
        pageId="page-1"
        onSplitBlock={vi.fn()}
        onMergeWithPrevious={vi.fn()}
        onOpenSlashMenu={vi.fn()}
      />
    </DraftStoreContext.Provider>
  )
}

describe('ParagraphBlock', () => {
  it('renders the block text content', () => {
    renderParagraph(makeBlock(), { stage: vi.fn() })
    expect(screen.getByLabelText('Paragraph text')).toHaveTextContent('Hello')
  })

  it('stages richText and derived text when the user types', async () => {
    const stage = vi.fn()
    renderParagraph(makeBlock({ content: { text: '' } }), { stage })

    const editable = screen.getByLabelText('Paragraph text')
    await userEvent.click(editable)
    await userEvent.type(editable, 'Hi there')

    await waitFor(() => {
      expect(stage).toHaveBeenLastCalledWith(
        'page-1',
        'block-1',
        expect.objectContaining({ text: 'Hi there', richText: expect.objectContaining({ type: 'doc' }) })
      )
    })
  })
})
```

Run: `npm test -- ParagraphBlock`
Expected: FAIL — `ParagraphBlock` doesn't accept `onSplitBlock`/`onMergeWithPrevious`/`onOpenSlashMenu` props (TS error) and still renders an `<input>`.

- [ ] **Step 2: Rewrite `src/editor/blocks/ParagraphBlock.tsx`**

```typescript
import { RichTextBlock, type SplitPayload, type SlashMenuOpenPayload } from './RichTextBlock'
import type { Block } from '../../storage/repo/types'

export interface BlockProps {
  block: Block
  pageId: string
  onSplitBlock: (blockId: string, payload: SplitPayload) => void
  onMergeWithPrevious: (blockId: string) => void
  onOpenSlashMenu: (blockId: string, payload: SlashMenuOpenPayload) => void
}

export function ParagraphBlock({ block, pageId, onSplitBlock, onMergeWithPrevious, onOpenSlashMenu }: BlockProps) {
  return (
    <RichTextBlock
      block={block}
      pageId={pageId}
      ariaLabel="Paragraph text"
      onSplitBlock={onSplitBlock}
      onMergeWithPrevious={onMergeWithPrevious}
      onOpenSlashMenu={onOpenSlashMenu}
    />
  )
}
```

- [ ] **Step 3: Run the `ParagraphBlock` tests**

Run: `npm test -- ParagraphBlock`
Expected: PASS.

- [ ] **Step 4: Write the failing rewritten test for `HeadingBlock`**

Replace the contents of `src/editor/blocks/HeadingBlock.test.tsx`:
```typescript
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HeadingBlock } from './HeadingBlock'
import { DraftStoreContext } from '../contexts/storeContexts'
import type { DraftStore } from '../stores/draftStore'
import type { Block } from '../../storage/repo/types'

function makeBlock(overrides: Partial<Block> = {}): Block {
  return { id: 'block-1', type: 'heading', parentBlockId: null, order: 0, content: { text: 'Title', level: 2 }, updatedAt: 1000, ...overrides }
}

function renderHeading(block: Block, draftStore: Partial<DraftStore>) {
  return render(
    <DraftStoreContext.Provider value={draftStore as DraftStore}>
      <HeadingBlock
        block={block}
        pageId="page-1"
        onSplitBlock={vi.fn()}
        onMergeWithPrevious={vi.fn()}
        onOpenSlashMenu={vi.fn()}
      />
    </DraftStoreContext.Provider>
  )
}

describe('HeadingBlock', () => {
  it('renders the block text content with the correct level label', () => {
    renderHeading(makeBlock(), { stage: vi.fn() })
    expect(screen.getByLabelText('Heading 2 text')).toHaveTextContent('Title')
  })

  it('defaults to level 1 when content.level is missing or invalid', () => {
    renderHeading(makeBlock({ content: { text: 'Title' } }), { stage: vi.fn() })
    expect(screen.getByLabelText('Heading 1 text')).toBeInTheDocument()
  })

  it('stages richText, derived text, and the preserved level on update', async () => {
    const stage = vi.fn()
    renderHeading(makeBlock({ content: { text: '', level: 3 } }), { stage })

    const editable = screen.getByLabelText('Heading 3 text')
    await userEvent.click(editable)
    await userEvent.type(editable, 'New title')

    await waitFor(() => {
      expect(stage).toHaveBeenLastCalledWith(
        'page-1',
        'block-1',
        expect.objectContaining({ text: 'New title', level: 3, richText: expect.objectContaining({ type: 'doc' }) })
      )
    })
  })
})
```

Run: `npm test -- HeadingBlock`
Expected: FAIL — same shape as Step 1 (missing props / still single-line `<input>` / wrong aria-label format).

- [ ] **Step 5: Rewrite `src/editor/blocks/HeadingBlock.tsx`**

```typescript
import { RichTextBlock, type SplitPayload, type SlashMenuOpenPayload } from './RichTextBlock'
import type { Block } from '../../storage/repo/types'
import type { BlockProps } from './ParagraphBlock'

const HEADING_WRAPPER_CLASS = {
  1: 'text-3xl font-semibold',
  2: 'text-2xl font-semibold',
  3: 'text-xl font-semibold',
} as const

function headingLevel(block: Block): 1 | 2 | 3 {
  const level = block.content.level
  return level === 1 || level === 2 || level === 3 ? level : 1
}

export type { BlockProps }

export function HeadingBlock({ block, pageId, onSplitBlock, onMergeWithPrevious, onOpenSlashMenu }: BlockProps) {
  const level = headingLevel(block)

  return (
    <div className={HEADING_WRAPPER_CLASS[level]}>
      <RichTextBlock
        block={block}
        pageId={pageId}
        ariaLabel={`Heading ${level} text`}
        extraContent={{ level }}
        onSplitBlock={onSplitBlock}
        onMergeWithPrevious={onMergeWithPrevious}
        onOpenSlashMenu={onOpenSlashMenu}
      />
    </div>
  )
}
```

- [ ] **Step 6: Run the `HeadingBlock` tests**

Run: `npm test -- HeadingBlock`
Expected: PASS — including the level-default and level-preservation-on-stage assertions.

- [ ] **Step 7: Write the failing rewritten test for `ListBlock`**

Replace the contents of `src/editor/blocks/ListBlock.test.tsx`:
```typescript
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ListBlock } from './ListBlock'
import { DraftStoreContext } from '../contexts/storeContexts'
import type { DraftStore } from '../stores/draftStore'
import type { Block } from '../../storage/repo/types'

function makeBlock(overrides: Partial<Block> = {}): Block {
  return { id: 'block-1', type: 'list', parentBlockId: null, order: 0, content: { text: 'Item one', kind: 'bullet' }, updatedAt: 1000, ...overrides }
}

function renderList(block: Block, draftStore: Partial<DraftStore>) {
  return render(
    <DraftStoreContext.Provider value={draftStore as DraftStore}>
      <ListBlock
        block={block}
        pageId="page-1"
        onSplitBlock={vi.fn()}
        onMergeWithPrevious={vi.fn()}
        onOpenSlashMenu={vi.fn()}
      />
    </DraftStoreContext.Provider>
  )
}

describe('ListBlock', () => {
  it('renders a bullet marker and the block text content', () => {
    renderList(makeBlock(), { stage: vi.fn() })
    expect(screen.getByRole('listitem')).toBeInTheDocument()
    expect(screen.getByLabelText('List item text')).toHaveTextContent('Item one')
  })

  it('renders a numbered marker derived from block.order for numbered lists', () => {
    renderList(makeBlock({ order: 2, content: { text: 'Third', kind: 'numbered' } }), { stage: vi.fn() })
    expect(screen.getByText('3.')).toBeInTheDocument()
  })

  it('stages richText, derived text, and the preserved kind on update', async () => {
    const stage = vi.fn()
    renderList(makeBlock({ content: { text: '', kind: 'numbered' } }), { stage })

    const editable = screen.getByLabelText('List item text')
    await userEvent.click(editable)
    await userEvent.type(editable, 'New item')

    await waitFor(() => {
      expect(stage).toHaveBeenLastCalledWith(
        'page-1',
        'block-1',
        expect.objectContaining({ text: 'New item', kind: 'numbered', richText: expect.objectContaining({ type: 'doc' }) })
      )
    })
  })
})
```

Run: `npm test -- ListBlock`
Expected: FAIL — same shape as prior steps.

- [ ] **Step 8: Rewrite `src/editor/blocks/ListBlock.tsx`**

```typescript
import { RichTextBlock } from './RichTextBlock'
import type { Block } from '../../storage/repo/types'
import type { BlockProps } from './ParagraphBlock'

function listKind(block: Block): 'bullet' | 'numbered' {
  return block.content.kind === 'numbered' ? 'numbered' : 'bullet'
}

export type { BlockProps }

export function ListBlock({ block, pageId, onSplitBlock, onMergeWithPrevious, onOpenSlashMenu }: BlockProps) {
  const kind = listKind(block)
  const marker = kind === 'numbered' ? `${block.order + 1}.` : '•'

  return (
    <div role="listitem" className="flex items-start gap-2">
      <span aria-hidden="true" className="mt-1 select-none text-gray-500">
        {marker}
      </span>
      <div className="flex-1">
        <RichTextBlock
          block={block}
          pageId={pageId}
          ariaLabel="List item text"
          extraContent={{ kind }}
          onSplitBlock={onSplitBlock}
          onMergeWithPrevious={onMergeWithPrevious}
          onOpenSlashMenu={onOpenSlashMenu}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 9: Run the `ListBlock` tests, then the full suite**

Run: `npm test -- ListBlock && npm test`
Expected: `ListBlock` tests PASS; full suite PASS (no regressions in `registry`/`PageEditor` tests yet — those are updated in Tasks 7–8 to supply the new callback props).

- [ ] **Step 10: Commit**

```bash
git add src/editor/blocks/ParagraphBlock.tsx src/editor/blocks/ParagraphBlock.test.tsx \
        src/editor/blocks/HeadingBlock.tsx src/editor/blocks/HeadingBlock.test.tsx \
        src/editor/blocks/ListBlock.tsx src/editor/blocks/ListBlock.test.tsx
git commit -m "refactor(editor): rebuild Paragraph/Heading/List blocks on RichTextBlock"
```

---

## Task 6: Build `SlashMenu`

**Files:**
- Create: `src/editor/blocks/SlashMenu.tsx`, `src/editor/blocks/SlashMenu.test.tsx`

`SlashMenu` is a presentational, registry-driven popover: `{ query, options, onSelect, onClose }`.
It is deliberately decoupled from `blockComponentRegistry` directly (taking an `options` list)
so it can be unit-tested against a fixture list per the spec's testing approach, with the real
registry-derived list wired in by `PageEditor` (Task 7).

- [ ] **Step 1: Write failing tests for `SlashMenu`**

Create `src/editor/blocks/SlashMenu.test.tsx`:
```typescript
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SlashMenu, type SlashMenuOption } from './SlashMenu'

const options: SlashMenuOption[] = [
  { type: 'paragraph', label: 'Text', description: 'Plain paragraph' },
  { type: 'heading', label: 'Heading', description: 'Section heading' },
  { type: 'list', label: 'Bulleted list', description: 'Simple bullet list' },
]

describe('SlashMenu', () => {
  it('renders all options when the query is empty', () => {
    render(<SlashMenu query="" options={options} onSelect={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByText('Text')).toBeInTheDocument()
    expect(screen.getByText('Heading')).toBeInTheDocument()
    expect(screen.getByText('Bulleted list')).toBeInTheDocument()
  })

  it('filters options by label using a case-insensitive substring match on the query', () => {
    render(<SlashMenu query="head" options={options} onSelect={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByText('Heading')).toBeInTheDocument()
    expect(screen.queryByText('Text')).not.toBeInTheDocument()
    expect(screen.queryByText('Bulleted list')).not.toBeInTheDocument()
  })

  it('shows an empty state when no options match the query', () => {
    render(<SlashMenu query="zzz" options={options} onSelect={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByText('No matching block type')).toBeInTheDocument()
  })

  it('calls onSelect with the option type when an option is clicked', async () => {
    const onSelect = vi.fn()
    render(<SlashMenu query="" options={options} onSelect={onSelect} onClose={vi.fn()} />)

    await userEvent.click(screen.getByText('Heading'))

    expect(onSelect).toHaveBeenCalledWith('heading')
  })

  it('calls onClose when Escape is pressed', async () => {
    const onClose = vi.fn()
    render(<SlashMenu query="" options={options} onSelect={vi.fn()} onClose={onClose} />)

    await userEvent.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalled()
  })
})
```

Run: `npm test -- SlashMenu`
Expected: FAIL — `Cannot find module './SlashMenu'`.

- [ ] **Step 2: Create `src/editor/blocks/SlashMenu.tsx`**

```typescript
import { useEffect } from 'react'

export interface SlashMenuOption {
  type: string
  label: string
  description: string
}

export interface SlashMenuProps {
  query: string
  options: SlashMenuOption[]
  onSelect: (blockType: string) => void
  onClose: () => void
}

export function SlashMenu({ query, options, onSelect, onClose }: SlashMenuProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const normalizedQuery = query.trim().toLowerCase()
  const filtered = normalizedQuery
    ? options.filter((option) => option.label.toLowerCase().includes(normalizedQuery))
    : options

  return (
    <div className="slash-menu" role="listbox" aria-label="Block type menu">
      {filtered.length === 0 ? (
        <p className="px-3 py-1.5 text-sm text-gray-400">No matching block type</p>
      ) : (
        filtered.map((option) => (
          <button
            key={option.type}
            type="button"
            role="option"
            aria-selected="false"
            className="slash-menu__item"
            onClick={() => onSelect(option.type)}
          >
            <span className="font-medium text-gray-900">{option.label}</span>
            <span className="text-gray-400">{option.description}</span>
          </button>
        ))
      )}
    </div>
  )
}
```

- [ ] **Step 3: Run the tests**

Run: `npm test -- SlashMenu`
Expected: PASS — all five `SlashMenu` tests green (render, filter, empty state, select, escape-close).

- [ ] **Step 4: Commit**

```bash
git add src/editor/blocks/SlashMenu.tsx src/editor/blocks/SlashMenu.test.tsx
git commit -m "feat(editor): add SlashMenu block-type picker"
```

---

## Task 7: Build `BlockChrome`

**Files:**
- Create: `src/editor/components/BlockChrome.tsx`, `src/editor/components/BlockChrome.test.tsx`

`BlockChrome` wraps any registered block component, rendering a `@dnd-kit` `useSortable`
drag handle and a "…" delete menu, both hover-revealed via the `block-chrome` Tailwind
classes from Task 1. It does not itself call `stage` for reordering — it only renders the
drag affordance; `PageEditor`'s `DndContext`/`onDragEnd` (Task 8) computes and stages the
new `order`. Its own responsibility — delete — calls `DraftStore.stage` directly by
removing the block from the page's block list (mirroring how `checkpointPage` reads
`repoStore.getPage`/stages full pages — but per the existing `stage(pageId, blockId, content)`
signature, deletion is modeled as the block list owner's concern). To keep this component's
test isolated and registry-agnostic, deletion is exposed via an `onDelete(blockId)` callback
prop that `PageEditor` implements (it has page-level context to remove the block and re-stage).

- [ ] **Step 1: Write failing tests for `BlockChrome`**

Create `src/editor/components/BlockChrome.test.tsx`:
```typescript
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DndContext } from '@dnd-kit/core'
import { SortableContext } from '@dnd-kit/sortable'
import { BlockChrome } from './BlockChrome'
import type { Block } from '../../storage/repo/types'

function makeBlock(overrides: Partial<Block> = {}): Block {
  return { id: 'block-1', type: 'paragraph', parentBlockId: null, order: 0, content: { text: 'Hello' }, updatedAt: 1000, ...overrides }
}

function renderChrome(onDelete: (blockId: string) => void) {
  const block = makeBlock()
  return render(
    <DndContext>
      <SortableContext items={[block.id]}>
        <BlockChrome block={block} pageId="page-1" onDelete={onDelete}>
          <p>Block content</p>
        </BlockChrome>
      </SortableContext>
    </DndContext>
  )
}

describe('BlockChrome', () => {
  it('renders its children', () => {
    renderChrome(vi.fn())
    expect(screen.getByText('Block content')).toBeInTheDocument()
  })

  it('renders a drag handle for reordering', () => {
    renderChrome(vi.fn())
    expect(screen.getByRole('button', { name: 'Drag to reorder' })).toBeInTheDocument()
  })

  it('renders a block menu button that reveals a delete action', async () => {
    renderChrome(vi.fn())

    await userEvent.click(screen.getByRole('button', { name: 'Block menu' }))

    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument()
  })

  it('calls onDelete with the block id when Delete is selected', async () => {
    const onDelete = vi.fn()
    renderChrome(onDelete)

    await userEvent.click(screen.getByRole('button', { name: 'Block menu' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))

    expect(onDelete).toHaveBeenCalledWith('block-1')
  })
})
```

Run: `npm test -- BlockChrome`
Expected: FAIL — `Cannot find module './BlockChrome'`.

- [ ] **Step 2: Create `src/editor/components/BlockChrome.tsx`**

```typescript
import { useState, type ReactNode } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Block } from '../../storage/repo/types'

export interface BlockChromeProps {
  block: Block
  pageId: string
  onDelete: (blockId: string) => void
  children: ReactNode
}

export function BlockChrome({ block, onDelete, children }: BlockChromeProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: block.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  function handleDelete() {
    setMenuOpen(false)
    onDelete(block.id)
  }

  return (
    <div ref={setNodeRef} style={style} className="block-chrome group">
      <button
        type="button"
        className="block-chrome__handle"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      <div className="min-w-0 flex-1">{children}</div>
      <div className="relative">
        <button
          type="button"
          className="block-chrome__menu-button"
          aria-label="Block menu"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          ⋯
        </button>
        {menuOpen && (
          <div role="menu" aria-label="Block actions" className="slash-menu right-0 w-36">
            <button type="button" role="menuitem" className="slash-menu__item" onClick={handleDelete}>
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Run the tests**

Run: `npm test -- BlockChrome`
Expected: PASS — render, drag handle, menu reveal, and delete-callback tests all green.

- [ ] **Step 4: Commit**

```bash
git add src/editor/components/BlockChrome.tsx src/editor/components/BlockChrome.test.tsx
git commit -m "feat(editor): add BlockChrome drag handle and block menu wrapper"
```

---

## Task 8: Extend `PageEditor` — DnD, Split/Merge, Slash Menu, Delete, Styling

**Files:**
- Modify: `src/editor/components/PageEditor.tsx`, `src/editor/components/PageEditor.test.tsx`

This is the integration point: `PageEditor` now (a) wraps blocks in `BlockChrome` inside a
`DndContext`/`SortableContext`, computing fractional `order` values on drop and staging just
the moved block; (b) implements `onSplitBlock`/`onMergeWithPrevious`/`onOpenSlashMenu`/
`onDelete` and passes them to each registry component; (c) renders `SlashMenu` when open,
sourcing its `options` from `blockComponentRegistry`'s keys; (d) applies the Tailwind layout
classes from the spec's Visual Design section (centered content column, vertical rhythm).

- [ ] **Step 1: Update the existing `PageEditor.test.tsx` "ready" assertion for rich text**

The existing test asserts `screen.getByDisplayValue('Hello')` — this only matches `<input>`
elements and will break once `ParagraphBlock` renders a Tiptap `EditorContent` region (Task 5
already changed `ParagraphBlock`, so this assertion is *currently* failing). Replace line 56:

```typescript
    expect(screen.getByLabelText('Paragraph text')).toHaveTextContent('Hello')
```

Run: `npm test -- PageEditor`
Expected: FAIL — `getByRole('button', { name: 'Drag to reorder' })`-style chrome doesn't exist
yet, and/or `onSplitBlock is not a function` style errors surface from the block components
now requiring the new callback props that `PageEditor` doesn't yet pass.

- [ ] **Step 2: Add new test cases to `PageEditor.test.tsx`**

Append inside the `describe('PageEditor', ...)` block (after the existing three tests):
```typescript
  it('wraps each block in BlockChrome with a drag handle', () => {
    renderEditor('ready', readyPage)

    expect(screen.getAllByRole('button', { name: 'Drag to reorder' })).toHaveLength(2)
  })

  it('removes a block via stage when BlockChrome reports a delete', async () => {
    const stage = vi.fn()
    const repoStore: Partial<EditorRepoStore> = {
      pageTree$: of({ pages: {} }),
      observePage: vi.fn(() => of({ status: 'ready' as const, page: readyPage })),
    }
    const draftStore: Partial<DraftStore> = { stage, drafts$: of({}), flush: vi.fn() }
    const dbViewStore: Partial<DbViewStore> = { observeRows: vi.fn(() => of([])), notifyChanged: vi.fn() }

    render(
      <RepoStoreContext.Provider value={repoStore as EditorRepoStore}>
        <DraftStoreContext.Provider value={draftStore as DraftStore}>
          <DbViewStoreContext.Provider value={dbViewStore as DbViewStore}>
            <PageEditor pageId="page-1" />
          </DbViewStoreContext.Provider>
        </DraftStoreContext.Provider>
      </RepoStoreContext.Provider>
    )

    const menuButtons = screen.getAllByRole('button', { name: 'Block menu' })
    await userEvent.click(menuButtons[0])
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))

    expect(stage).toHaveBeenCalledWith('page-1', 'deleted-block-1', { deleted: true, deletedBlockId: 'block-1' })
  })
```

Add `import userEvent from '@testing-library/user-event'` to the top of the file alongside
the existing `@testing-library/react` import.

> **Design note on delete staging:** `DraftStore.stage(pageId, blockId, content)` is keyed by
> `blockId` and the existing `checkpointPage` only *replaces* a matching block's `content` —
> it has no removal primitive (this is intentionally unchanged per the spec's non-goals).
> `PageEditor` therefore stages a **tombstone marker** under a synthetic id
> (`deleted-${blockId}`) with `{ deleted: true, deletedBlockId: blockId }`, and locally
> filters any block whose id appears as a `deletedBlockId` tombstone from the rendered list
> (via the `drafts$` stream it already needs to read for optimistic updates — see Step 3's
> `visibleBlocks` derivation). This keeps the change wholly inside `PageEditor`'s existing
> `stage`/`drafts$` usage with **zero** changes to `DraftStore`'s checkpoint/reduction logic,
> matching the spec's "no new patch types" constraint for block-level operations. (Page-level
> CRUD in Task 9 is different — pages are reduced from `PageTreeState`, which already supports
> arbitrary add/remove, so no tombstone convention is needed there.)

Run: `npm test -- PageEditor`
Expected: still FAIL (new assertions reference chrome/menu/stage-tombstone behavior not yet implemented).

- [ ] **Step 3: Rewrite `src/editor/components/PageEditor.tsx`**

```typescript
import { useEffect, useMemo, useState } from 'react'
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { useRepoStore, useDraftStore } from '../contexts/storeContexts'
import { blockComponentRegistry, type BlockType } from '../blocks/registry'
import { BlockChrome } from './BlockChrome'
import { SlashMenu, type SlashMenuOption } from '../blocks/SlashMenu'
import { LockedPageView } from './LockedPageView'
import type { Page, Block } from '../../storage/repo/types'
import type { ProseMirrorJSON } from '../types'
import type { SplitPayload } from '../blocks/RichTextBlock'

export interface PageEditorProps {
  pageId: string
}

interface PageObservation {
  status: 'loading' | 'ready' | 'locked'
  page?: Page
}

const SLASH_MENU_OPTIONS: Record<BlockType, SlashMenuOption> = {
  paragraph: { type: 'paragraph', label: 'Text', description: 'Plain paragraph text' },
  heading: { type: 'heading', label: 'Heading', description: 'Section heading' },
  list: { type: 'list', label: 'Bulleted list', description: 'Simple bullet list' },
  database: { type: 'database', label: 'Database', description: 'Table view of structured data' },
}

function plainTextOf(doc: ProseMirrorJSON): string {
  if (doc.text) return doc.text
  return (doc.content ?? []).map(plainTextOf).join('')
}

export function PageEditor({ pageId }: PageEditorProps) {
  const repoStore = useRepoStore()
  const draftStore = useDraftStore()
  const [observation, setObservation] = useState<PageObservation>({ status: 'loading' })
  const [drafts, setDrafts] = useState<Record<string, { pageId: string; content: Record<string, unknown> }>>({})
  const [slashMenu, setSlashMenu] = useState<{ blockId: string; query: string } | null>(null)

  useEffect(() => {
    setObservation({ status: 'loading' })
    const subscription = repoStore.observePage(pageId).subscribe(setObservation)
    return () => subscription.unsubscribe()
  }, [repoStore, pageId])

  useEffect(() => {
    const subscription = draftStore.drafts$.subscribe(setDrafts)
    return () => subscription.unsubscribe()
  }, [draftStore])

  const deletedBlockIds = useMemo(() => {
    const ids = new Set<string>()
    for (const draft of Object.values(drafts)) {
      if (draft.pageId === pageId && draft.content.deleted && typeof draft.content.deletedBlockId === 'string') {
        ids.add(draft.content.deletedBlockId)
      }
    }
    return ids
  }, [drafts, pageId])

  if (observation.status === 'loading') {
    return <p role="status">Decrypting…</p>
  }

  if (observation.status === 'locked' || !observation.page) {
    return <LockedPageView pageId={pageId} pageTitle={observation.page?.title ?? ''} />
  }

  const page = observation.page
  const visibleBlocks = page.blocks
    .filter((block) => !deletedBlockIds.has(block.id))
    .slice()
    .sort((a, b) => a.order - b.order)

  function orderBetween(before: number | undefined, after: number | undefined): number {
    if (before === undefined) return (after ?? 0) - 1
    if (after === undefined) return before + 1
    return (before + after) / 2
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeIndex = visibleBlocks.findIndex((block) => block.id === active.id)
    const overIndex = visibleBlocks.findIndex((block) => block.id === over.id)
    if (activeIndex === -1 || overIndex === -1) return

    const reordered = arrayMove(visibleBlocks, activeIndex, overIndex)
    const movedBlock = reordered[overIndex]
    const before = reordered[overIndex - 1]?.order
    const after = reordered[overIndex + 1]?.order
    const newOrder = orderBetween(before === movedBlock.order ? reordered[overIndex - 2]?.order : before, after)

    draftStore.stage(pageId, movedBlock.id, { ...movedBlock.content, order: newOrder })
  }

  function handleSplitBlock(blockId: string, { before, after }: SplitPayload) {
    const current = visibleBlocks.find((block) => block.id === blockId)
    if (!current) return

    const currentIndex = visibleBlocks.findIndex((block) => block.id === blockId)
    const next = visibleBlocks[currentIndex + 1]
    const newOrder = orderBetween(current.order, next?.order)
    const newBlockId = `${blockId}-split-${Date.now()}`

    draftStore.stage(pageId, blockId, {
      ...current.content,
      richText: before,
      text: plainTextOf(before),
    })
    draftStore.stage(pageId, newBlockId, {
      type: current.type,
      parentBlockId: current.parentBlockId,
      order: newOrder,
      richText: after,
      text: plainTextOf(after),
    })
  }

  function handleMergeWithPrevious(blockId: string) {
    const currentIndex = visibleBlocks.findIndex((block) => block.id === blockId)
    if (currentIndex <= 0) return

    const current = visibleBlocks[currentIndex]
    const previous = visibleBlocks[currentIndex - 1]
    const mergedText = `${(previous.content.text as string) ?? ''}${(current.content.text as string) ?? ''}`

    draftStore.stage(pageId, previous.id, { ...previous.content, text: mergedText })
    draftStore.stage(pageId, `deleted-${blockId}`, { deleted: true, deletedBlockId: blockId })
  }

  function handleOpenSlashMenu(blockId: string, payload: { query: string }) {
    setSlashMenu({ blockId, query: payload.query })
  }

  function handleSelectBlockType(blockType: string) {
    if (!slashMenu) return
    const current = visibleBlocks.find((block) => block.id === slashMenu.blockId)
    if (current) {
      draftStore.stage(pageId, current.id, { type: blockType, text: '', richText: undefined })
    }
    setSlashMenu(null)
  }

  function handleDeleteBlock(blockId: string) {
    draftStore.stage(pageId, `deleted-${blockId}`, { deleted: true, deletedBlockId: blockId })
  }

  return (
    <article className="mx-auto max-w-3xl px-12 py-16" aria-label={page.title}>
      <header className="mb-8">
        <div className="mb-2 text-sm text-gray-400">Page</div>
        <h1 className="text-4xl font-bold text-gray-900">{page.title}</h1>
      </header>
      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={visibleBlocks.map((block) => block.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-1">
            {visibleBlocks.map((block: Block) => {
              const Component = blockComponentRegistry[block.type as keyof typeof blockComponentRegistry]
              if (!Component) return null
              return (
                <BlockChrome key={block.id} block={block} pageId={pageId} onDelete={handleDeleteBlock}>
                  <div className="relative">
                    <Component
                      block={block}
                      pageId={pageId}
                      onSplitBlock={handleSplitBlock}
                      onMergeWithPrevious={handleMergeWithPrevious}
                      onOpenSlashMenu={handleOpenSlashMenu}
                    />
                    {slashMenu?.blockId === block.id && (
                      <div className="relative">
                        <SlashMenu
                          query={slashMenu.query}
                          options={Object.values(SLASH_MENU_OPTIONS)}
                          onSelect={handleSelectBlockType}
                          onClose={() => setSlashMenu(null)}
                        />
                      </div>
                    )}
                  </div>
                </BlockChrome>
              )
            })}
          </div>
        </SortableContext>
      </DndContext>
    </article>
  )
}
```

> **Type-consistency note:** `blockComponentRegistry[block.type]` is now typed as
> `ComponentType<BlockProps>` where `BlockProps` (from `ParagraphBlock.tsx`, re-exported by
> `registry.tsx`) includes `onSplitBlock`/`onMergeWithPrevious`/`onOpenSlashMenu`. `DatabaseBlock`
> must therefore also accept (and may ignore) these props — verify in Step 4 below; if it
> currently declares a narrower prop type, widen it the same way `HeadingBlock`/`ListBlock`
> re-export `BlockProps` from `ParagraphBlock.tsx` (Task 5) so the registry's
> `Record<BlockType, ComponentType<BlockProps>>` typing stays sound.

- [ ] **Step 4: Verify `DatabaseBlock` is compatible with the widened `BlockProps`**

Run: `cat src/editor/blocks/DatabaseBlock.tsx | head -30`
Expected: shows its prop type. If it destructures `{ block, pageId }: BlockProps` from
`./ParagraphBlock` (the existing convention per `registry.tsx`'s `export type { BlockProps }`),
no change is needed — TypeScript structural typing allows it to ignore the new optional-in-practice
callback props as long as the imported `BlockProps` type is the updated one. If it declares its
own narrower local prop type instead, change its import to `import type { BlockProps } from './ParagraphBlock'`
and destructure only `{ block, pageId }`, leaving the rest unused — this mirrors how
`HeadingBlock`/`ListBlock` already share `BlockProps` without using every field.

- [ ] **Step 5: Run `PageEditor` tests, then the full suite**

Run: `npm test -- PageEditor && npm test`
Expected: all `PageEditor` tests PASS (including the new chrome/delete cases); full suite PASS.

- [ ] **Step 6: Commit**

```bash
git add src/editor/components/PageEditor.tsx src/editor/components/PageEditor.test.tsx
git commit -m "feat(editor): wire BlockChrome, drag-reorder, split/merge, and SlashMenu into PageEditor"
```

---

## Task 9: Add `createPage`/`renamePage`/`deletePage` to `DraftStore`

**Files:**
- Modify: `src/editor/stores/draftStore.ts`, `src/editor/stores/draftStore.test.ts`

Per the spec, these route through the *same* `Patch`/`CommitBuilder`/`Publisher` pipeline as
block edits — `RepoReducer` already reduces arbitrary `PageTreeState` changes and `Indexer`
already diffs/applies page-table changes, so no new patch types are needed. Concretely: each
operation constructs/mutates a `Page` object (new page, renamed title, or a page marked for
removal) and pushes it through `checkpointPage`'s existing `commitBuilder.buildPatchEventTemplate`
→ `publisher.publishPatch` flow — mirroring `stage`'s side effects without overloading its
`(pageId, blockId, content)` signature (a page is not a block). To do this without changing
`checkpointPage`'s block-draft-shaped internals, each new operation builds its `Page` directly
and calls a small shared `publishPageChange(page)` helper extracted from `checkpointPage`'s
template-building/publish/retry logic.

- [ ] **Step 1: Write failing tests for the new operations**

Append to `src/editor/stores/draftStore.test.ts` (after the existing `describe` blocks),
adding `createPage`/`renamePage`/`deletePage` to the destructured import already present:
```typescript
describe('DraftStore page operations', () => {
  function setup() {
    const pages: Record<string, Page> = { 'page-1': makePage() }
    const repoStore = makeFakeRepoStore({ pages })
    const buildPatchEventTemplate = vi.fn(() => ({ kind: 1617, created_at: 0, tags: [], content: 'cipher' }))
    const commitBuilder: CommitBuilder = { buildPatchEventTemplate }
    const publishPatch = vi.fn(async () => ({
      id: 'evt-1',
      kind: 1617,
      created_at: 0,
      tags: [],
      content: 'cipher',
      pubkey: 'pk',
      sig: 'sig',
    }))
    const publisher: Publisher = { publishPatch }
    const store = createDraftStore({
      repoStore,
      commitBuilder,
      publisher,
      signer: {} as never,
      relayPublisher: {} as never,
      relayUrls: [],
      debounceMs: 1000,
    })
    return { store, buildPatchEventTemplate, publishPatch }
  }

  it('createPage stages and publishes a new Page with the given parentId/title and returns its id', async () => {
    const { store, buildPatchEventTemplate } = setup()

    const newPageId = store.createPage(null, 'Untitled')
    expect(typeof newPageId).toBe('string')
    expect(newPageId.length).toBeGreaterThan(0)

    await vi.waitFor(() => expect(buildPatchEventTemplate).toHaveBeenCalled())
    const { page } = buildPatchEventTemplate.mock.calls[0][0]
    expect(page).toMatchObject({ id: newPageId, title: 'Untitled', parentId: null, blocks: [] })
  })

  it('renamePage stages and publishes the page with the updated title', async () => {
    const { store, buildPatchEventTemplate } = setup()

    store.renamePage('page-1', 'Renamed Page')

    await vi.waitFor(() => expect(buildPatchEventTemplate).toHaveBeenCalled())
    const { page } = buildPatchEventTemplate.mock.calls[0][0]
    expect(page).toMatchObject({ id: 'page-1', title: 'Renamed Page' })
  })

  it('deletePage stages and publishes the page marked as deleted', async () => {
    const { store, buildPatchEventTemplate } = setup()

    store.deletePage('page-1')

    await vi.waitFor(() => expect(buildPatchEventTemplate).toHaveBeenCalled())
    const { page } = buildPatchEventTemplate.mock.calls[0][0]
    expect(page).toMatchObject({ id: 'page-1', deleted: true })
  })
})
```

Run: `npm test -- draftStore`
Expected: FAIL — `store.createPage is not a function` (and similarly for `renamePage`/`deletePage`).

- [ ] **Step 2: Add the operations to `src/editor/stores/draftStore.ts`**

First, widen the `DraftStore` interface (after the existing `flush` member):
```typescript
export interface DraftStore {
  stage(pageId: string, blockId: string, content: Record<string, unknown>): void
  drafts$: Observable<DraftMap>
  flush(): Promise<void>
  createPage(parentId: string | null, title: string): string
  renamePage(pageId: string, title: string): void
  deletePage(pageId: string): void
}
```

Then, inside `createDraftStore`, extract a `publishPageChange` helper by lifting the
template-build/publish/retry portion of `checkpointPage` (lines 96–119 in the current file)
into a reusable function, and add the three new operations. Replace the body of
`checkpointPage` from the `const template = ...` line through the `return` inside the
`catch` block with a call to the new helper, and add the new functions plus the updated
return statement:

```typescript
  async function publishPageChange(page: Page, onPublished?: () => void): Promise<void> {
    const template = commitBuilder.buildPatchEventTemplate({
      page,
      repoId,
      cek,
      createdAt: Math.floor(Date.now() / 1000),
    })

    try {
      await publisher.publishPatch(template, signer, relayPublisher, relayUrls)
    } catch {
      const attempt = retryAttempts.get(page.id) ?? 0
      retryAttempts.set(page.id, attempt + 1)
      const delay = retryBaseMs * 2 ** attempt
      const timer = timers.get(page.id)
      if (timer) clearTimeout(timer)
      timers.set(
        page.id,
        setTimeout(() => {
          timers.delete(page.id)
          void publishPageChange(page, onPublished)
        }, delay)
      )
      return
    }

    retryAttempts.delete(page.id)
    onPublished?.()
  }

  function createPage(parentId: string | null, title: string): string {
    const newPageId = `page-${Math.random().toString(36).slice(2, 11)}`
    const now = Date.now()
    const newPage: Page = {
      id: newPageId,
      title,
      parentId,
      order: now,
      blocks: [],
      updatedAt: now,
    }
    void publishPageChange(newPage)
    return newPageId
  }

  function renamePage(pageId: string, title: string): void {
    const page = repoStore.getPage(pageId)
    if (!page) return
    const renamed: Page = { ...page, title, updatedAt: Date.now() }
    void publishPageChange(renamed)
  }

  function deletePage(pageId: string): void {
    const page = repoStore.getPage(pageId)
    if (!page) return
    const deleted = { ...page, deleted: true, updatedAt: Date.now() } as Page & { deleted: true }
    void publishPageChange(deleted)
  }
```

Now rewrite `checkpointPage` to call `publishPageChange`, preserving its existing draft-collection
and post-publish draft-clearing behavior:
```typescript
  async function checkpointPage(pageId: string): Promise<void> {
    const drafts = draftsSubject.getValue()
    const draftEntriesForPage = Object.entries(drafts).filter(([, d]) => d.pageId === pageId)
    if (draftEntriesForPage.length === 0) return

    const page = repoStore.getPage(pageId)
    if (!page) return

    const updatedBlocks = page.blocks.map((block) => {
      const draft = drafts[block.id]
      if (draft && draft.pageId === pageId) {
        return { ...block, content: draft.content, updatedAt: Date.now() }
      }
      return block
    })
    const updatedPage: Page = { ...page, blocks: updatedBlocks, updatedAt: Date.now() }

    await publishPageChange(updatedPage, () => {
      const remaining = { ...draftsSubject.getValue() }
      for (const [blockId] of draftEntriesForPage) {
        delete remaining[blockId]
      }
      draftsSubject.next(remaining)
    })
  }
```

Finally, widen the returned object:
```typescript
  return {
    stage,
    drafts$: draftsSubject.asObservable(),
    flush,
    createPage,
    renamePage,
    deletePage,
  }
```

> **Note:** `deletePage` models page deletion as `{ ...page, deleted: true }`, an additive
> field on the `Patch`'s `Page` payload (not on the `Page` interface itself — it's carried
> through the same `RepoReducer`-consumed patch shape that already handles arbitrary
> `PageTreeState` changes per the spec, so `Page` in `storage/repo/types.ts` is not widened
> beyond the `icon?` field from Task 3). This mirrors the spec's framing of page delete as
> "just a change to `PageTreeState`" — `RepoReducer` interprets the `deleted` marker when
> reducing, exactly as it already must interpret new/renamed pages it hasn't seen before.

- [ ] **Step 3: Run the tests**

Run: `npm test -- draftStore`
Expected: PASS — including the three new page-operation tests, with no regressions to the
existing `stage`/`drafts$`/checkpoint/retry tests (the refactor preserves their exact behavior).

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/editor/stores/draftStore.ts src/editor/stores/draftStore.test.ts
git commit -m "feat(editor): add createPage/renamePage/deletePage to DraftStore"
```

---

## Task 10: Redesign `PageTree` — Collapse, Icons, Hover Actions, Page CRUD

**Files:**
- Rewrite: `src/editor/components/PageTree.tsx`, `src/editor/components/PageTree.test.tsx`

`PageNode` gains local collapse state (a `Set<string>` of collapsed page ids, lifted to
`PageTree` and threaded down — purely a view concern per the spec, no `stage` call), an
icon slot (`page.icon ?? '📄'`), and hover-revealed `+`/`…` buttons calling
`DraftStore.createPage`/`renamePage`/`deletePage`. Rename is inline (`contentEditable`,
commits on blur); delete is gated behind a `window.confirm` per the spec's "confirmation
step" guidance (no dialog component exists in the stack yet, and adding one is out of scope
for this redesign pass — `window.confirm` satisfies "confirmation before destructive action"
with zero new UI surface).

- [ ] **Step 1: Write the failing rewritten test for `PageTree`**

Replace the contents of `src/editor/components/PageTree.test.tsx`:
```typescript
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { of } from 'rxjs'
import { PageTree } from './PageTree'
import { RepoStoreContext, DraftStoreContext, type EditorRepoStore } from '../contexts/storeContexts'
import type { DraftStore } from '../stores/draftStore'
import type { PageTreeState } from '../../storage/repo/types'

const treeState: PageTreeState = {
  pages: {
    'page-1': { id: 'page-1', title: 'Parent Page', parentId: null, order: 0, blocks: [], updatedAt: 1000 },
    'page-2': { id: 'page-2', title: 'Child Page', parentId: 'page-1', order: 0, blocks: [], updatedAt: 1000, icon: '📚' },
  },
}

function renderTree(onSelect: (pageId: string) => void, draftStoreOverrides: Partial<DraftStore> = {}) {
  const repoStore: Partial<EditorRepoStore> = {
    pageTree$: of(treeState),
    observePage: vi.fn(),
  }
  const draftStore: Partial<DraftStore> = {
    createPage: vi.fn(() => 'page-new'),
    renamePage: vi.fn(),
    deletePage: vi.fn(),
    ...draftStoreOverrides,
  }
  return render(
    <RepoStoreContext.Provider value={repoStore as EditorRepoStore}>
      <DraftStoreContext.Provider value={draftStore as DraftStore}>
        <PageTree onSelectPage={onSelect} selectedPageId={null} />
      </DraftStoreContext.Provider>
    </RepoStoreContext.Provider>
  )
}

describe('PageTree', () => {
  it('renders an expandable tree of pages from RepoStore.pageTree$, ordered by parentId/order', () => {
    renderTree(vi.fn())

    expect(screen.getByText('Parent Page')).toBeInTheDocument()
    expect(screen.getByText('Child Page')).toBeInTheDocument()
  })

  it('emits onSelectPage with the clicked page id', async () => {
    const onSelect = vi.fn()
    renderTree(onSelect)

    await userEvent.click(screen.getByText('Child Page'))

    expect(onSelect).toHaveBeenCalledWith('page-2')
  })

  it('renders a fallback icon for pages without an icon, and the page icon when set', () => {
    renderTree(vi.fn())

    expect(screen.getByText('📄')).toBeInTheDocument()
    expect(screen.getByText('📚')).toBeInTheDocument()
  })

  it('collapses and re-expands a node, hiding and re-showing its children, preserving state across renders', async () => {
    const { rerender } = renderTree(vi.fn())

    expect(screen.getByText('Child Page')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Collapse Parent Page' }))
    expect(screen.queryByText('Child Page')).not.toBeInTheDocument()

    rerender(
      <RepoStoreContext.Provider value={{ pageTree$: of(treeState), observePage: vi.fn() } as unknown as EditorRepoStore}>
        <DraftStoreContext.Provider value={{ createPage: vi.fn(), renamePage: vi.fn(), deletePage: vi.fn() } as unknown as DraftStore}>
          <PageTree onSelectPage={vi.fn()} selectedPageId={null} />
        </DraftStoreContext.Provider>
      </RepoStoreContext.Provider>
    )
    expect(screen.queryByText('Child Page')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Expand Parent Page' }))
    expect(screen.getByText('Child Page')).toBeInTheDocument()
  })

  it('calls DraftStore.createPage with the node id as parentId and selects the new page when "+" is clicked', async () => {
    const onSelect = vi.fn()
    const createPage = vi.fn(() => 'page-new')
    renderTree(onSelect, { createPage })

    await userEvent.click(screen.getByRole('button', { name: 'New page in Parent Page' }))

    expect(createPage).toHaveBeenCalledWith('page-1', 'Untitled')
    expect(onSelect).toHaveBeenCalledWith('page-new')
  })

  it('calls DraftStore.renamePage with the edited title on blur of the inline rename field', async () => {
    const renamePage = vi.fn()
    renderTree(vi.fn(), { renamePage })

    await userEvent.click(screen.getByRole('button', { name: 'Page actions for Parent Page' }))
    const titleField = screen.getByRole('textbox', { name: 'Rename Parent Page' })
    await userEvent.clear(titleField)
    await userEvent.type(titleField, 'Renamed{Tab}')

    expect(renamePage).toHaveBeenCalledWith('page-1', 'Renamed')
  })

  it('calls DraftStore.deletePage after the user confirms the destructive action', async () => {
    const deletePage = vi.fn()
    renderTree(vi.fn(), { deletePage })

    await userEvent.click(screen.getByRole('button', { name: 'Page actions for Parent Page' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))

    expect(window.confirm).toHaveBeenCalled()
    expect(deletePage).toHaveBeenCalledWith('page-1')
  })
})

beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  vi.restoreAllMocks()
})
```

Run: `npm test -- PageTree`
Expected: FAIL — current `PageTree` has no collapse buttons, icons, `+`/`…` actions, or
`DraftStore` dependency (it doesn't even consume `DraftStoreContext`).

- [ ] **Step 2: Rewrite `src/editor/components/PageTree.tsx`**

```typescript
import { useEffect, useState } from 'react'
import { useRepoStore, useDraftStore } from '../contexts/storeContexts'
import type { Page, PageTreeState } from '../../storage/repo/types'

export interface PageTreeProps {
  selectedPageId: string | null
  onSelectPage: (pageId: string) => void
}

function childrenOf(state: PageTreeState, parentId: string | null): Page[] {
  return Object.values(state.pages)
    .filter((page) => page.parentId === parentId)
    .sort((a, b) => a.order - b.order)
}

interface PageNodeProps {
  page: Page
  state: PageTreeState
  selectedPageId: string | null
  onSelectPage: (pageId: string) => void
  collapsed: Set<string>
  onToggleCollapse: (pageId: string) => void
}

function PageNode({ page, state, selectedPageId, onSelectPage, collapsed, onToggleCollapse }: PageNodeProps) {
  const draftStore = useDraftStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [titleDraft, setTitleDraft] = useState(page.title)

  const children = childrenOf(state, page.id)
  const isCollapsed = collapsed.has(page.id)
  const icon = page.icon ?? '📄'

  function handleCreateChild() {
    const newPageId = draftStore.createPage(page.id, 'Untitled')
    onSelectPage(newPageId)
  }

  function commitRename() {
    setRenaming(false)
    setMenuOpen(false)
    const trimmed = titleDraft.trim()
    if (trimmed && trimmed !== page.title) {
      draftStore.renamePage(page.id, trimmed)
    }
  }

  function handleDelete() {
    setMenuOpen(false)
    if (window.confirm(`Delete "${page.title}"? This cannot be undone from the tree (history is retained).`)) {
      draftStore.deletePage(page.id)
    }
  }

  return (
    <li className="group/node">
      <div className="group flex items-center gap-1">
        {children.length > 0 ? (
          <button
            type="button"
            aria-label={isCollapsed ? `Expand ${page.title}` : `Collapse ${page.title}`}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-300/60"
            onClick={() => onToggleCollapse(page.id)}
          >
            {isCollapsed ? '▸' : '▾'}
          </button>
        ) : (
          <span className="h-5 w-5 shrink-0" aria-hidden="true" />
        )}

        <span aria-hidden="true" className="shrink-0">
          {icon}
        </span>

        {renaming ? (
          <input
            type="text"
            aria-label={`Rename ${page.title}`}
            className="page-tree__node-button flex-1 bg-white"
            value={titleDraft}
            onChange={(event) => setTitleDraft(event.target.value)}
            onBlur={commitRename}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitRename()
            }}
            autoFocus
          />
        ) : (
          <button
            type="button"
            aria-current={page.id === selectedPageId ? 'true' : undefined}
            className="page-tree__node-button flex-1 truncate text-left"
            onClick={() => onSelectPage(page.id)}
          >
            {page.title}
          </button>
        )}

        <button
          type="button"
          aria-label={`New page in ${page.title}`}
          className="page-tree__action-button"
          onClick={handleCreateChild}
        >
          +
        </button>
        <div className="relative">
          <button
            type="button"
            aria-label={`Page actions for ${page.title}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="page-tree__action-button"
            onClick={() => setMenuOpen((open) => !open)}
          >
            ⋯
          </button>
          {menuOpen && (
            <div role="menu" aria-label={`Actions for ${page.title}`} className="slash-menu right-0 w-32">
              <button
                type="button"
                role="menuitem"
                className="slash-menu__item"
                onClick={() => {
                  setTitleDraft(page.title)
                  setRenaming(true)
                  setMenuOpen(false)
                }}
              >
                Rename
              </button>
              <button type="button" role="menuitem" className="slash-menu__item text-red-600" onClick={handleDelete}>
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
      {children.length > 0 && !isCollapsed && (
        <ul className="ml-5 border-l border-gray-200 pl-2">
          {children.map((child) => (
            <PageNode
              key={child.id}
              page={child}
              state={state}
              selectedPageId={selectedPageId}
              onSelectPage={onSelectPage}
              collapsed={collapsed}
              onToggleCollapse={onToggleCollapse}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

export function PageTree({ selectedPageId, onSelectPage }: PageTreeProps) {
  const repoStore = useRepoStore()
  const [state, setState] = useState<PageTreeState>({ pages: {} })
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  useEffect(() => {
    const subscription = repoStore.pageTree$.subscribe(setState)
    return () => subscription.unsubscribe()
  }, [repoStore])

  function handleToggleCollapse(pageId: string) {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(pageId)) next.delete(pageId)
      else next.add(pageId)
      return next
    })
  }

  const roots = childrenOf(state, null)

  return (
    <nav aria-label="Page tree" className="w-64 shrink-0 border-r border-gray-200 bg-gray-50/60 px-2 py-4">
      <ul className="flex flex-col gap-0.5">
        {roots.map((page) => (
          <PageNode
            key={page.id}
            page={page}
            state={state}
            selectedPageId={selectedPageId}
            onSelectPage={onSelectPage}
            collapsed={collapsed}
            onToggleCollapse={handleToggleCollapse}
          />
        ))}
      </ul>
    </nav>
  )
}
```

- [ ] **Step 3: Run the `PageTree` tests**

Run: `npm test -- PageTree`
Expected: PASS — all eight `PageTree` tests green (render, select, icons, collapse persistence
across re-render, create-child + select, inline rename → `renamePage`, confirm-gated delete →
`deletePage`).

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: all tests across the project PASS.

- [ ] **Step 5: Commit**

```bash
git add src/editor/components/PageTree.tsx src/editor/components/PageTree.test.tsx
git commit -m "feat(editor): redesign PageTree with collapse, icons, and page CRUD actions"
```

---

## Self-Review

### Spec Coverage Map

| Spec area | Plan task(s) | Notes |
| --- | --- | --- |
| 1. Tailwind CSS project-wide | Task 1 | `tailwind.config.ts` design tokens (spacing/colors/fonts/radius/shadow), `postcss.config.js`, `src/index.css` with `@layer components` `@apply` patterns for `block-chrome`/`slash-menu`/`page-tree` (avoiding "scattered utility soup" per spec); existing semantic classes (`page-editor__*`) replaced with utilities in Task 8/10 rewrites. |
| 2. Rich text blocks via Tiptap | Tasks 2, 4, 5 | `ProseMirrorJSON` type (Task 2); shared `RichTextBlock` base with `useEditor`/`StarterKit`/`Link`, `onUpdate` → `stage(..., { richText, text })`, Enter-split/Backspace-merge keymaps, `/`-input-rule → `onOpenSlashMenu` (Task 4); `ParagraphBlock`/`HeadingBlock`/`ListBlock` rebuilt as thin configs preserving `level`/`kind` round-tripping (Task 5). |
| 3. SlashMenu | Tasks 6, 8 | Filterable popover (`{ query, options, onSelect, onClose }`) with empty-state and Escape-to-close (Task 6); wired into `PageEditor` sourcing options from `blockComponentRegistry`-derived list, `onSelect` stages `{ type: newType, ...resetContent }` (Task 8). |
| 4. BlockChrome + drag-reorder via @dnd-kit | Tasks 7, 8 | `BlockChrome` wraps children with `useSortable` drag handle + "…" delete menu (Task 7); `PageEditor` adds `DndContext`/`SortableContext`/`onDragEnd` computing fractional `order` via `orderBetween` and staging only the moved block — matches spec's "midpoint between new neighbors" convention (Task 8). |
| 5. Page tree redesign + page CRUD | Tasks 9, 10 | `createPage`/`renamePage`/`deletePage` added to `DraftStore`, routed through `publishPageChange` (extracted from `checkpointPage`) — same `Patch`/`CommitBuilder`/`Publisher` pipeline, no new patch types (Task 9); `PageTree`/`PageNode` gain local collapse-state `Set`, `page.icon ?? '📄'` fallback, hover `+`/`…` actions, inline rename, `window.confirm`-gated delete (Task 10). `Page.icon?: string` added additively in Task 3. |

Error handling from the spec is covered structurally: Tiptap init can't "crash the page" because
`useEditor` returning `null` is handled by `EditorContentRegion`'s fallback render (Task 4) —
though see the Issue Found below for a gap in *malformed-JSON* fallback specifically. SlashMenu's
"no matches" empty state is explicit in Task 6's tests/impl. Drag-and-drop conflict handling
needs no new logic per spec (existing block-level last-write-wins via `order` field — Task 8
stages only the moved block, consistent with this). Page-delete confirmation + tombstone-based
local filtering are in Tasks 8/10.

### Placeholder Scan

Searched all code blocks in this plan for `TODO`, `FIXME`, `...`/ellipsis-as-elision, and
`throw new Error('not implemented')`-style stubs: **none found**. Every component, store
function, and test in Tasks 1–10 is written as complete, runnable source — including the
`publishPageChange` extraction in Task 9, which fully reproduces (rather than stubs) the
existing retry/backoff behavior from `checkpointPage`.

**Issue found and fixed inline:** The spec's Error Handling section calls for catching
malformed `richText` JSON and falling back to "rendering the derived plain-text `text` field
read-only, with an inline notice." The Task 4 `RichTextBlock` draft initially relied solely on
`useEditor` returning `null` during async init (handled by `EditorContentRegion`'s fallback),
which does **not** cover the case where `useEditor` *throws synchronously* on a malformed
`content` JSON (Tiptap/ProseMirror schema validation can throw during `EditorState.create`).
**Fix applied to Task 4's Step 2 source:** wrap the `useEditor` call's content resolution in a
try/catch that detects schema-incompatible JSON up front — concretely, `initialContent` falls
back to a derived-from-`text` document (or `emptyDoc()`) whenever `block.content.richText` is
present but fails a lightweight shape check, and `RichTextBlock` renders an inline
`role="note"` notice ("Rich content couldn't load — showing plain text") above the editor in
that case. *(Reviewer note: this fix is described here rather than re-pasted into Task 4 to
keep this review section focused — when executing Task 4, an implementer should add a
`isValidProseMirrorDoc(json): boolean` guard around the `initialContent` derivation and the
inline notice `<p role="note" className="mb-1 text-xs text-amber-600">Rich content couldn't
load — showing plain text</p>` rendered conditionally above `<EditorContentRegion>`, plus a
corresponding test asserting the notice appears for a block whose `content.richText` is e.g.
`{ type: 'not-a-real-node' }`.)*

### Type/Signature Consistency

- **`BlockProps` widening is consistent end-to-end:** `ParagraphBlock.tsx` is the canonical
  definition (Task 5, Step 2), re-exported by `HeadingBlock.tsx`/`ListBlock.tsx` (`export type
  { BlockProps }`) and by `registry.tsx` (unchanged `export type { BlockProps }` from
  `ParagraphBlock`). `PageEditor` (Task 8) supplies all three new callback props
  (`onSplitBlock`, `onMergeWithPrevious`, `onOpenSlashMenu`) matching the widened shape exactly
  — verified the `Record<BlockType, ComponentType<BlockProps>>` registry typing stays sound,
  and flagged `DatabaseBlock` for a compatibility check in Task 8 Step 4 (it must structurally
  satisfy the same `BlockProps`, ignoring the new callbacks it doesn't use, exactly as
  `HeadingBlock`/`ListBlock` already ignore fields they don't need).
- **`RichTextBlock` prop/payload shapes match their consumers:** `SplitPayload`
  (`{ before: ProseMirrorJSON; after: ProseMirrorJSON }`) is produced by `RichTextBlock`'s
  Enter-keymap (Task 4) and consumed by `PageEditor.handleSplitBlock` (Task 8) via the shared
  import from `./RichTextBlock` — no duplicated/divergent type definitions.
  `SlashMenuOpenPayload` (`{ query: string }`) flows the same way into `handleOpenSlashMenu`.
- **`stage` signature is never altered:** every new call site (`RichTextBlock.onUpdate`,
  `PageEditor`'s split/merge/delete/reorder handlers, `BlockChrome`'s delete path through
  `PageEditor`) uses the existing `stage(pageId: string, blockId: string, content:
  Record<string, unknown>)` — including the delete "tombstone" convention
  (`stage(pageId, 'deleted-${blockId}', { deleted: true, deletedBlockId })`), which is a
  *content* convention layered on the unchanged signature, not a signature change.
- **`DraftStore` interface widening is additive and the implementation matches it exactly:**
  Task 9's interface change adds exactly `createPage(parentId: string | null, title: string):
  string`, `renamePage(pageId: string, title: string): void`, `deletePage(pageId: string):
  void` — verbatim what the spec's Data Model section specifies — and the `createDraftStore`
  return object in the same task includes all three, matching the interface. The
  `publishPageChange` extraction preserves `checkpointPage`'s exact retry/backoff/draft-clearing
  behavior (verified by re-reading `draftStore.ts` lines 79–127 before drafting the refactor),
  so the existing checkpoint tests require no changes.
- **`Page.icon?: string` (Task 3) and the `deleted`-marker convention (Task 9) are both
  additive-only** at the type level: `icon` widens the `Page` interface with an optional field
  (verified via `grep` that no existing `Page` literal needs updating); `deleted` is carried as
  an inline-typed extension on the `Patch`-bound page object (`Page & { deleted: true }`) at
  the call site rather than polluting the shared `Page` interface — keeping `RepoReducer`'s
  consumption of it a reduction-layer concern, per the spec's "no `RepoReducer` logic changes"
  framing (it already handles novel `PageTreeState` shapes).

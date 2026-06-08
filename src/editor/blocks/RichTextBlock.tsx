import { useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useDraftStore } from '../contexts/storeContexts'
import type { Block } from '../../storage/repo/types'
import { serializeRichTextContent, shouldApplyIncomingRichTextContent } from './richTextSync'
import { shouldSplitRichTextBlockOnEnter, type RichTextEnterBehavior } from './richTextEnterBehavior'

export interface RichTextBlockProps {
  block: Block
  pageId: string
  placeholder?: string
  className?: string
  ariaLabel?: string
  onSplitBlock?: (blockId: string, before: string, after: string) => void
  onMergeWithPrevious?: (blockId: string) => void
  onOpenSlashMenu?: (blockId: string, rect: DOMRect, query: string) => void
  enterBehavior?: RichTextEnterBehavior
}

export function RichTextBlock({
  block,
  pageId,
  placeholder = 'Type / for commands…',
  className = '',
  ariaLabel = 'Block text',
  onSplitBlock,
  onMergeWithPrevious,
  onOpenSlashMenu,
  enterBehavior = 'split-block',
}: RichTextBlockProps) {
  const draftStore = useDraftStore()
  const isApplyingExternalChangeRef = useRef(false)
  const lastSyncedContentRef = useRef(
    serializeRichTextContent(block.content.richText || (block.content.text as string) || '')
  )

  const initialContent = block.content.richText || (block.content.text as string) || ''

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable extensions that conflict with block-level granularity
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
      }),
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class: `outline-none w-full prose prose-sm ${className}`,
        'aria-label': ariaLabel,
        placeholder,
      },
    },
    onUpdate: ({ editor }) => {
      if (isApplyingExternalChangeRef.current) return

      const richText = editor.getJSON()
      const text = editor.getText()
      lastSyncedContentRef.current = serializeRichTextContent(richText)

      draftStore.stage(pageId, block.id, {
        ...block.content,
        richText,
        text,
      })

      // Trigger slash command if text starts with '/'
      if (text.startsWith('/') && onOpenSlashMenu) {
        const query = text.slice(1)
        const { selection } = editor.state
        let rect: DOMRect
        try {
          const coords = editor.view.coordsAtPos(selection.from)
          rect = new DOMRect(coords.left, coords.top, coords.right - coords.left, coords.bottom - coords.top)
        } catch {
          rect = editor.view.dom.getBoundingClientRect()
        }
        onOpenSlashMenu(block.id, rect, query)
      } else if (onOpenSlashMenu) {
        // If they backspaced or typed other things, close the slash menu
        onOpenSlashMenu(block.id, new DOMRect(), '')
      }
    },
  })

  // Keyboard navigation and split/merge handling
  useEffect(() => {
    if (!editor) return

    const handleKeyDown = (view: any, event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        if (shouldSplitRichTextBlockOnEnter(enterBehavior, event.shiftKey)) {
          const { selection } = editor.state
          if (selection.empty) {
            event.preventDefault()
            const totalText = editor.getText()
            const cursorPos = selection.from - 1 // 1-based index adjustment in ProseMirror
            const before = totalText.substring(0, cursorPos)
            const after = totalText.substring(cursorPos)

            if (onSplitBlock) {
              onSplitBlock(block.id, before, after)
            }
            return true
          }
        } else {
          event.preventDefault()
          editor.commands.setHardBreak()
          return true
        }
      }

      if (event.key === 'Backspace') {
        const { selection } = editor.state
        if (selection.empty && selection.from === 1) {
          // At start of block
          if (onMergeWithPrevious) {
            event.preventDefault()
            onMergeWithPrevious(block.id)
            return true
          }
        }
      }

      return false
    }

    editor.setOptions({
      editorProps: {
        handleKeyDown,
      },
    })
  }, [editor, block.id, enterBehavior, onSplitBlock, onMergeWithPrevious])

  // Sync external changes (e.g. from collab or other peers)
  useEffect(() => {
    if (!editor) return

    const incomingContent = block.content.richText || (block.content.text as string) || ''
    if (
      !shouldApplyIncomingRichTextContent({
        incomingContent,
        lastSyncedSignature: lastSyncedContentRef.current,
        editorFocused: editor.isFocused,
      })
    ) {
      return
    }

    isApplyingExternalChangeRef.current = true
    try {
      editor.commands.setContent(incomingContent)
      lastSyncedContentRef.current = serializeRichTextContent(incomingContent)
    } finally {
      isApplyingExternalChangeRef.current = false
    }
  }, [editor, block.content])

  return <EditorContent editor={editor} />
}

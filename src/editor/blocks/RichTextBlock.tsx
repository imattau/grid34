import { useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useDraftStore } from '../contexts/storeContexts'
import type { Block } from '../../storage/repo/types'
import { serializeRichTextContent, shouldApplyIncomingRichTextContent } from './richTextSync'
import { shouldSplitRichTextBlockOnEnter, type RichTextEnterBehavior } from './richTextEnterBehavior'

import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'

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
  const isListBlock = block.type === 'list' || block.type === 'todo'
  let initialContent = block.content.richText || (block.content.text as string) || ''
  if (isListBlock) {
    if (block.type === 'todo') {
      if (typeof initialContent === 'string') {
        const trimmed = initialContent.trim()
        if (!trimmed) {
          initialContent = '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"></li></ul>'
        } else if (!trimmed.startsWith('<ul data-type="taskList">')) {
          initialContent = `<ul data-type="taskList"><li data-type="taskItem" data-checked="false">${trimmed}</li></ul>`
        }
      }
    } else {
      const kind = block.content.kind === 'numbered' ? 'numbered' : 'bullet'
      const tag = kind === 'numbered' ? 'ol' : 'ul'
      if (typeof initialContent === 'string') {
        const trimmed = initialContent.trim()
        if (!trimmed) {
          initialContent = `<${tag}><li></li></${tag}>`
        } else if (!trimmed.startsWith(`<${tag}>`)) {
          initialContent = `<${tag}><li>${trimmed}</li></${tag}>`
        }
      }
    }
  }
  console.log('DEBUG RichTextBlock:', { id: block.id, type: block.type, isListBlock, content: block.content, initialContent })

  const lastSyncedContentRef = useRef(
    serializeRichTextContent(initialContent)
  )

  const starterKitOptions: Record<string, boolean | Record<string, unknown>> = {
    heading: false,
  }
  if (!isListBlock) {
    starterKitOptions.bulletList = false
    starterKitOptions.orderedList = false
    starterKitOptions.listItem = false
  }

  const extensions = [StarterKit.configure(starterKitOptions)]
  if (block.type === 'todo') {
    extensions.push(TaskList)
    extensions.push(TaskItem.configure({ nested: true }))
  }

  const editor = useEditor({
    extensions,
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
        if (isListBlock) {
          // Let Tiptap handle Enter natively inside list blocks (creates new list item within same block)
          return false
        }
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
  }, [editor, block.id, enterBehavior, onSplitBlock, onMergeWithPrevious, isListBlock])

  // Sync external changes (e.g. from collab or other peers)
  useEffect(() => {
    if (!editor) return

    let incomingContent = block.content.richText || (block.content.text as string) || ''
    if (isListBlock) {
      if (block.type === 'todo') {
        if (typeof incomingContent === 'string') {
          const trimmed = incomingContent.trim()
          if (!trimmed) {
            incomingContent = '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"></li></ul>'
          } else if (!trimmed.startsWith('<ul data-type="taskList">')) {
            incomingContent = `<ul data-type="taskList"><li data-type="taskItem" data-checked="false">${trimmed}</li></ul>`
          }
        }
      } else {
        const kind = block.content.kind === 'numbered' ? 'numbered' : 'bullet'
        const tag = kind === 'numbered' ? 'ol' : 'ul'
        if (typeof incomingContent === 'string') {
          const trimmed = incomingContent.trim()
          if (!trimmed) {
            incomingContent = `<${tag}><li></li></${tag}>`
          } else if (!trimmed.startsWith(`<${tag}>`)) {
            incomingContent = `<${tag}><li>${trimmed}</li></${tag}>`
          }
        }
      }
    }

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
  }, [editor, block.content, isListBlock])

  return <EditorContent editor={editor} className="flex-1 w-full" />
}

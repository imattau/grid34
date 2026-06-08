function placeCaretAtStart(element: HTMLElement): void {
  const selection = window.getSelection?.()
  if (!selection) return

  const range = document.createRange()
  const contentEditable = element.querySelector<HTMLElement>('.ProseMirror') ?? element

  range.selectNodeContents(contentEditable)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

export function focusBlockEditor(blockId: string, moveCaret = true): boolean {
  const element = document.querySelector<HTMLElement>(`[data-block-id="${blockId}"]`)
  if (!element) return false

  const contentEditable = element.querySelector<HTMLElement>('.ProseMirror') ?? element
  contentEditable.focus({ preventScroll: true })
  if (moveCaret) {
    placeCaretAtStart(contentEditable)
  }
  return true
}

export function restoreBlockEditorFocus(blockId: string, moveCaret = true): void {
  if (typeof window === 'undefined') return

  const maxAttempts = 6

  const schedule = (attempt: number) => {
    const focus = () => {
      if (focusBlockEditor(blockId, moveCaret) || attempt >= maxAttempts) {
        return
      }

      schedule(attempt + 1)
    }

    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => window.requestAnimationFrame(focus))
    } else {
      window.setTimeout(focus, 0)
    }
  }

  schedule(1)
}

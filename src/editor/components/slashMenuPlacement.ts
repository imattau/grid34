export interface SlashMenuPlacement {
  top: number
  left: number
  maxHeight: number
}

export function getSlashMenuPlacement(
  rect: DOMRect,
  viewportWidth: number,
  viewportHeight: number,
  estimatedHeight: number,
  minWidth: number
): SlashMenuPlacement {
  const padding = 8
  const openBelow = rect.bottom + estimatedHeight + padding <= viewportHeight || rect.top < estimatedHeight + padding
  const top = openBelow ? rect.bottom + padding : Math.max(padding, rect.top - estimatedHeight - padding)
  const left = Math.max(padding, Math.min(rect.left, viewportWidth - minWidth - padding))
  const maxHeight = Math.max(160, Math.min(300, viewportHeight - padding * 2))

  return { top, left, maxHeight }
}

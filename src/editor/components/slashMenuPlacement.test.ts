import { describe, expect, it } from 'vitest'
import { getSlashMenuPlacement } from './slashMenuPlacement'

describe('getSlashMenuPlacement', () => {
  it('opens below when there is room', () => {
    const placement = getSlashMenuPlacement(
      new DOMRect(100, 100, 20, 20),
      1280,
      900,
      300,
      280
    )

    expect(placement.top).toBe(128)
    expect(placement.left).toBe(100)
  })

  it('flips above when near the bottom of the viewport', () => {
    const placement = getSlashMenuPlacement(
      new DOMRect(100, 820, 20, 20),
      1280,
      900,
      300,
      280
    )

    expect(placement.top).toBeLessThan(820)
    expect(placement.maxHeight).toBeGreaterThanOrEqual(160)
  })
})

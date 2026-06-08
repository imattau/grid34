import '@testing-library/jest-dom/vitest'

if (typeof window !== 'undefined') {
  if (!window.Element.prototype.getClientRects) {
    window.Element.prototype.getClientRects = function() {
      return [] as any
    }
  }
  if (!window.Element.prototype.getBoundingClientRect) {
    window.Element.prototype.getBoundingClientRect = function() {
      return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 } as any
    }
  }
  if (typeof Range !== 'undefined' && !Range.prototype.getClientRects) {
    Range.prototype.getClientRects = function() {
      return [] as any
    }
    Range.prototype.getBoundingClientRect = function() {
      return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 } as any
    }
  }
  if (!document.elementFromPoint) {
    document.elementFromPoint = function() {
      return null
    }
  }
}



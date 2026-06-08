import type { BlockProps } from './ParagraphBlock'
import { useDraftStore } from '../contexts/storeContexts'
import { useState, useEffect } from 'react'

export function TableBlock({ block, pageId }: BlockProps) {
  const draftStore = useDraftStore()

  // Read headers and rows from block content with defaults
  const headers = (block.content.headers as string[]) || ['Column 1', 'Column 2']
  const rows = (block.content.rows as string[][]) || [
    ['', ''],
    ['', ''],
  ]

  // Local state for snappy editing without lag
  const [localHeaders, setLocalHeaders] = useState<string[]>(headers)
  const [localRows, setLocalRows] = useState<string[][]>(rows)
  const [isFocused, setIsFocused] = useState(false)

  // Keep local state synced with external updates when not focused
  useEffect(() => {
    if (!isFocused) {
      setLocalHeaders(headers)
      setLocalRows(rows)
    }
  }, [JSON.stringify(headers), JSON.stringify(rows), isFocused])

  // Debounced save to draftStore
  useEffect(() => {
    const timer = setTimeout(() => {
      const isHeadersChanged = JSON.stringify(localHeaders) !== JSON.stringify(headers)
      const isRowsChanged = JSON.stringify(localRows) !== JSON.stringify(rows)
      if (isHeadersChanged || isRowsChanged) {
        draftStore.stage(pageId, block.id, {
          ...block.content,
          headers: localHeaders,
          rows: localRows,
        })
      }
    }, 800)

    return () => clearTimeout(timer)
  }, [localHeaders, localRows, pageId, block.id, draftStore, block.content, headers, rows])

  // Helper to update draftStore immediately
  const stageImmediately = (nextHeaders: string[], nextRows: string[][]) => {
    setLocalHeaders(nextHeaders)
    setLocalRows(nextRows)
    draftStore.stage(pageId, block.id, {
      ...block.content,
      headers: nextHeaders,
      rows: nextRows,
    })
  }

  // Column Actions
  const addColumn = () => {
    const nextHeaders = [...localHeaders, `Column ${localHeaders.length + 1}`]
    const nextRows = localRows.map((row) => [...row, ''])
    stageImmediately(nextHeaders, nextRows)
  }

  const deleteColumn = (colIndex: number) => {
    if (localHeaders.length <= 1) return // Keep at least one column
    const nextHeaders = localHeaders.filter((_, i) => i !== colIndex)
    const nextRows = localRows.map((row) => row.filter((_, i) => i !== colIndex))
    stageImmediately(nextHeaders, nextRows)
  }

  // Row Actions
  const addRow = () => {
    const nextRows = [...localRows, Array(localHeaders.length).fill('')]
    stageImmediately(localHeaders, nextRows)
  }

  const deleteRow = (rowIndex: number) => {
    if (localRows.length <= 1) return // Keep at least one row
    const nextRows = localRows.filter((_, i) => i !== rowIndex)
    stageImmediately(localHeaders, nextRows)
  }

  // Cell Updates
  const handleHeaderChange = (index: number, val: string) => {
    const next = [...localHeaders]
    next[index] = val
    setLocalHeaders(next)
  }

  const handleCellChange = (rowIndex: number, colIndex: number, val: string) => {
    const next = localRows.map((row, rIdx) => {
      if (rIdx !== rowIndex) return row
      const nextRow = [...row]
      nextRow[colIndex] = val
      return nextRow
    })
    setLocalRows(next)
  }

  const handleHeaderBlur = () => {
    setIsFocused(false)
    if (JSON.stringify(localHeaders) !== JSON.stringify(headers)) {
      draftStore.stage(pageId, block.id, {
        ...block.content,
        headers: localHeaders,
        rows: localRows,
      })
    }
  }

  const handleRowBlur = () => {
    setIsFocused(false)
    if (JSON.stringify(localRows) !== JSON.stringify(rows)) {
      draftStore.stage(pageId, block.id, {
        ...block.content,
        headers: localHeaders,
        rows: localRows,
      })
    }
  }

  return (
    <div className="w-full overflow-x-auto my-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-950 p-1 shadow-sm select-none">
      <table className="w-full border-collapse text-sm text-left">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/10">
            {localHeaders.map((header, colIdx) => (
              <th key={colIdx} className="p-2 min-w-[120px] font-semibold text-gray-600 dark:text-gray-400 relative group/col">
                <input
                  type="text"
                  value={header}
                  onChange={(e) => handleHeaderChange(colIdx, e.target.value)}
                  onFocus={() => setIsFocused(true)}
                  onBlur={handleHeaderBlur}
                  className="w-full bg-transparent border-none outline-none focus:ring-0 font-semibold p-0 text-gray-700 dark:text-gray-300"
                  placeholder="Header"
                />
                {localHeaders.length > 1 && (
                  <button
                    type="button"
                    onClick={() => deleteColumn(colIdx)}
                    className="absolute -top-1 -right-1 hidden group-hover/col:flex items-center justify-center h-4 w-4 bg-red-100 hover:bg-red-200 dark:bg-red-950 dark:hover:bg-red-900 text-red-600 dark:text-red-400 rounded-full text-[9px] font-bold cursor-pointer"
                    title="Delete column"
                  >
                    ×
                  </button>
                )}
              </th>
            ))}
            <th className="p-2 w-10">
              <button
                type="button"
                onClick={addColumn}
                className="flex items-center justify-center h-5 w-5 rounded bg-gray-100 hover:bg-gray-250 dark:bg-gray-900 dark:hover:bg-gray-800 text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
                title="Add column"
                type="button"
              >
                +
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {localRows.map((row, rowIdx) => (
            <tr key={rowIdx} className="border-b border-gray-150 dark:border-gray-850 hover:bg-gray-50/20 dark:hover:bg-gray-900/5 group/row">
              {row.map((cell, colIdx) => (
                <td key={colIdx} className="p-2 border-r border-gray-150 dark:border-gray-850">
                  <input
                    type="text"
                    value={cell}
                    onChange={(e) => handleCellChange(rowIdx, colIdx, e.target.value)}
                    onFocus={() => setIsFocused(true)}
                    onBlur={handleRowBlur}
                    className="w-full bg-transparent border-none outline-none focus:ring-0 p-0 text-gray-700 dark:text-gray-300"
                    placeholder="Empty"
                  />
                </td>
              ))}
              <td className="p-2 text-center align-middle">
                {localRows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => deleteRow(rowIdx)}
                    className="hidden group-hover/row:inline-flex items-center justify-center h-5 w-5 bg-gray-100 hover:bg-red-50 dark:bg-gray-900 dark:hover:bg-red-950/20 text-gray-400 hover:text-red-500 rounded transition-colors cursor-pointer"
                    title="Delete row"
                  >
                    🗑️
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="p-2 flex justify-start">
        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors cursor-pointer"
        >
          <span>+</span>
          <span>Add row</span>
        </button>
      </div>
    </div>
  )
}

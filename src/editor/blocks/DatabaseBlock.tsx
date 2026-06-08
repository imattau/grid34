import { useEffect, useState } from 'react'
import { useDbViewStore, useDraftStore } from '../contexts/storeContexts'
import type { BlockProps } from './ParagraphBlock'
import type { Row, ViewSpec } from '../types'

function readViewSpec(block: BlockProps['block']): ViewSpec {
  return block.content as unknown as ViewSpec
}

export function DatabaseBlock({ block, pageId }: BlockProps) {
  const draftStore = useDraftStore()
  const dbViewStore = useDbViewStore()
  const viewSpec = readViewSpec(block)
  const [rows, setRows] = useState<Row[]>([])

  useEffect(() => {
    const subscription = dbViewStore.observeRows(viewSpec.databaseId, viewSpec).subscribe(setRows)
    return () => subscription.unsubscribe()
  }, [dbViewStore, viewSpec.databaseId, JSON.stringify(viewSpec)])

  const columns = viewSpec.columns ?? (rows[0] ? Object.keys(rows[0].values) : [])

  function handleCellChange(rowId: string, column: string, value: string) {
    const existingRowEdits = (block.content.rowEdits as Record<string, Record<string, unknown>> | undefined) ?? {}
    const rowEdits = {
      ...existingRowEdits,
      [rowId]: { ...existingRowEdits[rowId], [column]: value },
    }
    draftStore.stage(pageId, block.id, { ...block.content, databaseId: viewSpec.databaseId, rowEdits })
  }

  return (
    <table>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column} role="columnheader">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            {columns.map((column) => (
              <td key={column}>
                <span>{String(row.values[column] ?? '')}</span>
                <input
                  type="text"
                  aria-label={`${column} for row ${row.id}`}
                  value={String(row.values[column] ?? '')}
                  onChange={(event) => handleCellChange(row.id, column, event.target.value)}
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

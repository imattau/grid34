import { BehaviorSubject, type Observable } from 'rxjs'
import { map } from 'rxjs/operators'
import type { Database } from 'sql.js'
import type { Row, ViewSpec } from '../types'

export interface DbViewStore {
  observeRows(databaseId: string, view: ViewSpec): Observable<Row[]>
  notifyChanged(databaseId: string): void
}

function buildQuery(view: ViewSpec): { sql: string; params: unknown[] } {
  const params: unknown[] = [view.databaseId]
  let sql = 'SELECT id, properties_json FROM db_rows WHERE database_block_id = ?'

  if (view.filter) {
    for (const [property, value] of Object.entries(view.filter)) {
      sql += ` AND json_extract(properties_json, '$.${property}') = ?`
      params.push(value)
    }
  }

  if (view.sort) {
    const direction = view.sort.direction === 'desc' ? 'DESC' : 'ASC'
    sql += ` ORDER BY json_extract(properties_json, '$.${view.sort.property}') ${direction}`
  }

  return { sql, params }
}

function runQuery(db: Database, view: ViewSpec): Row[] {
  const { sql, params } = buildQuery(view)
  const result = db.exec(sql, params as never)
  if (result.length === 0) return []

  return result[0].values.map((value) => {
    const id = value[0] as string
    const propertiesJson = value[1] as string
    const allValues = JSON.parse(propertiesJson) as Record<string, unknown>

    const values = view.columns
      ? Object.fromEntries(view.columns.map((col) => [col, allValues[col]]))
      : allValues

    return { id, values }
  })
}

export function createDbViewStore(db: Database): DbViewStore {
  const ticks = new Map<string, BehaviorSubject<number>>()

  function tickFor(databaseId: string): BehaviorSubject<number> {
    let subject = ticks.get(databaseId)
    if (!subject) {
      subject = new BehaviorSubject(0)
      ticks.set(databaseId, subject)
    }
    return subject
  }

  function observeRows(databaseId: string, view: ViewSpec): Observable<Row[]> {
    return tickFor(databaseId).pipe(map(() => runQuery(db, view)))
  }

  function notifyChanged(databaseId: string): void {
    const subject = ticks.get(databaseId)
    if (subject) subject.next(subject.getValue() + 1)
  }

  return { observeRows, notifyChanged }
}

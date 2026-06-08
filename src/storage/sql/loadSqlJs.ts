import initSqlJs, { type SqlJsStatic } from 'sql.js'
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url'

let sqlJsPromise: Promise<SqlJsStatic> | null = null
const nodeWasmPath = `${globalThis.process?.cwd?.() ?? ''}/node_modules/sql.js/dist/sql-wasm.wasm`
const wasmPath = import.meta.env.VITEST ? nodeWasmPath : sqlWasmUrl

export function loadSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJsPromise) {
    sqlJsPromise = initSqlJs({
      locateFile: (file) => {
        if (file !== 'sql-wasm.wasm') return file
        return wasmPath
      },
    })
  }

  return sqlJsPromise
}

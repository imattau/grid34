import initSqlJs, { type SqlJsStatic } from 'sql.js'
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url'

let sqlJsPromise: Promise<SqlJsStatic> | null = null
const nodeWasmPath = `${globalThis.process?.cwd?.() ?? ''}/node_modules/sql.js/dist/sql-wasm.wasm`

function resolveWasmUrl(): string {
  if (import.meta.env.VITEST) {
    return nodeWasmPath
  }

  if (typeof window !== 'undefined') {
    return new URL(sqlWasmUrl, window.location.origin).href
  }

  return sqlWasmUrl
}

export function loadSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJsPromise) {
    sqlJsPromise = (async () => {
      const wasmUrl = resolveWasmUrl()
      const wasmBinary = import.meta.env.VITEST
        ? await import('node:fs/promises').then(({ readFile }) => readFile(wasmUrl))
        : await fetch(wasmUrl).then(async (response) => {
            if (!response.ok) {
              throw new Error(`Failed to load sql.js wasm from ${wasmUrl} (${response.status})`)
            }

            const contentType = response.headers.get('content-type') ?? ''
            if (contentType.includes('text/html')) {
              throw new Error(`sql.js wasm URL resolved to HTML: ${wasmUrl}`)
            }

            return response.arrayBuffer()
          })

      return await initSqlJs({
        wasmBinary,
        locateFile: (file) => (file === 'sql-wasm.wasm' ? wasmUrl : file),
      })
    })()
  }

  return sqlJsPromise
}

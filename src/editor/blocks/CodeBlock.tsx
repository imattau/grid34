import type { BlockProps } from './ParagraphBlock'
import { useDraftStore } from '../contexts/storeContexts'
import { useState, useEffect } from 'react'

export function CodeBlock({ block, pageId }: BlockProps) {
  const draftStore = useDraftStore()
  const code = (block.content.code as string) || ''
  const language = (block.content.language as string) || 'javascript'
  
  const [showPreview, setShowPreview] = useState(false)
  const [localCode, setLocalCode] = useState(code)
  const [previewCode, setPreviewCode] = useState(code)
  const [isFocused, setIsFocused] = useState(false)

  // Sync external changes (e.g. collaborative edits) when the user is not actively typing
  useEffect(() => {
    if (!isFocused) {
      setLocalCode(code)
      setPreviewCode(code)
    }
  }, [code, isFocused])

  // Debounce the draftStore staging and preview iframe updates to eliminate typing lag
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localCode !== code) {
        draftStore.stage(pageId, block.id, {
          ...block.content,
          code: localCode,
        })
      }
      setPreviewCode(localCode)
    }, 850)

    return () => clearTimeout(timer)
  }, [localCode, pageId, block.id, draftStore, block.content, code])

  const handleLanguageChange = (newLanguage: string) => {
    draftStore.stage(pageId, block.id, {
      ...block.content,
      language: newLanguage,
    })
  }

  const languages = ['javascript', 'html', 'css', 'python', 'rust', 'go', 'markdown']

  return (
    <div className="w-full flex flex-col gap-2 border border-gray-250 dark:border-gray-800 rounded-xl overflow-hidden my-3 select-none bg-gray-50/50 dark:bg-gray-900/10">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-250 dark:border-gray-800 bg-gray-100/50 dark:bg-gray-950/20 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-500">Code Sandbox</span>
          <select
            value={language}
            onChange={(e) => handleLanguageChange(e.target.value)}
            className="bg-transparent border border-gray-250 dark:border-gray-800 rounded px-2 py-0.5 outline-none text-[11px] font-medium text-gray-600 dark:text-gray-300"
          >
            {languages.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
        </div>

        {/* Sandbox Preview Toggle (for html/css/js) */}
        {(language === 'html' || language === 'javascript') && (
          <div className="flex items-center gap-2">
            {showPreview && (
              <button
                type="button"
                onClick={() => setPreviewCode(localCode)}
                className="px-2 py-0.5 rounded text-[11px] font-semibold border border-gray-200 dark:border-gray-850 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition-all cursor-pointer"
                title="Force reload preview"
              >
                Run Code
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className={`px-2 py-0.5 rounded transition-all font-semibold cursor-pointer ${
                showPreview
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border border-gray-250 dark:border-gray-800 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {showPreview ? 'Show Code' : 'Preview Sandbox'}
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col md:flex-row gap-0.5 items-stretch min-h-[150px]">
        {/* Code Input */}
        {(!showPreview || (language !== 'html' && language !== 'javascript')) && (
          <textarea
            value={localCode}
            onChange={(e) => setLocalCode(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => {
              setIsFocused(false)
              // Ensure we stage immediately on blur
              if (localCode !== code) {
                draftStore.stage(pageId, block.id, {
                  ...block.content,
                  code: localCode,
                })
              }
            }}
            placeholder="// Write code here..."
            className="w-full flex-1 p-4 font-mono text-sm bg-transparent border-none outline-none focus:ring-0 resize-y text-gray-700 dark:text-gray-300 min-h-[150px]"
            spellCheck={false}
          />
        )}

        {/* Sandbox Live Preview Pane */}
        {showPreview && (language === 'html' || language === 'javascript') && (
          <div className="flex-1 w-full bg-white dark:bg-gray-950 min-h-[150px] p-4 relative">
            <iframe
              title="Sandbox Preview"
              srcDoc={
                language === 'html'
                  ? previewCode
                  : `<html><head><script>${previewCode}</script></head><body><div id="output">Sandbox Running...</div></body></html>`
              }
              className="w-full h-full border-none bg-transparent"
              sandbox="allow-scripts"
            />
          </div>
        )}
      </div>
    </div>
  )
}

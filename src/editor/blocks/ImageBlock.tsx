import { useEffect, useMemo, useState } from 'react'
import type { BlockProps } from './ParagraphBlock'
import { useDraftStore } from '../contexts/storeContexts'
import { encryptContent, decryptContent } from '../../storage/crypto/cryptoBox'
import { buildMediaServerTargets, chooseFirstServedUrl, resolveMediaServerLists, type MediaServerKind, type MediaServerTarget } from './mediaServers'
import { createBlossomClient, createBrowserSigner } from './nostrSigner'

export function ImageBlock({ block, pageId }: BlockProps) {
  const draftStore = useDraftStore()
  const cek = draftStore.cek

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mediaServers, setMediaServers] = useState({ blossom: [] as string[], nip96: [] as string[] })
  const [decryptedSrc, setDecryptedSrc] = useState<string | null>(null)
  const [decrypting, setDecrypting] = useState(false)

  const url = block.content.url as string | undefined
  const caption = (block.content.caption as string) || ''
  const mirrorUrls = useMemo(() => {
    const stored = block.content.mirrorUrls
    if (!Array.isArray(stored)) return []
    return stored.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
  }, [block.content.mirrorUrls])

  const uploadedFrom = useMemo(
    () => [url, ...mirrorUrls].filter((value): value is string => typeof value === 'string' && value.trim().length > 0),
    [url, mirrorUrls]
  )

  useEffect(() => {
    let active = true
    void resolveMediaServerLists().then((lists) => {
      if (!active) return
      setMediaServers(lists)
    })
    return () => {
      active = false
    }
  }, [])

  // Automatically decrypt image if url is present
  useEffect(() => {
    const urls = uploadedFrom
    if (urls.length === 0) {
      setDecryptedSrc(null)
      return
    }

    let active = true
    setDecrypting(true)
    setError(null)

    async function fetchAndDecrypt() {
      try {
        if (!cek) {
          throw new Error('No shared CEK available to decrypt this image')
        }

        const controller = new AbortController()

        const parseCandidate = async (candidateUrl: string) => {
          const res = await fetch(candidateUrl, { signal: controller.signal })
          if (!res.ok) {
            throw new Error(`Failed to download encrypted image (HTTP ${res.status})`)
          }

          const ciphertext = await res.text()
          const plaintext = decryptContent(ciphertext, cek)

          let parsed: { mimeType: string; data: string }
          try {
            parsed = JSON.parse(plaintext)
          } catch {
            // If it is not JSON, assume raw base64 data
            parsed = { mimeType: 'image/png', data: plaintext }
          }

          return parsed.data.startsWith('data:') ? parsed.data : `data:${parsed.mimeType};base64,${parsed.data}`
        }

        const firstServed = await Promise.any(
          urls.map(async (candidateUrl) => {
            const value = await parseCandidate(candidateUrl)
            controller.abort()
            return value
          })
        )
        if (active) {
          setDecryptedSrc(firstServed)
        }
      } catch (err: any) {
        if (active) {
          const message = err instanceof AggregateError && Array.isArray(err.errors) && err.errors.length > 0
            ? err.errors[0] instanceof Error
              ? err.errors[0].message
              : String(err.errors[0])
            : err.message || String(err)
          setError(message)
        }
      } finally {
        if (active) {
          setDecrypting(false)
        }
      }
    }

    void fetchAndDecrypt()

    return () => {
      active = false
    }
  }, [uploadedFrom, cek])

  async function uploadToBlossom(target: string, blob: Blob): Promise<string> {
    const client = createBlossomClient(target)
    const descriptor = await client.uploadBlob(blob, blob.type || 'application/octet-stream')
    return descriptor.url
  }

  async function uploadToNip96(target: string, blob: Blob, now: number): Promise<string> {
    const configUrl = `${target.replace(/\/$/, '')}/.well-known/nostr/nip96.json`
    const configRes = await fetch(configUrl)
    if (!configRes.ok) {
      throw new Error(`Failed to load NIP-96 configuration from ${configUrl}`)
    }
    const config = await configRes.json()
    const apiUrl = config.api_url
    if (!apiUrl) {
      throw new Error('NIP-96 config is missing api_url')
    }

    const authEventTemplate = {
      kind: 27235,
      created_at: now,
      tags: [
        ['u', apiUrl],
        ['method', 'POST'],
      ],
      content: 'Upload encrypted grid34 media file via NIP-96',
    }

    const signedEvent = await createBrowserSigner().signEvent(authEventTemplate)
    const base64Auth = btoa(JSON.stringify(signedEvent))

    const formData = new FormData()
    formData.append('file', blob, 'encrypted_image.txt')

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Nostr ${base64Auth}`,
      },
      body: formData,
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`NIP-96 upload failed (${response.status}): ${errText}`)
    }

    const resData = await response.json()
    if (resData.status === 'success' && resData.nip96?.url) {
      return resData.nip96.url
    }
    if (resData.url) {
      return resData.url
    }
    throw new Error('Upload succeeded but no file URL was returned by server.')
  }

  // Handle uploading of file
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    setError(null)

    try {
      if (!cek) {
        throw new Error('CEK not available. Ensure you have an active workspace key.')
      }

      // 1. Read file as base64
      const reader = new FileReader()
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string
          resolve(result)
        };
        reader.onerror = reject
      })
      reader.readAsDataURL(file)
      const dataUrl = await base64Promise

      // 2. Encrypt file contents
      const payload = JSON.stringify({
        mimeType: file.type,
        data: dataUrl,
      })
      const ciphertext = encryptContent(payload, cek)
      const blob = new Blob([ciphertext], { type: 'text/plain' })

      const resolvedTargets = buildMediaServerTargets(mediaServers, {
        kind: 'blossom',
        url: 'https://blossom.primal.net',
      })
      const uploadTargets = resolvedTargets.length > 0
        ? resolvedTargets
        : [{ kind: 'blossom' as MediaServerKind, url: 'https://blossom.primal.net' }]

      const settled = await Promise.allSettled(
        uploadTargets.map(async (target: MediaServerTarget) => {
          if (target.kind === 'blossom') {
            return await uploadToBlossom(target.url, blob)
          }
          return await uploadToNip96(target.url, blob, Math.floor(Date.now() / 1000))
        })
      )

      const successfulUrls = settled
        .filter((result): result is PromiseFulfilledResult<string> => result.status === 'fulfilled')
        .map((result) => result.value)

      if (successfulUrls.length === 0) {
        const failureMessages = settled
          .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
          .map((result) => result.reason instanceof Error ? result.reason.message : String(result.reason))
        throw new Error(failureMessages[0] || 'Upload failed on all media servers.')
      }

      const mirroredUrls = Array.from(new Set(successfulUrls))
      const finalFileUrl = chooseFirstServedUrl(mirroredUrls)

      // 4. Update block with the URL
      draftStore.stage(pageId, block.id, {
        ...block.content,
        type: 'image',
        url: finalFileUrl,
        mirrorUrls: mirroredUrls,
        caption: file.name,
      })

    } catch (err: any) {
      setError(err.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleClear = () => {
    draftStore.stage(pageId, block.id, {
      ...block.content,
      type: 'image',
      url: undefined,
      mirrorUrls: [],
      caption: '',
    })
    setDecryptedSrc(null)
    setError(null)
  }

  const handleSaveCaption = (newCaption: string) => {
    draftStore.stage(pageId, block.id, {
      ...block.content,
      type: 'image',
      caption: newCaption,
    })
  }

  if (url && decryptedSrc) {
    return (
      <div className="w-full flex flex-col gap-2 p-1 group/image select-none">
        <div className="relative rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800 shadow-sm max-w-2xl mx-auto bg-gray-50/50">
          <img
            src={decryptedSrc}
            alt={caption}
            className="w-full h-auto object-contain max-h-[450px]"
          />
          <button
            type="button"
            onClick={handleClear}
            className="absolute top-2 right-2 bg-white/80 dark:bg-black/80 hover:bg-white dark:hover:bg-black p-1.5 rounded-lg shadow text-gray-500 hover:text-red-500 transition-colors duration-150 cursor-pointer"
            title="Remove Image"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
        <input
          type="text"
          value={caption}
          onChange={(e) => handleSaveCaption(e.target.value)}
          placeholder="Add a caption..."
          className="text-center text-xs text-gray-400 dark:text-gray-500 bg-transparent border-none outline-none focus:ring-0 w-full"
        />
      </div>
    )
  }

  return (
    <div className="w-full flex flex-col gap-4 border border-dashed border-gray-250 dark:border-gray-800 rounded-xl p-6 bg-gray-50/20 dark:bg-gray-900/10">
      <div className="flex flex-col gap-1 text-center items-center justify-center">
        <span className="text-3xl">🖼️</span>
        <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300">Upload Encrypted Image</h4>
        <p className="text-xs text-gray-400 max-w-sm">
          Images are NIP-44 encrypted using the shared CEK in your browser before uploading to the server.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-lg mx-auto w-full">
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Media Servers</label>
          {mediaServers.blossom.length > 0 || mediaServers.nip96.length > 0 ? (
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-3 py-2 text-xs text-gray-600 dark:text-gray-300">
              <div className="font-semibold text-gray-800 dark:text-gray-100">Using your Nostr media server lists</div>
              <div className="mt-1">
                Blossom: {mediaServers.blossom.length > 0 ? mediaServers.blossom.join(', ') : 'none'}
              </div>
              <div className="mt-1">
                NIP-96: {mediaServers.nip96.length > 0 ? mediaServers.nip96.join(', ') : 'none'}
              </div>
              <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">
                The image will upload to every available server and open from the first mirror that responds.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-3 py-2 text-xs text-gray-600 dark:text-gray-300">
              No media server list was found in your Nostr environment. The uploader will fall back to the configured Blossom server.
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center justify-center gap-2">
        {loading || decrypting ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 font-semibold">
            <svg className="animate-spin h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>{decrypting ? 'Decrypting Image...' : 'Encrypting & Uploading...'}</span>
          </div>
        ) : (
          <label className="inline-flex items-center justify-center rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 transition-all cursor-pointer shadow-sm">
            <span>Select Image</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleUpload}
            />
          </label>
        )}

        {error && (
          <div className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 px-3 py-1.5 rounded-lg max-w-md text-center mt-2 border border-red-100 dark:border-red-950/50">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}

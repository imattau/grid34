import { useEffect, useState } from 'react'
import { DbViewStoreContext, DraftStoreContext, RepoStoreContext } from './editor/contexts/storeContexts'
import { PageEditor } from './editor/components/PageEditor'
import { PageTree } from './editor/components/PageTree'
import { createWorkspace, type Workspace } from './app/workspace'
import './app/workspace.css'

function LoadingShell() {
  return (
    <main className="workspace-shell workspace-shell--loading">
      <section className="loading-card" aria-live="polite">
        <p className="eyebrow">grid34</p>
        <h1>Booting workspace</h1>
        <p>Connecting the editor, draft pipeline, and table view model.</p>
      </section>
    </main>
  )
}

interface NostrProfile {
  pubkey: string
  name: string
  picture: string
}

function WorkspaceView({ workspace }: { workspace: Workspace }) {
  const [selectedPageId, setSelectedPageId] = useState<string | null>(workspace.selectedPageId)
  const [user, setUser] = useState<NostrProfile | null>(null)
  const [showUserMenu, setShowUserMenu] = useState(false)

  useEffect(() => {
    setSelectedPageId(workspace.selectedPageId)
  }, [workspace])

  useEffect(() => {
    const stored = localStorage.getItem('nostr_user')
    if (stored) {
      try {
        setUser(JSON.parse(stored))
      } catch {}
    }
  }, [])

  async function handleLogin() {
    if (typeof window === 'undefined' || !(window as any).nostr) {
      alert('NIP-07 Nostr extension (e.g. Alby, nos2x) not found.')
      return
    }
    try {
      const pubkey = await (window as any).nostr.getPublicKey()
      let name = pubkey.substring(0, 8) + '...'
      let picture = `https://robohash.org/${pubkey}.png?set=set4`

      try {
        const res = await fetch(`https://api.nostr.band/v0/metadata/${pubkey}`)
        const json = await res.json()
        if (json && json.content) {
          const meta = JSON.parse(json.content)
          if (meta.name) name = meta.name
          if (meta.picture) picture = meta.picture
        }
      } catch (err) {
        console.warn('Failed to fetch Nostr metadata, using fallback details', err)
      }

      const profile: NostrProfile = { pubkey, name, picture }
      setUser(profile)
      localStorage.setItem('nostr_user', JSON.stringify(profile))
    } catch (err) {
      console.error('NIP-07 login error', err)
    }
  }

  function handleLogout() {
    setUser(null)
    localStorage.removeItem('nostr_user')
  }

  return (
    <RepoStoreContext.Provider value={workspace.repoStore}>
      <DraftStoreContext.Provider value={workspace.draftStore}>
        <DbViewStoreContext.Provider value={workspace.dbViewStore}>
          <main className="workspace-shell">
            <div className="workspace-frame">
              <aside className="workspace-sidebar">
                {/* Notion Workspace Switcher / Profile selector */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="sidebar-control sidebar-control--profile"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <img
                        src={user ? user.picture : 'https://robohash.org/guest.png?set=set4'}
                        alt="Avatar"
                        className="w-6 h-6 rounded-full border border-gray-200/80 object-cover flex-shrink-0"
                        onError={(e) => {
                          e.currentTarget.src = `https://robohash.org/guest.png?set=set4`
                        }}
                      />
                      <div className="sidebar-control__label min-w-0">
                        <span className="text-xs font-semibold text-gray-800 truncate">
                          {user ? user.name : 'Guest User'}
                        </span>
                        <span className="sidebar-control__meta truncate">
                          {user ? `Workspace (npub...${user.pubkey.substring(0, 4)})` : 'Local Workspace'}
                        </span>
                      </div>
                    </div>
                    <svg className="sidebar-control__icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {showUserMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                        {user ? (
                          <button
                            type="button"
                            onClick={() => {
                              handleLogout()
                              setShowUserMenu(false)
                            }}
                            className="sidebar-control sidebar-control--menuitem sidebar-control--danger"
                          >
                            <svg className="sidebar-control__icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                            Sign out of Nostr
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              handleLogin()
                              setShowUserMenu(false)
                            }}
                            className="sidebar-control sidebar-control--menuitem"
                          >
                            <span className="text-yellow-500 text-[10px] leading-none">⚡</span>
                            <span>Connect Nostr (NIP-07)</span>
                          </button>
                        )}
                        <div className="border-t border-gray-100 mt-1.5 pt-2 px-2 pb-1.5">
                          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5 px-0.5">Workspace Key (CEK)</span>
                          <CekKeysManager cek={workspace.cek} />
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <div className="sidebar-section mt-1">
                  <div className="sidebar-section__header">
                    <span>Pages</span>
                  </div>
                  <PageTree selectedPageId={selectedPageId} onSelectPage={setSelectedPageId} />
                </div>



                <div className="sidebar-footer">
                  <button
                    type="button"
                    className="sidebar-control sidebar-control--action"
                    onClick={() => void workspace.flushDrafts()}
                  >
                    <svg className="sidebar-control__icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18" />
                    </svg>
                    <span>Flush drafts</span>
                  </button>
                </div>
              </aside>

              <section className="workspace-main" aria-label="Workspace canvas">
                <div className="workspace-toolbar">
                  <p className="workspace-path">grid34 / connected editor</p>
                  <p className="workspace-status">Local draft checkpointing enabled</p>
                </div>

                <div className="page-shell">
                  {selectedPageId ? (
                    <PageEditor pageId={selectedPageId} />
                  ) : (
                    <section className="locked-page" aria-label="Empty workspace">
                      <p className="page-editor__breadcrumbs">Workspace</p>
                      <h2>No page selected</h2>
                      <p>Create a page from the sidebar to start editing.</p>
                    </section>
                  )}
                </div>
              </section>
            </div>
          </main>
        </DbViewStoreContext.Provider>
      </DraftStoreContext.Provider>
    </RepoStoreContext.Provider>
  )
}

function CekKeysManager({ cek }: { cek: Uint8Array }) {
  const [showKey, setShowKey] = useState(false)
  const [importHex, setImportHex] = useState('')
  const [copied, setCopied] = useState(false)

  const hexKey = Array.from(cek, (b) => b.toString(16).padStart(2, '0')).join('')

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(hexKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      alert('Failed to copy key to clipboard')
    }
  }

  const handleImport = () => {
    const cleanHex = importHex.trim()
    if (cleanHex.length !== 64) {
      alert('Key must be exactly 64 characters (32 bytes) hex string.')
      return
    }

    try {
      const bytes = new Uint8Array(32)
      for (let i = 0; i < 32; i++) {
        bytes[i] = parseInt(cleanHex.slice(i * 2, i * 2 + 2), 16)
      }

      localStorage.setItem('grid34_workspace_cek', JSON.stringify(Array.from(bytes)))
      alert('Workspace Encryption Key updated. Reloading page...')
      window.location.reload()
    } catch (err) {
      alert('Invalid hex format')
    }
  }

  return (
    <div className="flex flex-col gap-2 p-2.5 bg-gray-50/50 rounded-xl border border-gray-250/10 text-xs">
      <div className="flex flex-col gap-1">
        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Current CEK (hex)</span>
        <div className="flex items-center gap-1">
          <span className="font-mono bg-white border border-gray-200 rounded px-1.5 py-1.5 flex-1 truncate select-all text-[10px] text-gray-600">
            {showKey ? hexKey : '••••••••••••••••••••••••••••••••'}
          </span>
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
            title={showKey ? 'Hide key' : 'Show key'}
          >
            {showKey ? (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
            title="Copy key"
          >
            {copied ? (
              <span className="text-green-600 text-[10px] font-bold">✓</span>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
              </svg>
            )}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1 mt-1">
        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Import/Set CEK (hex)</span>
        <div className="flex gap-1.5">
          <input
            type="text"
            className="bg-white border border-gray-250 rounded px-1.5 py-1 flex-1 min-w-0 outline-none focus:ring-1 focus:ring-gray-300 font-mono text-[9px] text-gray-600"
            placeholder="64-char hex key"
            value={importHex}
            onChange={(e) => setImportHex(e.target.value)}
          />
          <button
            type="button"
            onClick={handleImport}
            className="px-2 py-1 bg-gray-900 text-white rounded hover:bg-gray-800 font-medium transition-colors flex-shrink-0 text-[10px]"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let disposed = false

    void createWorkspace()
      .then((nextWorkspace) => {
        if (disposed) {
          nextWorkspace.destroy()
          return
        }

        setWorkspace(nextWorkspace)
      })
      .catch((cause: unknown) => {
        if (disposed) return
        setError(cause instanceof Error ? cause.message : String(cause))
      })

    return () => {
      disposed = true
    }
  }, [])

  useEffect(() => {
    return () => {
      workspace?.destroy()
    }
  }, [workspace])

  if (error) {
    return (
      <main className="workspace-shell workspace-shell--loading">
        <section className="loading-card loading-card--error">
          <p className="eyebrow">grid34</p>
          <h1>Workspace failed to start</h1>
          <p>{error}</p>
        </section>
      </main>
    )
  }

  if (!workspace) {
    return <LoadingShell />
  }

  return <WorkspaceView workspace={workspace} />
}

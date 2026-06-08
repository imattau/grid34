import { useEffect, useState } from 'react'
import { DbViewStoreContext, DraftStoreContext, RepoStoreContext } from './editor/contexts/storeContexts'
import { PageEditor } from './editor/components/PageEditor'
import { PageTree } from './editor/components/PageTree'
import { createDemoWorkspace, type DemoWorkspace } from './app/demoWorkspace'
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

function WorkspaceView({ workspace }: { workspace: DemoWorkspace }) {
  const [selectedPageId, setSelectedPageId] = useState(workspace.selectedPageId)
  const [user, setUser] = useState<NostrProfile | null>(null)

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
                <div className="workspace-brand">
                  <p className="eyebrow">grid34</p>
                  <h1>Workspace</h1>
                  <p>Pages, drafts, and database views in one place.</p>
                </div>

                <div className="sidebar-profile">
                  {user ? (
                    <div className="flex items-center justify-between gap-2 p-2 bg-white/50 border border-[var(--color-border)] rounded-lg shadow-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <img
                          src={user.picture}
                          alt={user.name}
                          className="w-8 h-8 rounded-full border border-gray-100 object-cover flex-shrink-0"
                          onError={(e) => {
                            e.currentTarget.src = `https://robohash.org/${user.pubkey}.png?set=set4`
                          }}
                        />
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-semibold text-gray-800 truncate">{user.name}</span>
                          <span className="text-[9px] text-gray-400 font-mono truncate">{user.pubkey.substring(0, 8)}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="text-xs text-gray-400 hover:text-red-500 hover:bg-gray-100/80 p-1.5 rounded transition-colors"
                        title="Log out"
                      >
                        <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleLogin}
                      className="w-full flex items-center justify-center gap-2 py-1.5 px-3 border border-[var(--color-border)] hover:border-[var(--color-border-strong)] rounded-lg text-xs font-semibold text-gray-600 hover:text-gray-900 hover:bg-white/50 transition-all shadow-sm active:scale-[0.98]"
                    >
                      <span className="text-yellow-500">⚡</span> Connect Nostr (NIP-07)
                    </button>
                  )}
                </div>

                <div className="sidebar-section">
                  <div className="sidebar-section__header">
                    <span>Pages</span>
                  </div>
                  <PageTree selectedPageId={selectedPageId} onSelectPage={setSelectedPageId} />
                </div>

                <div className="sidebar-footer">
                  <button type="button" className="flush-button" onClick={() => void workspace.flushDrafts()}>
                    Flush drafts
                  </button>
                </div>
              </aside>

              <section className="workspace-main" aria-label="Workspace canvas">
                <div className="workspace-toolbar">
                  <p className="workspace-path">grid34 / connected editor</p>
                  <p className="workspace-status">Local draft checkpointing enabled</p>
                </div>

                <div className="page-shell">
                  <PageEditor pageId={selectedPageId} />
                </div>
              </section>
            </div>
          </main>
        </DbViewStoreContext.Provider>
      </DraftStoreContext.Provider>
    </RepoStoreContext.Provider>
  )
}

export default function App() {
  const [workspace, setWorkspace] = useState<DemoWorkspace | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let disposed = false

    void createDemoWorkspace()
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

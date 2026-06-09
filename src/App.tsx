import { useEffect, useState } from 'react'
import { DbViewStoreContext, DraftStoreContext, RepoStoreContext } from './editor/contexts/storeContexts'
import { PageEditor } from './editor/components/PageEditor'
import { PageTree } from './editor/components/PageTree'
import { createWorkspace, type Workspace } from './app/workspace'
import { SimplePool } from 'nostr-tools/pool'
import {
  loadAccessibleWorkspaces,
  loadPageCollaborators,
  loadWorkspaceOwnerPubkey,
  saveAccessibleWorkspace,
  saveWorkspaceOwnerPubkey,
} from './editor/contacts/pageCollaborators'
import { loadWorkspaceAccessWorkspaces, publishWorkspaceAccessSnapshot } from './editor/contacts/workspaceAccess'
import './app/workspace.css'
import { syncWorkspacesFromNostr, saveWorkspacesToNostr, type WorkspacesConfigPayload } from './app/nostrConfig'
import {
  getVisibleWorkspaceIds,
  loadActiveWorkspaceId,
  loadDeletedWorkspaces,
  loadWorkspaceIds,
  markWorkspaceDeleted,
  normalizeActiveWorkspaceId,
  purgeWorkspaceLocalData,
  restoreWorkspace,
  mergeDeletedWorkspaceRecords,
  saveWorkspaceIds,
  setActiveWorkspaceId,
  toDeletedWorkspaceRecordMap,
} from './app/workspaceLifecycle'
import type { EventTemplate, NostrEvent } from 'nostr-tools/pure'

const DEFAULT_RELAY_URLS = ['wss://nos.lol', 'wss://relay.damus.io', 'wss://relay.nostr.band']

function loadStoredUser(): NostrProfile | null {
  if (typeof window === 'undefined') return null
  const stored = sessionStorage.getItem('nostr_user')
  if (!stored) return null
  try {
    return JSON.parse(stored) as NostrProfile
  } catch {
    return null
  }
}

function loadStoredRelays(): string[] {
  if (typeof window === 'undefined') return []
  const stored = sessionStorage.getItem('nostr_relays')
  if (!stored) return []
  try {
    const parsed = JSON.parse(stored) as string[]
    return Array.isArray(parsed) ? parsed.filter((relay) => typeof relay === 'string' && relay.trim().length > 0) : []
  } catch {
    return []
  }
}

export function applyWorkspaceConfigPayload(payload: WorkspacesConfigPayload): boolean {
  const deletedChanged = payload.deletedWorkspaces ? mergeDeletedWorkspaceRecords(payload.deletedWorkspaces) : false
  const currentWorkspaces = getVisibleWorkspaceIds(loadWorkspaceIds())
  const nextWorkspaces = getVisibleWorkspaceIds([...currentWorkspaces, ...payload.workspaces])
  const currentActive = loadActiveWorkspaceId()
  const nextActive = normalizeActiveWorkspaceId(payload.activeRepoId ?? currentActive, nextWorkspaces)

  let changed = false
  if (nextWorkspaces.length !== currentWorkspaces.length || nextWorkspaces.some((repoId, index) => repoId !== currentWorkspaces[index])) {
    saveWorkspaceIds(nextWorkspaces)
    changed = true
  }

  if (currentActive !== nextActive) {
    setActiveWorkspaceId(nextActive)
    changed = true
  }

  return changed || deletedChanged
}

function LoadingShell() {
  return (
    <main className="workspace-shell workspace-shell--loading">
      <section className="loading-card flex flex-col md:flex-row gap-8 items-center md:items-stretch justify-between" aria-live="polite">
        <div className="flex-1 flex flex-col justify-center min-w-0 text-left">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Booting workspace</h1>
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">Connecting the editor, draft pipeline, and table view model.</p>
        </div>

        <div className="hidden md:block w-px bg-gray-200/60 dark:bg-gray-800" />

        <div className="flex-shrink-0 flex flex-col items-center justify-center gap-2.5 p-4 md:p-6 bg-gray-50/50 dark:bg-gray-800/10 rounded-2xl border border-gray-100/50 dark:border-gray-850/20 min-w-[140px]">
          <img src="/logo.png" alt="grid34 logo" className="w-20 h-20 rounded-2xl shadow-md hover:scale-105 transition-transform duration-300" />
          <span className="font-mono text-sm font-bold tracking-widest text-gray-800 dark:text-gray-200 uppercase mt-1">grid34</span>
        </div>
      </section>
    </main>
  )
}

function GuestShell({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string
  message: string
  actionLabel: string
  onAction: () => void
}) {
  return (
    <main className="workspace-shell workspace-shell--loading">
      <section className="loading-card flex flex-col md:flex-row gap-8 items-center md:items-stretch justify-between" aria-live="polite">
        <div className="flex-1 flex flex-col justify-center min-w-0 text-left">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">{title}</h1>
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{message}</p>
          <div className="mt-6">
            <button
              type="button"
              onClick={onAction}
              className="inline-flex items-center justify-center rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 transition-all cursor-pointer shadow-sm"
            >
              {actionLabel}
            </button>
          </div>
        </div>

        <div className="hidden md:block w-px bg-gray-200/60 dark:bg-gray-800" />

        <div className="flex-shrink-0 flex flex-col items-center justify-center gap-2.5 p-4 md:p-6 bg-gray-50/50 dark:bg-gray-800/10 rounded-2xl border border-gray-100/50 dark:border-gray-850/20 min-w-[140px]">
          <img src="/logo.png" alt="grid34 logo" className="w-20 h-20 rounded-2xl shadow-md hover:scale-105 transition-transform duration-300" />
          <span className="font-mono text-sm font-bold tracking-widest text-gray-800 dark:text-gray-200 uppercase mt-1">grid34</span>
        </div>
      </section>
    </main>
  )
}

interface NostrProfile {
  pubkey: string
  name: string
  picture: string
}

type NostrBrowserApi = {
  getPublicKey?: () => Promise<string>
  getRelays?: () => Promise<Record<string, unknown>>
  signEvent?: (template: EventTemplate) => Promise<NostrEvent>
  nip04?: {
    encrypt?: (pubkey: string, plaintext: string) => Promise<string>
    decrypt?: (pubkey: string, ciphertext: string) => Promise<string>
  }
  getBlossomServers?: () => Promise<string[]>
  getNip96Servers?: () => Promise<string[]>
  getMediaServers?: () => Promise<string[] | { blossom?: string[]; nip96?: string[] }>
}

function getNostrApi(): NostrBrowserApi | undefined {
  return (globalThis as typeof globalThis & { nostr?: NostrBrowserApi }).nostr
}

export async function requestNostrPermissions(pubkey: string): Promise<void> {
  const nostr = getNostrApi()
  if (!nostr) return

  if (nostr.signEvent) {
    try {
      await nostr.signEvent({
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['client', 'grid34']],
        content: 'grid34 login permission check',
      })
    } catch (error) {
      console.warn('NIP-07 signEvent preflight failed', error)
    }
  }

  if (nostr.nip04?.encrypt && nostr.nip04?.decrypt) {
    try {
      const probe = `grid34-login:${Date.now()}`
      const encrypted = await nostr.nip04.encrypt(pubkey, probe)
      await nostr.nip04.decrypt(pubkey, encrypted)
    } catch (error) {
      console.warn('NIP-07 nip04 preflight failed', error)
    }
  }

  if (nostr.getRelays) {
    try {
      await nostr.getRelays()
    } catch (error) {
      console.warn('NIP-07 relay preflight failed', error)
    }
  }

  if (nostr.getBlossomServers) {
    try {
      await nostr.getBlossomServers()
    } catch (error) {
      console.warn('NIP-07 blossom server preflight failed', error)
    }
  }

  if (nostr.getNip96Servers) {
    try {
      await nostr.getNip96Servers()
    } catch (error) {
      console.warn('NIP-07 NIP-96 server preflight failed', error)
    }
  }

  if (nostr.getMediaServers) {
    try {
      await nostr.getMediaServers()
    } catch (error) {
      console.warn('NIP-07 media server preflight failed', error)
    }
  }
}

function WorkspaceView({ workspace }: { workspace: Workspace }) {
  const [selectedPageId, setSelectedPageId] = useState<string | null>(workspace.selectedPageId)
  const [checkpointStatus, setCheckpointStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [user, setUser] = useState<NostrProfile | null>(() => loadStoredUser())
  const [relayUrls, setRelayUrls] = useState<string[]>(() => {
    const stored = loadStoredRelays()
    return stored.length > 0 ? stored : DEFAULT_RELAY_URLS
  })
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showWorkspaces, setShowWorkspaces] = useState(() => {
    if (typeof window === 'undefined') return true
    return sessionStorage.getItem('grid34_workspaces_collapsed') !== 'true'
  })
  const [accessibleWorkspaceIds, setAccessibleWorkspaceIds] = useState<string[]>([])
  const [workspaceOwnerPubkey, setWorkspaceOwnerPubkey] = useState<string | null>(() => loadWorkspaceOwnerPubkey(workspace.repoId))
  const [accessHydrated, setAccessHydrated] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light'
    const stored = localStorage.getItem('grid34_theme')
    if (stored === 'dark' || stored === 'light') return stored
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark'
    return 'light'
  })

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    localStorage.setItem('grid34_theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))
  }

  useEffect(() => {
    setSelectedPageId(workspace.selectedPageId)
  }, [workspace])

  useEffect(() => {
    setWorkspaceOwnerPubkey(loadWorkspaceOwnerPubkey(workspace.repoId))
  }, [workspace.repoId])

  useEffect(() => {
    if (!user?.pubkey) return
    if (import.meta.env.VITEST) {
      const cached = loadAccessibleWorkspaces(user.pubkey)
      const ownerKey = loadWorkspaceOwnerPubkey(workspace.repoId)
      const next = getVisibleWorkspaceIds(ownerKey === user.pubkey ? Array.from(new Set([...cached, workspace.repoId])) : cached)
      setAccessibleWorkspaceIds(next)
      setAccessHydrated(true)
      return
    }

    let cancelled = false
    const cached = loadAccessibleWorkspaces(user.pubkey)
    const seeded = getVisibleWorkspaceIds(Array.from(new Set([...cached, workspace.repoId])))
    setAccessibleWorkspaceIds(seeded)
    saveAccessibleWorkspace(user.pubkey, workspace.repoId)
    setAccessHydrated(false)

    void loadWorkspaceAccessWorkspaces(user.pubkey, relayUrls)
      .then((snapshots) => {
        if (cancelled) return

        const matchingWorkspace = snapshots.find((snapshot) => snapshot.workspaceId === workspace.repoId)
        if (matchingWorkspace?.ownerPubkey) {
          setWorkspaceOwnerPubkey(matchingWorkspace.ownerPubkey)
          saveWorkspaceOwnerPubkey(workspace.repoId, matchingWorkspace.ownerPubkey)
        }

        const next = getVisibleWorkspaceIds([...seeded, ...snapshots.map((snapshot) => snapshot.workspaceId)])
        setAccessibleWorkspaceIds(next)
        for (const workspaceId of next) {
          saveAccessibleWorkspace(user.pubkey, workspaceId)
        }
        setAccessHydrated(true)
      })
      .catch((error) => {
        if (cancelled) return
        console.warn('Failed to load workspace access snapshots', error)
        setAccessHydrated(true)
      })

    return () => {
      cancelled = true
    }
  }, [relayUrls, user?.pubkey, workspace.repoId])

  useEffect(() => {
    if (!user?.pubkey || import.meta.env.VITEST) return

    const deletedRecords = loadDeletedWorkspaces()
    const dueRecords = deletedRecords.filter((record) => record.purgeAt <= Date.now())
    if (dueRecords.length === 0) return

    const visibleWorkspaces = getVisibleWorkspaceIds(loadWorkspaceIds())
    const nextActiveRepoId = normalizeActiveWorkspaceId(loadActiveWorkspaceId(), visibleWorkspaces)
    if (loadActiveWorkspaceId() !== nextActiveRepoId) {
      setActiveWorkspaceId(nextActiveRepoId)
    }

    for (const record of dueRecords) {
      purgeWorkspaceLocalData(record.repoId)
    }

    void saveWorkspacesToNostr(
      user.pubkey,
      visibleWorkspaces,
      nextActiveRepoId,
      relayUrls,
      toDeletedWorkspaceRecordMap(deletedRecords)
    )
  }, [relayUrls, user?.pubkey, workspace.repoId])

  useEffect(() => {
    if (!user?.pubkey) return
    if (import.meta.env.VITEST) return
    let cancelled = false

    void syncWorkspacesFromNostr(user.pubkey, relayUrls)
      .then((payload) => {
        if (cancelled || !payload) return
        const changed = applyWorkspaceConfigPayload(payload)
        if (changed) {
          window.location.reload()
        }
      })
      .catch((err) => {
        console.warn('Background workspaces config sync failed:', err)
      })

    return () => {
      cancelled = true
    }
  }, [user?.pubkey, relayUrls])

  const selectedPageCollaborators = selectedPageId ? loadPageCollaborators(workspace.repoId, selectedPageId) : []
  const canViewWorkspace =
    user !== null &&
    accessHydrated &&
    !loadDeletedWorkspaces().some((record) => record.repoId === workspace.repoId) &&
    (user.pubkey === workspaceOwnerPubkey ||
      accessibleWorkspaceIds.includes(workspace.repoId) ||
      selectedPageCollaborators.includes(user.pubkey))

  useEffect(() => {
    const idleCheckpointMs = 5 * 60 * 1000
    let checkpointTimer: ReturnType<typeof setTimeout> | undefined

    const scheduleCheckpoint = () => {
      if (checkpointTimer) clearTimeout(checkpointTimer)
      checkpointTimer = setTimeout(() => {
        void workspace.flushDrafts()
      }, idleCheckpointMs)
    }

    const subscription = workspace.draftStore.drafts$.subscribe((drafts) => {
      if (Object.keys(drafts).length > 0) {
        scheduleCheckpoint()
      }
    })

    const handleVisibilityChange = () => {
      if (document.hidden) {
        void workspace.checkpoint()
      }
    }

    const handleLeave = () => {
      void workspace.checkpoint()
    }

    window.addEventListener('beforeunload', handleLeave)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      subscription.unsubscribe()
      if (checkpointTimer) clearTimeout(checkpointTimer)
      window.removeEventListener('beforeunload', handleLeave)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [workspace])

  useEffect(() => {
    if (checkpointStatus !== 'saved' && checkpointStatus !== 'error') return
    const timer = setTimeout(() => setCheckpointStatus('idle'), 2500)
    return () => clearTimeout(timer)
  }, [checkpointStatus])

  async function handleCheckpoint() {
    try {
      setCheckpointStatus('saving')
      await workspace.checkpoint()
      setCheckpointStatus('saved')
    } catch (error) {
      console.error('Checkpoint failed', error)
      setCheckpointStatus('error')
    }
  }

  async function handleLogin() {
    const nostr = getNostrApi()
    if (typeof window === 'undefined' || !nostr) {
      alert('NIP-07 Nostr extension (e.g. Alby, nos2x) not found.')
      return
    }
    try {
      const pubkey = await nostr.getPublicKey!()
      await requestNostrPermissions(pubkey)
      let name = pubkey.substring(0, 8) + '...'
      let picture = `https://robohash.org/${pubkey}.png?set=set4`

      try {
        const pool = new SimplePool()
        const relays = DEFAULT_RELAY_URLS
        const event = await pool.get(relays, {
          kinds: [0],
          authors: [pubkey],
        })
        if (event && event.content) {
          const meta = JSON.parse(event.content)
          if (meta.name) name = meta.name
          if (meta.display_name) name = meta.display_name
          if (meta.picture) picture = meta.picture
        }
        pool.close(relays)
      } catch (err) {
        console.warn('Failed to fetch Nostr metadata from relays, using fallback details', err)
      }

      const profile: NostrProfile = { pubkey, name, picture }
      setUser(profile)
      sessionStorage.setItem('nostr_user', JSON.stringify(profile))

      let activeRelays = DEFAULT_RELAY_URLS
      if (nostr.getRelays) {
        try {
          const relaysObj = await nostr.getRelays()
          const userRelays = Object.keys(relaysObj)
          if (userRelays.length > 0) {
            sessionStorage.setItem('nostr_relays', JSON.stringify(userRelays))
            activeRelays = Array.from(new Set([...userRelays, ...activeRelays]))
          }
        } catch (err) {
          console.warn('Failed to get relays from NIP-07 extension', err)
        }
      }

      // Sync settings list from Nostr
      try {
        const payload = await syncWorkspacesFromNostr(pubkey, activeRelays)
        if (payload && Array.isArray(payload.workspaces)) {
          applyWorkspaceConfigPayload(payload)
        }
      } catch (err) {
        console.warn('Failed to sync settings from Nostr on login', err)
      }

      window.location.reload()
    } catch (err) {
      console.error('NIP-07 login error', err)
    }
  }

  function handleLogout() {
    setUser(null)
    sessionStorage.removeItem('nostr_user')
    sessionStorage.removeItem('nostr_relays')
    window.location.reload()
  }

  function toggleWorkspaces() {
    setShowWorkspaces((current) => {
      const next = !current
      sessionStorage.setItem('grid34_workspaces_collapsed', String(!next))
      return next
    })
  }

  if (!canViewWorkspace) {
    if (user && !accessHydrated) {
      return <LoadingShell />
    }
    return (
      <GuestShell
        title={user ? 'Workspace locked' : 'Waiting to log in'}
        message={
          user
            ? 'This workspace does not include your pubkey yet. Ask the owner to invite you.'
            : 'Connect your Nostr account to open a workspace you own or have been invited to.'
        }
        actionLabel={user ? 'Sign out' : 'Connect Nostr'}
        onAction={user ? handleLogout : handleLogin}
      />
    )
  }

  return (
    <RepoStoreContext.Provider value={workspace.repoStore}>
      <DraftStoreContext.Provider value={workspace.draftStore}>
        <DbViewStoreContext.Provider value={workspace.dbViewStore}>
          <main className="workspace-shell">
            <div className="workspace-frame">
              <aside className="workspace-sidebar">
                {/* Brand Logo header */}
                <div className="flex items-center gap-2.5 px-3 py-1 mb-1">
                  <img src="/logo.png" alt="grid34 logo" className="w-5.5 h-5.5 rounded-lg shadow-sm" />
                  <span className="font-mono text-xs font-bold tracking-wider text-gray-800 dark:text-gray-200 uppercase">grid34</span>
                </div>
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
                      </div>
                    </>
                  )}
                </div>

                <div className="sidebar-section">
                  <button
                    type="button"
                    className="sidebar-section__header sidebar-section__header--button"
                    onClick={toggleWorkspaces}
                    aria-expanded={showWorkspaces}
                    aria-controls="workspace-switcher-panel"
                  >
                    <span>Workspaces</span>
                    <svg
                      className={`sidebar-section__chevron-icon ${showWorkspaces ? 'sidebar-section__chevron-icon--open' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                  {showWorkspaces && (
                    <div id="workspace-switcher-panel" className="flex flex-col gap-3 w-full max-w-full min-w-0 overflow-hidden">
                      <WorkspaceSwitcher
                        activeRepoId={workspace.repoId}
                        accessibleWorkspaceIds={accessibleWorkspaceIds}
                        currentUserPubkey={user?.pubkey ?? null}
                        relayUrls={relayUrls}
                      />
                      <div className="flex flex-col gap-2 w-full max-w-full min-w-0 overflow-hidden">
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider px-1">Workspace Key</span>
                        <CekKeysManager repoId={workspace.repoId} cek={workspace.cek} />
                      </div>
                    </div>
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
                    onClick={() => {
                      void handleCheckpoint()
                    }}
                    aria-busy={checkpointStatus === 'saving'}
                  >
                    <svg className="sidebar-control__icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18" />
                    </svg>
                    <span>{checkpointStatus === 'saving' ? 'Checkpointing…' : checkpointStatus === 'saved' ? 'Checkpointed' : checkpointStatus === 'error' ? 'Checkpoint failed' : 'Checkpoint'}</span>
                  </button>
                </div>
              </aside>

              <section className="workspace-main" aria-label="Workspace canvas">
                <div className="workspace-toolbar">
                  <p className="workspace-path">grid34 / connected editor</p>
                  <div className="flex items-center gap-3">
                    <p className="workspace-status">
                      {checkpointStatus === 'saving'
                        ? 'Checkpointing current workspace state...'
                        : checkpointStatus === 'saved'
                          ? 'Checkpoint saved'
                          : checkpointStatus === 'error'
                            ? 'Checkpoint failed'
                            : 'Local draft checkpointing enabled'}
                    </p>
                    <button
                      type="button"
                      onClick={toggleTheme}
                      className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-all duration-200 flex items-center justify-center dark:text-gray-400 dark:hover:text-gray-100 dark:hover:bg-gray-800 cursor-pointer"
                      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                      aria-label="Toggle dark mode"
                    >
                      {theme === 'dark' ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l.707.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <div className="page-shell">
                  {selectedPageId ? (
                    <PageEditor
                      pageId={selectedPageId}
                      workspaceId={workspace.repoId}
                      currentUserPubkey={user?.pubkey ?? null}
                      relayUrls={relayUrls}
                      enableNostrContacts={!import.meta.env.VITEST}
                    />
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

function WorkspaceSwitcher({
  activeRepoId,
  accessibleWorkspaceIds,
  currentUserPubkey,
  relayUrls,
}: {
  activeRepoId: string
  accessibleWorkspaceIds: string[]
  currentUserPubkey: string | null
  relayUrls: string[]
}) {
  const [workspaces, setWorkspaces] = useState<string[]>([])
  const [newRepoId, setNewRepoId] = useState('')
  const [showImport, setShowImport] = useState(false)

  useEffect(() => {
    const next = Array.from(new Set([...loadWorkspaceIds(), activeRepoId]))
    setWorkspaces(next.length > 0 ? next : [activeRepoId])
  }, [activeRepoId])

  const saveWorkspaces = (nextList: string[]) => {
    setWorkspaces(nextList)
    saveWorkspaceIds(nextList)
  }

  const deletedWorkspaces = loadDeletedWorkspaces()
  const visibleWorkspaces = getVisibleWorkspaceIds([...workspaces, ...accessibleWorkspaceIds])

  const syncToNostr = async (nextList: string[], nextActiveId: string) => {
    if (currentUserPubkey) {
      await saveWorkspacesToNostr(
        currentUserPubkey,
        nextList,
        nextActiveId,
        relayUrls,
        toDeletedWorkspaceRecordMap(loadDeletedWorkspaces())
      )
    }
  }

  const handleSwitch = async (repoId: string) => {
    setActiveWorkspaceId(repoId)
    await syncToNostr(workspaces, repoId)
    window.location.reload()
  }

  const handleDelete = async (repoId: string) => {
    const confirmDelete = window.confirm(
      `Delete workspace "${repoId}"? It will be hidden locally now and queued for relay cleanup in 30 days.`
    )
    if (!confirmDelete) return

    markWorkspaceDeleted(repoId)
    const nextList = getVisibleWorkspaceIds(loadWorkspaceIds())
    saveWorkspaces(nextList)

    const nextActiveId = activeRepoId === repoId ? normalizeActiveWorkspaceId(activeRepoId, nextList) : activeRepoId
    setActiveWorkspaceId(nextActiveId)

    await syncToNostr(nextList, nextActiveId)
    window.location.reload()
  }

  const handleRestore = async (repoId: string) => {
    const record = deletedWorkspaces.find((entry) => entry.repoId === repoId)
    if (!record) return
    if (record.purgeAt <= Date.now()) {
      alert('This workspace has already passed its restore window.')
      return
    }

    restoreWorkspace(repoId)
    const nextList = getVisibleWorkspaceIds(loadWorkspaceIds())
    saveWorkspaces(nextList)
    setActiveWorkspaceId(repoId)

    await syncToNostr(nextList, repoId)
    window.location.reload()
  }

  const handleRename = async (oldId: string, newId: string) => {
    const cleanNewId = newId.trim()
    if (!cleanNewId || cleanNewId === oldId) return
    if (cleanNewId === 'workspace-repo') {
      alert('Cannot rename to the default workspace-repo')
      return
    }

    const nextList = workspaces.map(w => w === oldId ? cleanNewId : w)
    saveWorkspaces(nextList)

    // 1. Gather all keys to migrate first to prevent index shift bugs
    const prefixes = [
      `grid34_state_${oldId}`,
      `grid34_cek_${oldId}`,
      `grid34_signing_key_${oldId}`,
      `grid34_db_rows_${oldId}`,
      `grid34_pages_${oldId}`,
      `grid34_revisions_${oldId}`,
      `grid34_workspace_owner_${oldId}`,
      `grid34_page_collaborators_${oldId}_`
    ]

    const keysToMigrate: { oldKey: string; newKey: string }[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key) continue

      for (const prefix of prefixes) {
        if (key.startsWith(prefix)) {
          let newKey = key
          if (prefix === `grid34_page_collaborators_${oldId}_`) {
            const suffix = key.substring(prefix.length)
            newKey = `grid34_page_collaborators_${cleanNewId}_` + suffix
          } else {
            newKey = key.replace(oldId, cleanNewId)
          }
          keysToMigrate.push({ oldKey: key, newKey })
          break
        }
      }
    }

    // 2. Perform the migration safely
    for (const { oldKey, newKey } of keysToMigrate) {
      const val = localStorage.getItem(oldKey)
      if (val !== null) {
        localStorage.setItem(newKey, val)
        localStorage.removeItem(oldKey)
      }
    }

    // 3. Update the user's accessible workspaces list
    if (currentUserPubkey) {
      const accessKey = `grid34_accessible_workspaces_${currentUserPubkey}`
      const stored = localStorage.getItem(accessKey)
      if (stored) {
        try {
          const list = JSON.parse(stored) as string[]
          const updated = Array.from(new Set(list.map(w => w === oldId ? cleanNewId : w)))
          localStorage.setItem(accessKey, JSON.stringify(updated))
        } catch {}
      }
    }

    const nextActiveId = activeRepoId === oldId ? cleanNewId : activeRepoId
    if (activeRepoId === oldId) {
      localStorage.setItem('grid34_active_repo_id', cleanNewId)
    }
    await syncToNostr(nextList, nextActiveId)
    alert(`Workspace renamed to "${cleanNewId}"`)
    window.location.reload()
  }

  const handleCreate = async () => {
    const randomId = 'repo-' + Math.random().toString(36).substring(2, 10)
    const nextList = Array.from(new Set([...workspaces, randomId]))
    saveWorkspaces(nextList)
    localStorage.setItem('grid34_active_repo_id', randomId)
    if (currentUserPubkey) {
      saveAccessibleWorkspace(currentUserPubkey, randomId)
      void publishWorkspaceAccessSnapshot(relayUrls, {
        workspaceId: randomId,
        collaboratorPubkeys: [currentUserPubkey],
        ownerPubkey: currentUserPubkey,
        updatedAt: Date.now(),
      })
    }
    await syncToNostr(nextList, randomId)
    alert(`Created workspace "${randomId}". Switching...`)
    window.location.reload()
  }

  const handleImport = async () => {
    const cleanId = newRepoId.trim()
    if (!cleanId) return
    const nextList = Array.from(new Set([...workspaces, cleanId]))
    saveWorkspaces(nextList)
    localStorage.setItem('grid34_active_repo_id', cleanId)
    if (currentUserPubkey) {
      saveAccessibleWorkspace(currentUserPubkey, cleanId)
      void publishWorkspaceAccessSnapshot(relayUrls, {
        workspaceId: cleanId,
        collaboratorPubkeys: [currentUserPubkey],
        ownerPubkey: currentUserPubkey,
        updatedAt: Date.now(),
      })
    }
    await syncToNostr(nextList, cleanId)
    alert(`Imported workspace "${cleanId}". Switching...`)
    window.location.reload()
  }

  return (
    <div className="flex flex-col gap-0.5 w-full">
      <ul className="list-none p-0 m-0 flex flex-col gap-0.5">
        {visibleWorkspaces.map((id) => {
          const isActive = id === activeRepoId
          return (
            <li key={id} className="list-none">
              <div
                className={`group w-full rounded-lg transition-colors flex items-center justify-between text-xs font-medium ${
                  isActive
                    ? 'bg-gray-100 text-gray-900 font-semibold'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleSwitch(id)}
                  className="flex-1 text-left px-2 py-1.5 flex items-center gap-2 min-w-0"
                >
                  <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <span className="truncate font-mono text-[11px]">{id}</span>
                </button>
                <div className="flex items-center gap-1.5 flex-shrink-0 pr-1.5">
                  <button
                    type="button"
                    title="Rename workspace"
                    onClick={(e) => {
                      e.stopPropagation()
                      const newName = prompt("Rename workspace:", id)
                      if (newName) handleRename(id, newName)
                    }}
                    className="opacity-44 hover:opacity-100 p-0.5 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-800 transition-all"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    title="Delete workspace"
                    onClick={(e) => {
                      e.stopPropagation()
                      void handleDelete(id)
                    }}
                    className="opacity-44 hover:opacity-100 p-0.5 rounded hover:bg-red-100 text-gray-500 hover:text-red-700 transition-all"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 7h12m-9 0V5a1 1 0 011-1h4a1 1 0 011 1v2m-7 0h8m-9 0l1 12a1 1 0 001 1h6a1 1 0 001-1l1-12" />
                    </svg>
                  </button>
                  {isActive && (
                    <span className="text-[10px] text-green-600 font-bold px-1" title="Active">✓</span>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      {deletedWorkspaces.length > 0 && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/70 p-2">
          <div className="flex items-center justify-between gap-2 px-1 pb-1">
            <span className="text-[9px] font-bold uppercase tracking-wider text-amber-700">Recently deleted</span>
            <span className="text-[9px] text-amber-600">{deletedWorkspaces.length} hidden</span>
          </div>
          <ul className="list-none m-0 flex flex-col gap-1">
            {deletedWorkspaces.map((record) => {
              const restoreable = record.purgeAt > Date.now()
              const daysLeft = Math.max(0, Math.ceil((record.purgeAt - Date.now()) / (24 * 60 * 60 * 1000)))
              return (
                <li key={record.repoId} className="list-none">
                  <div className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-white/80 px-2 py-1.5 text-[10px]">
                    <div className="min-w-0">
                      <div className="truncate font-mono text-amber-900">{record.repoId}</div>
                      <div className="text-[9px] text-amber-600">
                        {restoreable ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} left to restore` : 'Restore window expired'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleRestore(record.repoId)}
                      disabled={!restoreable}
                      className="rounded border border-amber-300 bg-amber-100 px-2 py-1 font-medium text-amber-900 transition-colors hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Restore
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-1.5 mt-1 px-1">
        {showImport ? (
          <div className="flex flex-col gap-1 mt-1 bg-gray-50 p-2 rounded-lg border border-gray-200">
            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Import Workspace</span>
            <div className="flex gap-1">
              <input
                type="text"
                className="bg-white border border-gray-250 rounded px-1.5 py-1 flex-1 min-w-0 outline-none focus:ring-1 focus:ring-gray-300 font-mono text-[10px] text-gray-600"
                placeholder="Custom repoId"
                value={newRepoId}
                onChange={(e) => setNewRepoId(e.target.value)}
              />
              <button
                type="button"
                onClick={handleImport}
                className="px-2 py-1 bg-gray-900 text-white rounded text-[10px] font-medium transition-colors hover:bg-gray-800"
              >
                Go
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowImport(false)}
              className="text-left text-[9px] text-gray-400 hover:text-gray-600 mt-0.5"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 justify-between mt-1 text-[11px]">
            <button
              type="button"
              onClick={handleCreate}
              className="text-gray-500 hover:text-gray-900 font-medium flex items-center gap-1 py-1 rounded"
            >
              <span className="text-gray-400 text-sm font-light">+</span> Create New
            </button>
            <button
              type="button"
              onClick={() => setShowImport(true)}
              className="text-gray-500 hover:text-gray-900 font-medium py-1"
            >
              Import Existing
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function CekKeysManager({ repoId, cek }: { repoId: string; cek: Uint8Array }) {
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

      localStorage.setItem(`grid34_cek_${repoId}`, JSON.stringify(Array.from(bytes)))
      alert(`Workspace Encryption Key updated for "${repoId}". Reloading page...`)
      window.location.reload()
    } catch (err) {
      alert('Invalid hex format')
    }
  }

  return (
    <div className="flex flex-col gap-2 p-2.5 bg-gray-50/50 rounded-xl border border-gray-250/10 text-xs w-full max-w-full min-w-0 overflow-hidden box-border">
      <div className="flex flex-col gap-1 min-w-0">
        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Current CEK (hex)</span>
        <span className="font-mono bg-white border border-gray-200 rounded px-1.5 py-1.5 w-full min-w-0 truncate select-all text-[9px] text-gray-600">
          {showKey ? hexKey : '••••••••••••••••••••••••••••••••'}
        </span>
        <div className="grid grid-cols-2 gap-1 min-w-0">
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="inline-flex min-w-0 items-center justify-center gap-1 rounded border border-gray-200 bg-white px-2 py-1 text-[10px] font-medium text-gray-600 hover:bg-gray-100 transition-colors w-full whitespace-nowrap"
            title={showKey ? 'Hide key' : 'Show key'}
          >
            {showKey ? (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
                Hide
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                Show
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex min-w-0 items-center justify-center gap-1 rounded border border-gray-200 bg-white px-2 py-1 text-[10px] font-medium text-gray-600 hover:bg-gray-100 transition-colors w-full whitespace-nowrap"
            title="Copy key"
          >
            {copied ? (
              <span className="text-green-600 font-bold">✓</span>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
                Copy
              </>
            )}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1 mt-1 min-w-0">
        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Import/Set CEK (hex)</span>
        <div className="flex gap-1.5 min-w-0">
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
  const [bootstrapped, setBootstrapped] = useState(() => loadStoredUser() === null)

  useEffect(() => {
    let disposed = false

    async function bootstrapFromNostr() {
      const user = loadStoredUser()
      if (!user) {
        setBootstrapped(true)
        return
      }

      const storedRelays = loadStoredRelays()
      const activeRelays = storedRelays.length > 0 ? Array.from(new Set([...storedRelays, ...DEFAULT_RELAY_URLS])) : DEFAULT_RELAY_URLS

      try {
        const payload = await syncWorkspacesFromNostr(user.pubkey, activeRelays)
        if (payload) {
          applyWorkspaceConfigPayload(payload)
        }
      } catch (cause: unknown) {
        console.warn('Initial workspace bootstrap failed', cause)
      } finally {
        if (!disposed) {
          setBootstrapped(true)
        }
      }
    }

    void bootstrapFromNostr()

    return () => {
      disposed = true
    }
  }, [])

  useEffect(() => {
    if (!bootstrapped || workspace || error) return
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
  }, [bootstrapped, workspace, error])

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

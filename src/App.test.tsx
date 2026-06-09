import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App, { applyWorkspaceConfigPayload, requestNostrPermissions } from './App'

describe('App', () => {
  afterEach(() => {
    vi.useRealTimers()
    localStorage.clear()
    sessionStorage.clear()
    delete (globalThis as typeof globalThis & { nostr?: unknown }).nostr
  })

  it('shows a guest shell until a Nostr user logs in', async () => {
    vi.useRealTimers()
    localStorage.clear()
    sessionStorage.clear()
    render(<App />)

    expect(await screen.findByText(/waiting to log in/i, {}, { timeout: 10000 })).toBeInTheDocument()
    expect(screen.getByText(/connect your nostr account/i)).toBeInTheDocument()
    expect(screen.queryByText(/workspace-repo/i)).not.toBeInTheDocument()
  }, 30000)

  it('boots a Notion-like workspace with the editor and page tree wired up for the owner', async () => {
    vi.useRealTimers()
    localStorage.clear()
    sessionStorage.clear()
    localStorage.setItem('grid34_workspace_owner_workspace-repo', 'pubkey-1')
    sessionStorage.setItem('nostr_user', JSON.stringify({ pubkey: 'pubkey-1', name: 'Alice', picture: 'https://example.com/avatar.png' }))
    render(<App />)

    expect(screen.getByText(/booting workspace/i)).toBeInTheDocument()

    expect((await screen.findAllByText(/Workspace/i, { selector: 'span' }, { timeout: 10000 }))[0]).toBeInTheDocument()
    expect(await screen.findByText(/Notes/i, { selector: 'span' }, { timeout: 10000 })).toBeInTheDocument()
    expect(await screen.findByLabelText(/Paragraph text/i, {}, { timeout: 10000 })).toBeInTheDocument()
    expect(await screen.findByRole('columnheader', { name: /name/i }, { timeout: 10000 })).toBeInTheDocument()
  }, 30000)

  it('clears the stored nostr user when signing out', async () => {
    vi.useRealTimers()
    localStorage.clear()
    sessionStorage.clear()
    localStorage.setItem('grid34_workspace_owner_workspace-repo', 'pubkey-1')
    sessionStorage.setItem('nostr_user', JSON.stringify({ pubkey: 'pubkey-1', name: 'Alice', picture: 'https://example.com/avatar.png' }))

    render(<App />)

    const profileButton = await screen.findByRole('button', { name: /alice/i }, { timeout: 10000 })
    await userEvent.click(profileButton)
    await userEvent.click(await screen.findByRole('button', { name: /sign out of nostr/i }, { timeout: 10000 }))

    expect(sessionStorage.getItem('nostr_user')).toBeNull()
    expect(await screen.findByText(/waiting to log in/i, {}, { timeout: 10000 })).toBeInTheDocument()
  }, 30000)

  it('shows the CEK controls in the workspace sidebar instead of the user menu', async () => {
    vi.useRealTimers()
    localStorage.clear()
    sessionStorage.clear()
    localStorage.setItem('grid34_workspace_owner_workspace-repo', 'pubkey-1')
    sessionStorage.setItem('nostr_user', JSON.stringify({ pubkey: 'pubkey-1', name: 'Alice', picture: 'https://example.com/avatar.png' }))

    const user = userEvent.setup()
    render(<App />)

    expect(await screen.findByText('Workspace Key', { selector: 'span' }, { timeout: 10000 })).toBeInTheDocument()

    const profileButton = await screen.findByRole('button', { name: /alice/i }, { timeout: 10000 })
    await user.click(profileButton)

    expect(screen.queryByText('Workspace Key (CEK)')).not.toBeInTheDocument()
    expect(screen.getByText(/sign out of nostr/i)).toBeInTheDocument()
  }, 30000)

  it('can collapse the workspaces section', async () => {
    vi.useRealTimers()
    localStorage.clear()
    sessionStorage.clear()
    localStorage.setItem('grid34_workspace_owner_workspace-repo', 'pubkey-1')
    sessionStorage.setItem('nostr_user', JSON.stringify({ pubkey: 'pubkey-1', name: 'Alice', picture: 'https://example.com/avatar.png' }))

    const user = userEvent.setup()
    render(<App />)

    expect(await screen.findByText('workspace-repo', { selector: 'span' }, { timeout: 10000 })).toBeInTheDocument()
    expect(await screen.findByText('Workspace Key', { selector: 'span' }, { timeout: 10000 })).toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: /workspaces/i }, { timeout: 10000 }))

    expect(screen.queryByText('workspace-repo', { selector: 'span' })).not.toBeInTheDocument()
    expect(screen.queryByText('Workspace Key', { selector: 'span' })).not.toBeInTheDocument()
    expect(screen.queryByText(/create new/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/import existing/i)).not.toBeInTheDocument()
  }, 30000)

  it('shows checkpoint feedback when the checkpoint button is clicked', async () => {
    vi.useRealTimers()
    localStorage.clear()
    sessionStorage.clear()
    localStorage.setItem('grid34_workspace_owner_workspace-repo', 'pubkey-1')
    sessionStorage.setItem('nostr_user', JSON.stringify({ pubkey: 'pubkey-1', name: 'Alice', picture: 'https://example.com/avatar.png' }))

    const user = userEvent.setup()
    render(<App />)

    const checkpointButton = await screen.findByRole('button', { name: /checkpoint/i }, { timeout: 10000 })
    await user.click(checkpointButton)

    expect(await screen.findByText(/checkpoint saved/i, {}, { timeout: 10000 })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /checkpointed/i }, { timeout: 10000 })).toBeInTheDocument()
  }, 30000)

  it('shows a locked shell when the signed-in user is not invited', async () => {
    vi.useRealTimers()
    localStorage.clear()
    sessionStorage.clear()
    localStorage.setItem('grid34_workspace_owner_workspace-repo', 'pubkey-owner')
    sessionStorage.setItem('nostr_user', JSON.stringify({ pubkey: 'pubkey-other', name: 'Bob', picture: 'https://example.com/avatar.png' }))

    render(<App />)

    expect(await screen.findByText(/workspace locked/i)).toBeInTheDocument()
    expect(screen.getByText(/ask the owner to invite you/i)).toBeInTheDocument()
    expect(screen.queryByText(/workspace-repo/i)).not.toBeInTheDocument()
  }, 30000)

  it('preflights the NIP-07 signer permissions on login', async () => {
    const signEvent = vi.fn().mockResolvedValue({ id: 'signed-event' })
    const encrypt = vi.fn().mockResolvedValue('ciphertext')
    const decrypt = vi.fn().mockResolvedValue('plaintext')
    const getRelays = vi.fn().mockResolvedValue({ 'wss://relay.example': true })
    const getBlossomServers = vi.fn().mockResolvedValue(['https://blossom.example'])
    const getNip96Servers = vi.fn().mockResolvedValue(['https://nip96.example'])
    const getMediaServers = vi.fn().mockResolvedValue({
      blossom: ['https://media-blossom.example'],
      nip96: ['https://media-nip96.example'],
    })
    ;(globalThis as typeof globalThis & { nostr?: unknown }).nostr = {
      getPublicKey: vi.fn().mockResolvedValue('pubkey-1'),
      signEvent,
      nip04: { encrypt, decrypt },
      getRelays,
      getBlossomServers,
      getNip96Servers,
      getMediaServers,
    }

    await requestNostrPermissions('pubkey-1')

    expect(signEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 1,
        content: 'grid34 login permission check',
      })
    )
    expect(encrypt).toHaveBeenCalledWith('pubkey-1', expect.stringMatching(/^grid34-login:/))
    expect(decrypt).toHaveBeenCalledWith('pubkey-1', 'ciphertext')
    expect(getRelays).toHaveBeenCalled()
    expect(getBlossomServers).toHaveBeenCalled()
    expect(getNip96Servers).toHaveBeenCalled()
    expect(getMediaServers).toHaveBeenCalled()
  })

  it('keeps deleted workspaces hidden when syncing workspace config from relays', () => {
    localStorage.setItem(
      'grid34_deleted_workspaces',
      JSON.stringify([
        {
          repoId: 'workspace-deleted',
          deletedAt: 1_700_000_000_000,
          purgeAt: 1_700_000_000_000 + 30 * 24 * 60 * 60 * 1000,
        },
      ])
    )
    localStorage.setItem('grid34_workspaces', JSON.stringify(['workspace-deleted', 'workspace-kept']))
    localStorage.setItem('grid34_active_repo_id', 'workspace-deleted')

    const changed = applyWorkspaceConfigPayload({
      workspaces: ['workspace-deleted', 'workspace-new'],
      activeRepoId: 'workspace-deleted',
      updatedAt: Date.now(),
      deletedWorkspaces: {
        'workspace-deleted': 1_700_000_000_000,
      },
    })

    expect(changed).toBe(true)
    expect(JSON.parse(localStorage.getItem('grid34_workspaces') ?? '[]')).toEqual(['workspace-kept', 'workspace-new'])
    expect(localStorage.getItem('grid34_active_repo_id')).toBe('workspace-kept')
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

describe('App', () => {
  afterEach(() => {
    vi.useRealTimers()
    localStorage.clear()
    sessionStorage.clear()
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
})

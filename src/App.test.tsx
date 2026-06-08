import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

describe('App', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('boots a Notion-like workspace with the editor and page tree wired up', async () => {
    vi.useRealTimers()
    render(<App />)

    expect(screen.getByText(/booting workspace/i)).toBeInTheDocument()

    expect(await screen.findByRole('heading', { name: 'Workspace', level: 1 })).toBeInTheDocument()
    expect(await screen.findByText('Workspace')).toBeInTheDocument()
    expect(await screen.findByText('Notes')).toBeInTheDocument()
    expect(await screen.findByLabelText('Paragraph text')).toBeInTheDocument()
    expect(await screen.findByRole('columnheader', { name: 'name' })).toBeInTheDocument()
  })
})

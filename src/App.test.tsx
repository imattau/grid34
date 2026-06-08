import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

describe('App', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('boots a Notion-like workspace with the editor and page tree wired up', async () => {
    vi.useRealTimers()
    localStorage.clear()
    render(<App />)

    expect(screen.getByText(/booting workspace/i)).toBeInTheDocument()

    expect(await screen.findByText(/Workspace/i, { selector: 'span' }, { timeout: 10000 })).toBeInTheDocument()
    expect(await screen.findByText(/Notes/i, { selector: 'span' }, { timeout: 10000 })).toBeInTheDocument()
    expect(await screen.findByLabelText(/Paragraph text/i, {}, { timeout: 10000 })).toBeInTheDocument()
    expect(await screen.findByRole('columnheader', { name: /name/i }, { timeout: 10000 })).toBeInTheDocument()
  }, 30000)
})

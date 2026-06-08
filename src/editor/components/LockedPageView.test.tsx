import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LockedPageView } from './LockedPageView'

describe('LockedPageView', () => {
  it('renders a locked placeholder with the page title and an explanation, with no edit affordances', () => {
    render(<LockedPageView pageId="page-1" pageTitle="Q3 Planning" />)

    expect(screen.getByRole('heading', { name: 'Q3 Planning', level: 2 })).toBeInTheDocument()
    expect(screen.getByText('Q3 Planning')).toBeInTheDocument()
    expect(screen.getByText(/encrypted and your key can't decrypt it/)).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument()
  })
})

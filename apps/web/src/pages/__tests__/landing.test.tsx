import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { LandingPage } from '../landing'

describe('LandingPage', () => {
  it('renders the main headline', () => {
    render(
      <BrowserRouter>
        <LandingPage />
      </BrowserRouter>
    )
    expect(screen.getByText(/Prompt chains, built once/)).toBeInTheDocument()
  })
})

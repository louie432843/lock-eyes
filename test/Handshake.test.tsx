/**
 * test/Handshake.test.tsx — Unit tests for the Handshake component.
 */

import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Handshake from '../src/Handshake'

describe('Handshake', () => {
  it('renders the partner name', () => {
    render(<Handshake partnerName="Katherine" onAccept={() => {}} onDecline={() => {}} />)
    expect(screen.getByText(/Katherine wants to lock eyes/i)).toBeTruthy()
  })

  it('shows "Someone" when no partner name provided', () => {
    render(<Handshake partnerName="" onAccept={() => {}} onDecline={() => {}} />)
    expect(screen.getByText(/Someone wants to lock eyes/i)).toBeTruthy()
  })

  it('renders Accept and Decline buttons', () => {
    render(<Handshake partnerName="Alice" onAccept={() => {}} onDecline={() => {}} />)
    expect(screen.getByText('Accept')).toBeTruthy()
    expect(screen.getByText('Decline')).toBeTruthy()
  })

  it('calls onAccept when Accept button is clicked', () => {
    let accepted = false
    render(<Handshake partnerName="Bob" onAccept={() => { accepted = true }} onDecline={() => {}} />)
    fireEvent.click(screen.getByText('Accept'))
    expect(accepted).toBe(true)
  })

  it('calls onDecline when Decline button is clicked', () => {
    let declined = false
    render(<Handshake partnerName="Bob" onAccept={() => {}} onDecline={() => { declined = true }} />)
    fireEvent.click(screen.getByText('Decline'))
    expect(declined).toBe(true)
  })

  it('shows description text about secondary camera', () => {
    render(<Handshake partnerName="Alice" onAccept={() => {}} onDecline={() => {}} />)
    expect(screen.getByText(/secondary camera/i)).toBeTruthy()
    expect(screen.getByText(/kill the connection at any time/i)).toBeTruthy()
  })
})
/**
 * test/App.test.tsx — Integration tests for the main App component.
 *
 * Tests the state machine, UI rendering for each state, and user interactions.
 * Mocks window.electronAPI and LockEyesPeer to avoid real PeerJS connections.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Mock the peer module BEFORE importing App
const mockPeerInstance = {
  onStateChange: null as any,
  onHandshakeRequest: null as any,
  onPartnerName: null as any,
  onRemoteStream: null as any,
  onError: null as any,
  createSession: vi.fn(),
  joinSession: vi.fn(),
  acceptHandshake: vi.fn(),
  declineHandshake: vi.fn(),
  killConnection: vi.fn(),
  setLocalStream: vi.fn(),
  destroy: vi.fn(),
  getRemoteStream: vi.fn().mockReturnValue(null),
}

vi.mock('../src/peer', () => ({
  LockEyesPeer: vi.fn(() => mockPeerInstance),
  ConnectionState: {} as any,
  PeerState: {} as any,
}))

import App from '../src/App'

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPeerInstance.onStateChange = null
    mockPeerInstance.onHandshakeRequest = null
    mockPeerInstance.onPartnerName = null
    mockPeerInstance.onRemoteStream = null
    mockPeerInstance.onError = null
  })

  describe('initial render', () => {
    it('shows Lock Eyes in the header', () => {
      render(<App />)
      expect(screen.getByText('Lock Eyes')).toBeTruthy()
    })

    it('shows the status indicator with "Idle" label', () => {
      render(<App />)
      expect(screen.getByText('Idle')).toBeTruthy()
    })

    it('renders Create Session and Join Session buttons', () => {
      render(<App />)
      expect(screen.getByText('Create Session')).toBeTruthy()
      expect(screen.getByText('Join Session')).toBeTruthy()
    })

    it('renders the camera dropdown', () => {
      render(<App />)
      // The camera select element should be present
      const selects = document.querySelectorAll('select')
      expect(selects.length).toBeGreaterThan(0)
    })

    it('renders "Private 1:1 video side channel" subtitle', () => {
      render(<App />)
      expect(screen.getByText('Private 1:1 video side channel')).toBeTruthy()
    })
  })

  describe('Join Session flow', () => {
    it('shows code input and name input when Join Session is clicked', () => {
      render(<App />)
      fireEvent.click(screen.getByText('Join Session'))
      expect(screen.getByPlaceholderText('ABCD')).toBeTruthy()
      expect(screen.getByPlaceholderText('Your name')).toBeTruthy()
      expect(screen.getByText('Join')).toBeTruthy()
      expect(screen.getByText('Back')).toBeTruthy()
    })

    it('disables Join button when code is not 4 chars', () => {
      render(<App />)
      fireEvent.click(screen.getByText('Join Session'))
      const joinBtn = screen.getByText('Join')
      expect(joinBtn.getAttribute('disabled')).not.toBeNull()
    })

    it('shows the "Enter the 4-letter code" subtitle', () => {
      render(<App />)
      fireEvent.click(screen.getByText('Join Session'))
      expect(screen.getByText('Enter the 4-letter code')).toBeTruthy()
    })

    it('returns to home when Back is clicked', () => {
      render(<App />)
      fireEvent.click(screen.getByText('Join Session'))
      expect(screen.getByText('Enter the 4-letter code')).toBeTruthy()
      fireEvent.click(screen.getByText('Back'))
      expect(screen.getByText('Create Session')).toBeTruthy()
    })
  })

  describe('Create Session flow', () => {
    it('calls peer.createSession when Create Session is clicked', () => {
      mockPeerInstance.createSession.mockResolvedValue('WOLF')
      render(<App />)
      fireEvent.click(screen.getByText('Create Session'))
      expect(mockPeerInstance.createSession).toHaveBeenCalled()
    })
  })

  describe('handshake display', () => {
    it('shows handshake overlay when state becomes handshake', async () => {
      render(<App />)

      // Simulate peer firing onStateChange('handshake') and onHandshakeRequest
      mockPeerInstance.onStateChange?.('handshake')
      mockPeerInstance.onHandshakeRequest?.({ partnerName: 'Katherine' })

      await waitFor(() => {
        expect(screen.getByText(/Katherine wants to lock eyes/i)).toBeTruthy()
      })
    })
  })

  describe('live state', () => {
    it('shows KILL button and live banner when state becomes live', async () => {
      render(<App />)

      mockPeerInstance.onStateChange?.('live')
      mockPeerInstance.onPartnerName?.('Katherine')

      await waitFor(() => {
        expect(screen.getByText('KILL')).toBeTruthy()
      })

      expect(screen.getByText(/LIVE to Katherine/i)).toBeTruthy()
    })

    it('calls peer.killConnection when KILL is clicked', async () => {
      render(<App />)
      mockPeerInstance.onStateChange?.('live')
      mockPeerInstance.onPartnerName?.('Test')

      await waitFor(() => {
        expect(screen.getByText('KILL')).toBeTruthy()
      })

      fireEvent.click(screen.getByText('KILL'))
      expect(mockPeerInstance.killConnection).toHaveBeenCalled()
    })
  })

  describe('dark state', () => {
    it('shows "Connection ended" message when state becomes dark', async () => {
      render(<App />)
      mockPeerInstance.onStateChange?.('dark')

      await waitFor(() => {
        expect(screen.getByText('Connection ended')).toBeTruthy()
      })
    })

    it('shows "Start new session" button in dark state', async () => {
      render(<App />)
      mockPeerInstance.onStateChange?.('dark')

      await waitFor(() => {
        expect(screen.getByText('Start new session')).toBeTruthy()
      })
    })
  })

  describe('error state', () => {
    it('shows error message when onError fires', async () => {
      render(<App />)
      mockPeerInstance.onError?.('Something broke')
      mockPeerInstance.onStateChange?.('error')

      await waitFor(() => {
        expect(screen.getByText('Something broke')).toBeTruthy()
      })
    })

    it('shows Try again button in error state', async () => {
      render(<App />)
      mockPeerInstance.onError?.('Test error')
      mockPeerInstance.onStateChange?.('error')

      await waitFor(() => {
        expect(screen.getByText('Try again')).toBeTruthy()
      })
    })
  })

  describe('code generation display', () => {
    it('shows the session code in waiting state', async () => {
      mockPeerInstance.createSession.mockResolvedValue('WOLF')
      render(<App />)
      fireEvent.click(screen.getByText('Create Session'))

      // Wait for createSession to resolve and state to change
      await waitFor(() => {
        mockPeerInstance.onStateChange?.('waiting')
      })

      await waitFor(() => {
        expect(screen.getByText('Share this code with your friend')).toBeTruthy()
      })
    })
  })
})
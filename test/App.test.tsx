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
  onChatMessage: null as any,
  onGameMove: null as any,
  onGameReset: null as any,
  createSession: vi.fn(),
  joinSession: vi.fn(),
  acceptHandshake: vi.fn(),
  declineHandshake: vi.fn(),
  killConnection: vi.fn(),
  setLocalStream: vi.fn(),
  setHostName: vi.fn(),
  sendChatMessage: vi.fn(),
  sendGameMove: vi.fn(),
  sendGameReset: vi.fn(),
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

  describe('streaming chat', () => {
    it('shows chat input when in live state', async () => {
      render(<App />)
      mockPeerInstance.onStateChange?.('live')
      mockPeerInstance.onPartnerName?.('Test')

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Type a message… (no history)')).toBeTruthy()
      })
    })

    it('shows chat input when in waiting state', async () => {
      render(<App />)
      mockPeerInstance.onStateChange?.('waiting')

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Type a message… (no history)')).toBeTruthy()
      })
    })

    it('does NOT show chat input in idle state', () => {
      render(<App />)
      expect(screen.queryByPlaceholderText('Type a message… (no history)')).toBeNull()
    })

    it('calls sendChatMessage when Send is clicked with text', async () => {
      render(<App />)
      mockPeerInstance.onStateChange?.('live')
      mockPeerInstance.onPartnerName?.('Test')

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Type a message… (no history)')).toBeTruthy()
      })

      const input = screen.getByPlaceholderText('Type a message… (no history)') as HTMLInputElement
      fireEvent.change(input, { target: { value: 'did you see that?' } })
      fireEvent.click(screen.getByLabelText('Send message'))

      expect(mockPeerInstance.sendChatMessage).toHaveBeenCalledWith('did you see that?', expect.any(String))
    })

    it('does NOT call sendChatMessage when input is empty', async () => {
      render(<App />)
      mockPeerInstance.onStateChange?.('live')
      mockPeerInstance.onPartnerName?.('Test')

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Type a message… (no history)')).toBeTruthy()
      })

      // Send button should be disabled
      const sendBtn = screen.getByLabelText('Send message')
      expect(sendBtn.getAttribute('disabled')).not.toBeNull()
    })

    it('displays incoming chat messages in the stream', async () => {
      render(<App />)
      mockPeerInstance.onStateChange?.('live')
      mockPeerInstance.onPartnerName?.('Katherine')

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Type a message… (no history)')).toBeTruthy()
      })

      // Simulate incoming chat message
      mockPeerInstance.onChatMessage?.({
        text: 'can you believe this guy?',
        sender: 'Katherine',
        timestamp: Date.now(),
      })

      await waitFor(() => {
        expect(screen.getByText('can you believe this guy?')).toBeTruthy()
        expect(screen.getByText('Katherine')).toBeTruthy()
      })
    })

    it('sends chat on Enter key press', async () => {
      render(<App />)
      mockPeerInstance.onStateChange?.('live')
      mockPeerInstance.onPartnerName?.('Test')

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Type a message… (no history)')).toBeTruthy()
      })

      const input = screen.getByPlaceholderText('Type a message… (no history)')
      fireEvent.change(input, { target: { value: 'wow' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(mockPeerInstance.sendChatMessage).toHaveBeenCalledWith('wow', expect.any(String))
    })
  })

  describe('hide/show local preview', () => {
    it('shows Hide self button in live state', async () => {
      render(<App />)
      mockPeerInstance.onStateChange?.('live')
      mockPeerInstance.onPartnerName?.('Test')

      await waitFor(() => {
        expect(screen.getByText('🙈 Hide self')).toBeTruthy()
      })
    })

    it('hides local video preview when Hide self is clicked', async () => {
      render(<App />)
      mockPeerInstance.onStateChange?.('live')
      mockPeerInstance.onPartnerName?.('Test')

      await waitFor(() => {
        expect(screen.getByText('🙈 Hide self')).toBeTruthy()
      })

      // "What they see" label should be visible
      expect(screen.getByText('What they see (your camera)')).toBeTruthy()

      fireEvent.click(screen.getByText('🙈 Hide self'))

      // Now the label should be gone and button should say "Show self"
      await waitFor(() => {
        expect(screen.getByText('👁 Show self')).toBeTruthy()
      })
      expect(screen.queryByText('What they see (your camera)')).toBeNull()
    })

    it('shows local video preview again when Show self is clicked', async () => {
      render(<App />)
      mockPeerInstance.onStateChange?.('live')
      mockPeerInstance.onPartnerName?.('Test')

      await waitFor(() => {
        expect(screen.getByText('🙈 Hide self')).toBeTruthy()
      })

      // Hide
      fireEvent.click(screen.getByText('🙈 Hide self'))
      await waitFor(() => {
        expect(screen.getByText('👁 Show self')).toBeTruthy()
      })
      expect(screen.queryByText('What they see (your camera)')).toBeNull()

      // Show again
      fireEvent.click(screen.getByText('👁 Show self'))
      await waitFor(() => {
        expect(screen.getByText('🙈 Hide self')).toBeTruthy()
      })
      expect(screen.getByText('What they see (your camera)')).toBeTruthy()
    })
  })

  describe('tic-tac-toe game', () => {
    it('renders the game board in live state', async () => {
      render(<App />)
      mockPeerInstance.onStateChange?.('live')
      mockPeerInstance.onPartnerName?.('Test')

      await waitFor(() => {
        expect(screen.getByText('You are X')).toBeTruthy()
      })

      // 9 cells
      const cells = document.querySelectorAll('.tictactoe-cell')
      expect(cells.length).toBe(9)
    })

    it('shows New game button', async () => {
      render(<App />)
      mockPeerInstance.onStateChange?.('live')
      mockPeerInstance.onPartnerName?.('Test')

      await waitFor(() => {
        expect(screen.getByText('↻ New game')).toBeTruthy()
      })
    })

    it('calls sendGameMove when a cell is clicked', async () => {
      render(<App />)
      mockPeerInstance.onStateChange?.('live')
      mockPeerInstance.onPartnerName?.('Test')

      await waitFor(() => {
        expect(screen.getByText('You are X')).toBeTruthy()
      })

      const cells = document.querySelectorAll('.tictactoe-cell')
      fireEvent.click(cells[0])

      expect(mockPeerInstance.sendGameMove).toHaveBeenCalledWith(0, 'X')
    })

    it('displays incoming moves from partner', async () => {
      render(<App />)
      mockPeerInstance.onStateChange?.('live')
      mockPeerInstance.onPartnerName?.('Test')

      await waitFor(() => {
        expect(screen.getByText('You are X')).toBeTruthy()
      })

      // Simulate partner making a move
      mockPeerInstance.onGameMove?.({ position: 4, player: 'O' })

      await waitFor(() => {
        const cells = document.querySelectorAll('.tictactoe-cell')
        expect(cells[4].textContent).toBe('O')
      })
    })

    it('calls sendGameReset when New game is clicked', async () => {
      render(<App />)
      mockPeerInstance.onStateChange?.('live')
      mockPeerInstance.onPartnerName?.('Test')

      await waitFor(() => {
        expect(screen.getByText('↻ New game')).toBeTruthy()
      })

      fireEvent.click(screen.getByText('↻ New game'))
      expect(mockPeerInstance.sendGameReset).toHaveBeenCalled()
    })
  })

  describe('chat accumulation when unfocused', () => {
    it('shows unread badge when messages arrive while unfocused', async () => {
      render(<App />)
      mockPeerInstance.onStateChange?.('live')
      mockPeerInstance.onPartnerName?.('Test')

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Type a message… (no history)')).toBeTruthy()
      })

      // Simulate window blur
      window.dispatchEvent(new Event('blur'))

      // Simulate incoming chat
      mockPeerInstance.onChatMessage?.({
        text: 'hello while away',
        sender: 'Test',
        timestamp: 1001,
      })

      await waitFor(() => {
        expect(screen.getByText(/unread/i)).toBeTruthy()
      })
      expect(screen.getByText('hello while away')).toBeTruthy()
    })

    it('messages persist when unfocused (no expiry)', async () => {
      render(<App />)
      mockPeerInstance.onStateChange?.('live')
      mockPeerInstance.onPartnerName?.('Test')

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Type a message… (no history)')).toBeTruthy()
      })

      window.dispatchEvent(new Event('blur'))

      mockPeerInstance.onChatMessage?.({
        text: 'persisted',
        sender: 'Test',
        timestamp: 2001,
      })

      // Wait 2 seconds — message should still be there (no 8s expiry running)
      await new Promise((r) => setTimeout(r, 2000))
      expect(screen.queryByText('persisted')).toBeTruthy()
    })

    it('starts expiry when window regains focus', async () => {
      render(<App />)
      mockPeerInstance.onStateChange?.('live')
      mockPeerInstance.onPartnerName?.('Test')

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Type a message… (no history)')).toBeTruthy()
      })

      // Blur, receive message, refocus
      window.dispatchEvent(new Event('blur'))
      mockPeerInstance.onChatMessage?.({
        text: 'will expire after refocus',
        sender: 'Test',
        timestamp: 3001,
      })
      await waitFor(() => {
        expect(screen.getByText('will expire after refocus')).toBeTruthy()
      })

      window.dispatchEvent(new Event('focus'))

      // Badge should disappear
      await waitFor(() => {
        expect(screen.queryByText(/unread/i)).toBeNull()
      })

      // Message should still be visible (8s timer just started)
      expect(screen.getByText('will expire after refocus')).toBeTruthy()
    })
  })
})
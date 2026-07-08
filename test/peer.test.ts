/**
 * test/peer.test.ts — Unit tests for the LockEyesPeer connection lifecycle.
 *
 * Tests the state machine, code generation, handshake protocol, and
 * cleanup logic WITHOUT a real PeerJS connection. Uses a mock Peer
 * to simulate the connection flow.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock PeerJS — classes defined INSIDE the factory to avoid hoisting issues.
vi.mock('peerjs', () => {
  type PeerEvent = 'open' | 'error' | 'connection' | 'call'
  type ConnEvent = 'open' | 'data' | 'close' | 'error'
  type CallEvent = 'stream' | 'close' | 'error'

  class MockDataConnection {
    peer: string
    open: boolean = false
    private listeners: Record<string, Function[]> = {}
    constructor(peerId: string) { this.peer = peerId }
    on(event: ConnEvent, cb: Function) {
      if (!this.listeners[event]) this.listeners[event] = []
      this.listeners[event].push(cb)
    }
    send(_data: any) {}
    close() { this.open = false; this.emit('close') }
    emit(event: ConnEvent, ...args: any[]) {
      (this.listeners[event] || []).forEach((cb) => cb(...args))
    }
  }

  class MockMediaConnection {
    private listeners: Record<string, Function[]> = {}
    answered = false
    on(event: CallEvent, cb: Function) {
      if (!this.listeners[event]) this.listeners[event] = []
      this.listeners[event].push(cb)
    }
    answer(_stream?: any) { this.answered = true }
    close() { this.emit('close') }
    emit(event: CallEvent, ...args: any[]) {
      (this.listeners[event] || []).forEach((cb) => cb(...args))
    }
  }

  class MockPeer {
    id: string | null
    private listeners: Record<string, Function[]> = {}
    destroyed = false
    constructor(id?: string) {
      this.id = id || null
      // Emit 'open' on next microtask so listeners are registered first
      Promise.resolve().then(() => this.emit('open'))
    }
    on(event: PeerEvent, cb: Function) {
      if (!this.listeners[event]) this.listeners[event] = []
      this.listeners[event].push(cb)
    }
    connect(peerId: string, _options?: any): MockDataConnection {
      const conn = new MockDataConnection(peerId)
      Promise.resolve().then(() => { conn.open = true; conn.emit('open') })
      return conn
    }
    call(_peerId: string, _stream: any): MockMediaConnection {
      return new MockMediaConnection()
    }
    destroy() { this.destroyed = true }
    emit(event: PeerEvent, ...args: any[]) {
      (this.listeners[event] || []).forEach((cb) => cb(...args))
    }
  }

  return { Peer: MockPeer }
})

// Import AFTER the mock is set up
import { LockEyesPeer } from '../src/peer'

describe('LockEyesPeer', () => {
  let peer: LockEyesPeer
  let stateLog: string[]

  beforeEach(() => {
    peer = new LockEyesPeer()
    stateLog = []
    peer.onStateChange = (state) => stateLog.push(state)
  })

  afterEach(() => {
    peer.destroy()
  })

  describe('initial state', () => {
    it('starts with null callbacks and no active connection', () => {
      const fresh = new LockEyesPeer()
      expect(fresh.onStateChange).toBeNull()
      expect(fresh.onHandshakeRequest).toBeNull()
      expect(fresh.onRemoteStream).toBeNull()
      expect(fresh.onError).toBeNull()
    })

    it('getRemoteStream returns null when not connected', () => {
      expect(peer.getRemoteStream()).toBeNull()
    })
  })

  describe('setLocalStream', () => {
    it('stores the local stream without throwing', () => {
      const stream = new MediaStream()
      peer.setLocalStream(stream)
      expect(true).toBe(true)
    })
  })

  describe('setHostName', () => {
    it('stores the host name without throwing', () => {
      peer.setHostName('Louie')
      expect(true).toBe(true)
    })
  })

  describe('createSession', () => {
    it('generates a 4-char code and transitions to creating state', async () => {
      const promise = peer.createSession()
      expect(stateLog).toContain('creating')

      await vi.waitFor(() => { expect(stateLog).toContain('waiting') })
      const code = await promise
      expect(code).toHaveLength(4)
      expect(code).toMatch(/^[A-Z2-9]+$/)
      // Excludes ambiguous chars: 0, O, I, 1, L
      expect(code).not.toMatch(/[01ILO]/)
    })

    it('calls onStateChange through creating → waiting', async () => {
      const promise = peer.createSession()
      await vi.waitFor(() => { expect(stateLog).toContain('waiting') })
      await promise
      expect(stateLog[0]).toBe('creating')
      expect(stateLog).toContain('waiting')
    })
  })

  describe('joinSession', () => {
    it('transitions through creating → waiting', async () => {
      const promise = peer.joinSession('TEST', 'Alice')
      await vi.waitFor(() => { expect(stateLog).toContain('waiting') })
      await promise
      expect(stateLog).toContain('creating')
      expect(stateLog).toContain('waiting')
    })

    it('calls onPartnerName with "Waiting…" while waiting for host', async () => {
      const nameLog: string[] = []
      peer.onPartnerName = (name) => nameLog.push(name)
      peer.joinSession('TEST', 'Alice').catch(() => {})
      await vi.waitFor(() => { expect(nameLog).toContain('Waiting…') })
    })
  })

  describe('handshake protocol', () => {
    it('onHandshakeRequest fires when guest sends request', async () => {
      let handshakeReceived = false
      peer.onHandshakeRequest = (req) => {
        if (req.partnerName === 'Alice') handshakeReceived = true
      }

      peer.createSession().catch(() => {})
      await vi.waitFor(() => { expect(stateLog).toContain('waiting') })

      // Access the mock peer to simulate incoming connection
      const mockPeer = (peer as any).peer as any
      expect(mockPeer).toBeTruthy()

      const conn = new (mockPeer.constructor as any)('guest-123')
      // Simulate as MockDataConnection
      conn.open = true
      mockPeer.emit('connection', conn)
      conn.emit('data', { type: 'request', name: 'Alice' })

      expect(handshakeReceived).toBe(true)
      expect(stateLog).toContain('handshake')
    })
  })

  describe('declineHandshake', () => {
    it('transitions to dark state', () => {
      peer.declineHandshake()
      expect(stateLog).toContain('dark')
    })
  })

  describe('killConnection', () => {
    it('transitions to dark state', () => {
      peer.killConnection()
      expect(stateLog).toContain('dark')
    })

    it('can be called multiple times safely', () => {
      peer.killConnection()
      peer.killConnection()
      peer.killConnection()
      expect(true).toBe(true)
    })
  })

  describe('destroy', () => {
    it('can be called multiple times safely', () => {
      peer.destroy()
      peer.destroy()
      expect(true).toBe(true)
    })
  })

  describe('error handling', () => {
    it('fires onError when acceptHandshake is called with no data connection', () => {
      let errorMsg = ''
      peer.onError = (msg) => { errorMsg = msg }
      stateLog.length = 0
      peer.acceptHandshake()
      expect(stateLog).toContain('error')
      expect(errorMsg).toBeTruthy()
    })
  })
})
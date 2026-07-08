/**
 * src/peer.ts — PeerJS connection lifecycle manager for Lock Eyes
 *
 * Role:
 *   Exports the `LockEyesPeer` class which manages the PeerJS connection
 *   lifecycle for the 1:1 video side channel. This class is imported and used
 *   by the RENDERER process (the React app). It runs as a bundled browser
 *   module (bundled by Vite, NOT via Node require), so nodeIntegration is
 *   NOT needed in the Electron BrowserWindow.
 *
 *   The renderer creates a LockEyesPeer instance, sets the local camera stream
 *   (from getUserMedia), then calls createSession() or joinSession() to
 *   establish the P2P connection. Callbacks notify the renderer of state
 *   changes, incoming handshake requests, partner name, and errors.
 *
 * Connection flow:
 *
 *   HOST (createSession):
 *     1. Generate 4-char code, create Peer with ID `lockeyes-<CODE>`
 *     2. Wait for incoming data connection (handshake request)
 *     3. Emit onHandshakeRequest → renderer shows "wants to lock eyes" UI
 *     4. Renderer calls acceptHandshake() or declineHandshake()
 *     5. On accept: send {type:'accept'}, call peer.call(remotePeerId, localStream)
 *     6. On call 'stream' event: save remote stream, emit onStateChange('live')
 *
 *   GUEST (joinSession):
 *     1. Create Peer with random ID
 *     2. Connect to `lockeyes-<CODE>` via data connection
 *     3. Send {type:'request', name}
 *     4. Wait for {type:'accept'} or {type:'decline'}
 *     5. On accept: wait for incoming media call, save remote stream, emit 'live'
 *     6. On decline: emit 'dark', clean up
 *
 * Architecture note:
 *   This module lives in src/ and is bundled by Vite as a browser module.
 *   The `peerjs` package is bundled into the frontend by Vite's normal
 *   browser bundling (NOT externalized, NOT loaded via Node require).
 *   This allows the Electron renderer to use contextIsolation: true and
 *   nodeIntegration: false — Electron's recommended security model.
 */

import { Peer, type DataConnection, type MediaConnection } from 'peerjs'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Connection state machine values, matching the UI. */
export type ConnectionState =
  | 'idle'      // No active session
  | 'creating'  // Creating a new session (generating code, initializing Peer)
  | 'waiting'   // Waiting for a partner to connect (host) or for accept/decline (guest)
  | 'handshake' // Incoming handshake request (host) — waiting for user to accept/decline
  | 'live'      // Connected, video stream active
  | 'dark'      // Connection ended or declined
  | 'error'     // Error occurred

/** Alias for backwards compatibility with the UI (App.tsx imports PeerState). */
export type PeerState = ConnectionState

/** Handshake request from a partner who wants to lock eyes. */
export interface HandshakeRequest {
  partnerName: string
}

// ---------------------------------------------------------------------------
// LockEyesPeer class
// ---------------------------------------------------------------------------

export class LockEyesPeer {
  // PeerJS Peer instance — manages the signaling connection.
  private peer: Peer | null = null

  // Data connection for the handshake/signaling channel.
  private dataConnection: DataConnection | null = null

  // Media connection for the video stream.
  private mediaConnection: MediaConnection | null = null

  // The local camera stream (from getUserMedia in the renderer).
  private localStream: MediaStream | null = null

  // The remote partner's video stream (received via WebRTC).
  private remoteStream: MediaStream | null = null

  // The 4-char session code (for host).
  private sessionCode: string | null = null

  // The host's display name (set by the renderer before createSession).
  private hostName: string | null = null

  // The partner's name (received during handshake).
  private partnerName: string | null = null

  // The remote peer's ID (for initiating the media call when hosting).
  private remotePeerId: string | null = null

  // Whether this instance is the host (created the session).
  private isHost: boolean = false

  // -------------------------------------------------------------------------
  // Callbacks — the renderer sets these to receive notifications.
  // -------------------------------------------------------------------------

  /** Called when the connection state changes. */
  onStateChange: ((state: ConnectionState) => void) | null = null

  /** Called when a partner requests to lock eyes (host side only). */
  onHandshakeRequest: ((request: HandshakeRequest) => void) | null = null

  /** Called when the partner's name is known. */
  onPartnerName: ((name: string) => void) | null = null

  /** Called when an error occurs. */
  onError: ((message: string) => void) | null = null

  /** Called when the remote video stream is received. The renderer should
   *  attach this to a <video> element and optionally pass it to the reaction
   *  window via the `reaction:set-stream` IPC channel. */
  onRemoteStream: ((stream: MediaStream) => void) | null = null

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Set the local camera stream. Must be called before createSession() or
   * joinSession() so the stream is available when the media call is initiated.
   *
   * @param stream The MediaStream from navigator.mediaDevices.getUserMedia()
   */
  setLocalStream(stream: MediaStream): void {
    this.localStream = stream
  }

  /**
   * Set the host's display name. Must be called before createSession() so the
   * name is available when sending the accept message to the guest.
   *
   * @param name The host's display name.
   */
  setHostName(name: string): void {
    this.hostName = name
  }

  /**
   * Get the remote partner's video stream (null if not connected).
   */
  getRemoteStream(): MediaStream | null {
    return this.remoteStream
  }

  /**
   * Create a new session as the host.
   *
   * Generates a 4-char uppercase code, creates a PeerJS Peer with the ID
   * `lockeyes-<CODE>`, and waits for an incoming data connection (handshake
   * request from a guest).
   *
   * @returns The 4-char session code that the user shares with their partner.
   */
  async createSession(): Promise<string> {
    this.isHost = true
    this.setState('creating')

    const code = this.generateCode()
    this.sessionCode = code

    return new Promise<string>((resolve, reject) => {
      // Create Peer with a deterministic ID based on the session code.
      // If the ID is already taken (collision with another active session
      // using the same code), PeerJS will emit an 'error' event with type
      // 'unavailable-id'. We handle that by generating a new code and retrying.
      this.peer = new Peer('lockeyes-' + code.toUpperCase())

      this.peer.on('open', () => {
        // Peer is registered with the PeerJS signaling server.
        // Now waiting for a guest to connect.
        this.setState('waiting')
        resolve(code)
      })

      this.peer.on('error', (err: any) => {
        const errorType = err?.type || ''

        if (errorType === 'unavailable-id') {
          // ID taken — generate a new code and retry.
          this.cleanupPeer()
          this.createSession().then(resolve).catch(reject)
          return
        }

        this.handleError(`Peer error: ${err?.message || String(err)}`)
        reject(err)
      })

      // Listen for incoming data connections (handshake from guest).
      this.peer.on('connection', (conn: DataConnection) => {
        this.handleIncomingConnection(conn)
      })

      // Listen for incoming media calls (guest may call first if host
      // accepts and guest initiates the call instead).
      this.peer.on('call', (call: MediaConnection) => {
        this.handleIncomingCall(call)
      })
    })
  }

  /**
   * Join an existing session as the guest.
   *
   * Creates a PeerJS Peer with a random ID, connects to the host's
   * `lockeyes-<CODE>` peer via a data connection, and sends a handshake
   * request `{type: 'request', name}`. Waits for the host to accept or
   * decline.
   *
   * @param code The 4-char session code from the host.
   * @param name The display name of the joining user.
   */
  async joinSession(code: string, name: string): Promise<void> {
    this.isHost = false
    this.sessionCode = code
    this.setState('creating')

    return new Promise<void>((resolve, reject) => {
      // Create Peer with a random ID (no argument = random ID).
      this.peer = new Peer()

      this.peer.on('open', () => {
        // Peer is registered. Now connect to the host's peer.
        const conn = this.peer!.connect('lockeyes-' + code.toUpperCase(), {
          reliable: true,
        })

        this.dataConnection = conn

        conn.on('open', () => {
          // Send the handshake request.
          conn.send({ type: 'request', name })
          // Waiting for the host to accept or decline.
          this.setState('waiting')
          this.onPartnerName?.('Waiting…')
          resolve()
        })

        conn.on('data', (data: any) => {
          this.handleDataMessage(data)
        })

        conn.on('close', () => {
          // Connection closed by host (e.g., declined or killed).
          if (this.peer) {
            this.setState('dark')
          }
        })

        conn.on('error', (err: any) => {
          this.handleError(`Data connection error: ${err?.message || String(err)}`)
          reject(err)
        })
      })

      this.peer.on('error', (err: any) => {
        const errorType = err?.type || ''

        if (errorType === 'peer-unavailable') {
          this.handleError(`No session found for code ${code}. Make sure the host has created a session.`)
          reject(err)
          return
        }

        this.handleError(`Peer error: ${err?.message || String(err)}`)
        reject(err)
      })

      // The host will call us with the media stream after accepting.
      this.peer.on('call', (call: MediaConnection) => {
        this.handleIncomingCall(call)
      })
    })
  }

  /**
   * Accept an incoming handshake request (host side).
   *
   * Sends `{type: 'accept'}` via the data connection, then initiates the media
   * call with the local stream.
   */
  acceptHandshake(): void {
    if (!this.dataConnection || !this.dataConnection.open) {
      this.handleError('No active data connection to accept handshake')
      return
    }

    // Send acceptance to the guest, with the HOST's name (not the guest's).
    this.dataConnection.send({ type: 'accept', name: this.hostName || 'Host' })

    // Initiate the media call with the local camera stream.
    if (this.remotePeerId && this.localStream && this.peer) {
      this.initiateMediaCall(this.remotePeerId)
    } else if (!this.localStream) {
      this.handleError('No local stream available — call setLocalStream() first')
    }
  }

  /**
   * Decline an incoming handshake request (host side).
   *
   * Sends `{type: 'decline'}` via the data connection and cleans up.
   */
  declineHandshake(): void {
    if (this.dataConnection && this.dataConnection.open) {
      this.dataConnection.send({ type: 'decline' })
    }
    this.setState('dark')
    this.cleanup()
  }

  /**
   * Kill the current connection.
   *
   * Closes the media call, destroys the PeerJS peer, and resets state.
   * Does NOT stop the local camera stream — the renderer is responsible for
   * stopping camera tracks (it owns the MediaStream from getUserMedia).
   */
  killConnection(): void {
    this.cleanup()
    this.setState('dark')
  }

  /**
   * Clean up all resources. Safe to call multiple times.
   */
  destroy(): void {
    this.cleanup()
  }

  // -------------------------------------------------------------------------
  // Private methods
  // -------------------------------------------------------------------------

  /**
   * Generate a random 4-char uppercase alphanumeric session code.
   * Uses characters that are easy to read and type (no confusing chars like
   * O/0, I/1).
   */
  private generateCode(): string {
    // Exclude ambiguous characters: 0, O, I, 1, L
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
    let code = ''
    for (let i = 0; i < 4; i++) {
      code += chars[Math.floor(Math.random() * chars.length)]
    }
    return code
  }

  /**
   * Handle an incoming data connection (host side — guest is connecting).
   */
  private handleIncomingConnection(conn: DataConnection): void {
    // Store the remote peer's ID for initiating the media call later.
    this.remotePeerId = conn.peer
    this.dataConnection = conn

    conn.on('open', () => {
      // Data connection is open — waiting for the handshake request message.
    })

    conn.on('data', (data: any) => {
      this.handleDataMessage(data)
    })

    conn.on('close', () => {
      // Guest disconnected.
      this.setState('dark')
      this.cleanup()
    })

    conn.on('error', (err: any) => {
      this.handleError(`Data connection error: ${err?.message || String(err)}`)
    })
  }

  /**
   * Handle a data message received over the data connection.
   *
   * Message types:
   *   - {type: 'request', name}   → Guest wants to lock eyes (host receives)
   *   - {type: 'accept', name}     → Host accepted (guest receives)
   *   - {type: 'decline'}          → Host declined (guest receives)
   */
  private handleDataMessage(data: any): void {
    if (!data || typeof data.type !== 'string') return

    switch (data.type) {
      case 'request': {
        // Guest is requesting to lock eyes (host side).
        const name = data.name || 'Partner'
        this.partnerName = name
        this.onPartnerName?.(name)
        this.setState('handshake')
        this.onHandshakeRequest?.({ partnerName: name })
        break
      }

      case 'accept': {
        // Host accepted the handshake (guest side).
        const name = data.name || 'Partner'
        this.partnerName = name
        this.onPartnerName?.(name)
        // The host will initiate the media call next. Wait for it.
        // State stays 'waiting' until the call's 'stream' event fires.
        break
      }

      case 'decline': {
        // Host declined the handshake (guest side).
        this.setState('dark')
        this.cleanup()
        break
      }
    }
  }

  /**
   * Initiate a media call to the remote peer with the local stream.
   * Used by the host after accepting the handshake.
   */
  private initiateMediaCall(remotePeerId: string): void {
    if (!this.peer || !this.localStream) {
      this.handleError('Cannot initiate media call — peer or local stream not ready')
      return
    }

    const call = this.peer.call(remotePeerId, this.localStream)
    this.handleCallStream(call)
  }

  /**
   * Handle an incoming media call.
   * Used by the guest — the host calls with their local stream.
   */
  private handleIncomingCall(call: MediaConnection): void {
    this.mediaConnection = call

    // Answer the call with our local stream (so the host receives our video).
    if (this.localStream) {
      call.answer(this.localStream)
    } else {
      // Answer without a stream (audio-only or receive-only).
      call.answer()
    }

    this.handleCallStream(call)
  }

  /**
   * Set up the 'stream' event handler on a media call.
   * When the remote stream arrives, save it and notify the renderer.
   */
  private handleCallStream(call: MediaConnection): void {
    this.mediaConnection = call

    call.on('stream', (remoteStream: MediaStream) => {
      // Remote video stream received — we're live!
      this.remoteStream = remoteStream
      this.setState('live')
      this.onRemoteStream?.(remoteStream)
    })

    call.on('close', () => {
      this.remoteStream = null
      this.setState('dark')
    })

    call.on('error', (err: any) => {
      this.handleError(`Media call error: ${err?.message || String(err)}`)
    })
  }

  /**
   * Update the connection state and notify the renderer via callback.
   */
  private setState(state: ConnectionState): void {
    this.onStateChange?.(state)
  }

  /**
   * Handle an error: notify the renderer and set state to 'error'.
   */
  private handleError(message: string): void {
    console.error('[LockEyesPeer]', message)
    this.setState('error')
    this.onError?.(message)
  }

  /**
   * Clean up all PeerJS resources: close connections, destroy the peer.
   * Does NOT stop the local camera stream (renderer owns it).
   */
  private cleanup(): void {
    // Close media connection.
    if (this.mediaConnection) {
      try {
        this.mediaConnection.close()
      } catch {
        // Ignore — may already be closed.
      }
      this.mediaConnection = null
    }

    // Close data connection.
    if (this.dataConnection) {
      try {
        this.dataConnection.close()
      } catch {
        // Ignore — may already be closed.
      }
      this.dataConnection = null
    }

    // Destroy the PeerJS peer.
    this.cleanupPeer()

    // Reset state.
    this.remoteStream = null
    this.remotePeerId = null
    this.partnerName = null
    this.sessionCode = null
  }

  /**
   * Destroy the PeerJS peer instance.
   */
  private cleanupPeer(): void {
    if (this.peer) {
      try {
        this.peer.destroy()
      } catch {
        // Ignore — may already be destroyed.
      }
      this.peer = null
    }
  }
}
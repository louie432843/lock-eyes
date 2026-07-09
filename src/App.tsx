/**
 * App.tsx — Main UI component for the Lock Eyes application.
 *
 * Lock Eyes creates a private 1:1 video side channel between two people on a
 * video call. You share a 4-letter code, both pick a secondary camera, and
 * each see the other's face in a small always-on-top window.
 *
 * This component owns all renderer-side state:
 *   - Camera discovery and live preview via getUserMedia()
 *   - LockEyesPeer lifecycle (create/join/accept/decline/kill)
 *   - Remote video stream display (in-window <video> + optional reaction window)
 *   - Screen transitions: idle → creating → waiting → handshake → live → dark → error
 *
 * The peer logic runs entirely in the renderer via LockEyesPeer (from electron/peer.ts).
 * The preload API (window.electronAPI) is only used for camera listing and
 * reaction window control — all peer:* IPC channels are no-ops in main.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { LockEyesPeer, type ConnectionState, type ChatMessage } from './peer'
import Handshake from './Handshake'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Camera device info as returned by the preload API. */
interface CameraInfo {
  deviceId: string
  label: string
}

/** Which sub-view to show on the idle screen. */
type IdleMode = 'home' | 'join'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function App() {
  // --- Peer & connection state ------------------------------------------------
  const peerRef = useRef<LockEyesPeer | null>(null)
  const [state, setState] = useState<ConnectionState>('idle')
  const [sessionCode, setSessionCode] = useState<string>('')
  const [partnerName, setPartnerName] = useState<string>('')
  const [handshakePartner, setHandshakePartner] = useState<string>('')
  const [errorMsg, setErrorMsg] = useState<string>('')

  // --- Camera state -----------------------------------------------------------
  const [cameras, setCameras] = useState<CameraInfo[]>([])
  const [selectedCamera, setSelectedCamera] = useState<string>('')
  const localStreamRef = useRef<MediaStream | null>(null)
  const remoteStreamRef = useRef<MediaStream | null>(null)

  // --- UI form state ----------------------------------------------------------
  const [idleMode, setIdleMode] = useState<IdleMode>('home')
  const [joinCode, setJoinCode] = useState<string>('')
  const [yourName, setYourName] = useState<string>('')

  // --- Streaming chat state (no history — if you don't see it, you miss it) ---
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState<string>('')

  // --- Video element refs -----------------------------------------------------
  const localVideoRef = useRef<HTMLVideoElement | null>(null)
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null)

  // =========================================================================
  // Peer lifecycle setup
  // =========================================================================

  useEffect(() => {
    const peer = new LockEyesPeer()
    peerRef.current = peer

    peer.onStateChange = (newState: ConnectionState) => {
      setState(newState)
      // When connection goes dark/error, clear partner info
      if (newState === 'dark' || newState === 'error') {
        setPartnerName('')
      }
    }

    peer.onPartnerName = (name: string) => {
      setPartnerName(name)
    }

    peer.onHandshakeRequest = (request: { partnerName: string }) => {
      setHandshakePartner(request.partnerName)
    }

    peer.onRemoteStream = (stream: MediaStream) => {
      remoteStreamRef.current = stream
      // Attach to the in-window remote video element.
      // The video element may not be mounted yet (it only renders when
      // state === 'live'), so we retry on the next frame after setState fires.
      const attachStream = () => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream
        } else {
          // Not mounted yet — retry after React re-renders
          requestAnimationFrame(attachStream)
        }
      }
      attachStream()

      // Pass the stream's tracks to the reaction window via the preload API
      try {
        window.electronAPI.sendReactionStream(stream.getTracks())
      } catch {
        // IPC may not be available in dev mode without electron — ignore
      }
    }

    peer.onError = (message: string) => {
      setErrorMsg(message)
    }

    peer.onChatMessage = (message: ChatMessage) => {
      // Stream the message in — add to list, then remove after 8 seconds.
      // No history stored. If you don't see it, you miss it.
      setChatMessages((prev) => [...prev, message])
      setTimeout(() => {
        setChatMessages((prev) => prev.filter((m) => m.timestamp !== message.timestamp))
      }, 8000)
    }

    return () => {
      peer.destroy()
      peerRef.current = null
      // Stop local camera tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop())
        localStreamRef.current = null
      }
      // Remove preload listeners
      window.electronAPI.removeAllListeners()
    }
  }, [])

  // =========================================================================
  // Camera discovery — load camera list on mount
  // =========================================================================

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const cams = await window.electronAPI.getCameras()
        if (cancelled) return
        setCameras(cams)
        if (cams.length > 0 && !selectedCamera) {
          setSelectedCamera(cams[0].deviceId)
        }
      } catch {
        // Camera listing may fail before permissions granted; ignore
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // =========================================================================
  // Camera capture — start/stop when selection changes
  // =========================================================================

  const startCamera = useCallback(async (deviceId: string) => {
    // Stop any existing stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop())
      localStreamRef.current = null
    }

    if (!deviceId) return

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId } },
        audio: false,
      })
      localStreamRef.current = stream

      // Attach to local preview
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
      }

      // Pass stream to peer so it can send it to the partner
      if (peerRef.current) {
        peerRef.current.setLocalStream(stream)
      }
    } catch (err) {
      console.error('Failed to start camera:', err)
      setErrorMsg('Could not access camera. Check permissions.')
    }
  }, [])

  useEffect(() => {
    if (selectedCamera) {
      startCamera(selectedCamera)
    }
  }, [selectedCamera, startCamera])

  // =========================================================================
  // Auto-open reaction window when going live
  // =========================================================================

  useEffect(() => {
    if (state === 'live') {
      window.electronAPI.openReactionWindow()
      // Re-attach local stream — the live screen's <video> is a different
      // DOM element than the idle screen's, so srcObject was lost on unmount.
      if (localStreamRef.current && localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current
      }
      // Also re-attach remote stream if it arrived before the element mounted.
      if (remoteStreamRef.current && remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStreamRef.current
      }
    }
    // Close reaction window when leaving live state
    if (state === 'dark' || state === 'error' || state === 'idle') {
      window.electronAPI.closeReactionWindow()
    }
  }, [state])

  // =========================================================================
  // Actions
  // =========================================================================

  /** User clicked "Create Session" — calls peer.createSession() */
  const handleCreate = useCallback(async () => {
    if (!peerRef.current) return
    // Pass the host's name so it can be sent to the guest on accept.
    peerRef.current.setHostName(yourName.trim() || 'Host')
    try {
      const code = await peerRef.current.createSession()
      setSessionCode(code)
    } catch (err) {
      console.error('Create session failed:', err)
      setErrorMsg('Failed to create session. Try again.')
    }
  }, [yourName])

  /** User clicked "Join" — calls peer.joinSession(code, name) */
  const handleJoin = useCallback(async () => {
    if (!peerRef.current) return
    const code = joinCode.trim().toUpperCase()
    if (code.length !== 4) {
      setErrorMsg('Code must be 4 characters.')
      return
    }
    try {
      await peerRef.current.joinSession(code, yourName.trim() || 'Anonymous')
    } catch (err) {
      console.error('Join session failed:', err)
      setErrorMsg('Failed to join session. Check the code.')
    }
  }, [joinCode, yourName])

  /** Accept incoming handshake */
  const handleAccept = useCallback(() => {
    peerRef.current?.acceptHandshake()
    setHandshakePartner('')
  }, [])

  /** Decline incoming handshake */
  const handleDecline = useCallback(() => {
    peerRef.current?.declineHandshake()
    setHandshakePartner('')
  }, [])

  /** Kill the connection (either side can end it instantly) */
  const handleKill = useCallback(() => {
    peerRef.current?.killConnection()
  }, [])

  /** Send a streaming chat message — no history, if they don't see it, they miss it */
  const handleSendChat = useCallback(() => {
    const text = chatInput.trim()
    if (!text || !peerRef.current) return
    const sender = yourName.trim() || 'You'
    // Show our own message in the stream
    const message: ChatMessage = { text, sender, timestamp: Date.now() }
    setChatMessages((prev) => [...prev, message])
    setTimeout(() => {
      setChatMessages((prev) => prev.filter((m) => m.timestamp !== message.timestamp))
    }, 8000)
    // Send to partner
    peerRef.current.sendChatMessage(text, sender)
    setChatInput('')
  }, [chatInput, yourName])

  /** Reset to idle — clear all session state and recreate the peer */
  const handleReset = useCallback(() => {
    // Destroy the old peer and create a fresh one to avoid stale state.
    if (peerRef.current) {
      peerRef.current.destroy()
    }
    const freshPeer = new LockEyesPeer()
    freshPeer.onStateChange = (newState: ConnectionState) => {
      setState(newState)
      if (newState === 'dark' || newState === 'error') {
        setPartnerName('')
      }
    }
    freshPeer.onPartnerName = (name: string) => {
      setPartnerName(name)
    }
    freshPeer.onHandshakeRequest = (request: { partnerName: string }) => {
      setHandshakePartner(request.partnerName)
    }
    freshPeer.onRemoteStream = (stream: MediaStream) => {
      remoteStreamRef.current = stream
      const attachStream = () => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream
        } else {
          requestAnimationFrame(attachStream)
        }
      }
      attachStream()
      try {
        window.electronAPI.sendReactionStream(stream.getTracks())
      } catch {
        // ignore
      }
    }
    freshPeer.onError = (message: string) => {
      setErrorMsg(message)
    }
    freshPeer.onChatMessage = (message: ChatMessage) => {
      setChatMessages((prev) => [...prev, message])
      setTimeout(() => {
        setChatMessages((prev) => prev.filter((m) => m.timestamp !== message.timestamp))
      }, 8000)
    }
    // Re-attach local camera stream if still active
    if (localStreamRef.current) {
      freshPeer.setLocalStream(localStreamRef.current)
    }
    peerRef.current = freshPeer

    setState('idle')
    setSessionCode('')
    setPartnerName('')
    setHandshakePartner('')
    setErrorMsg('')
    setJoinCode('')
    setIdleMode('home')
    setChatMessages([])
    setChatInput('')
  }, [])

  /** Retry from error state */
  const handleRetry = useCallback(() => {
    setErrorMsg('')
    setState('idle')
    setIdleMode('home')
  }, [])

  // =========================================================================
  // Derived helpers
  // =========================================================================

  /** Human-readable label for the status indicator */
  const statusLabel: Record<ConnectionState, string> = {
    idle: 'Idle',
    creating: 'Creating…',
    waiting: 'Waiting',
    handshake: 'Handshake',
    live: 'LIVE',
    dark: 'Disconnected',
    error: 'Error',
  }

  const statusDotClass: Record<ConnectionState, string> = {
    idle: 'dot-red',
    creating: 'dot-yellow',
    waiting: 'dot-yellow',
    handshake: 'dot-yellow',
    live: 'dot-green',
    dark: 'dot-red',
    error: 'dot-red',
  }

  const showHandshake = state === 'handshake' || (!!handshakePartner && state !== 'live')

  // =========================================================================
  // Render
  // =========================================================================

  return (
    <div className="app">
      {/* --- Header with status indicator --- */}
      <header className="header">
        <div className="logo">
          <span className="logo-icon">👁</span>
          <span className="logo-text">Lock Eyes</span>
        </div>
        <div className="status-indicator">
          <span className={`dot ${statusDotClass[state]}`} />
          <span className="status-label">{statusLabel[state]}</span>
        </div>
      </header>

      {/* --- Handshake overlay (shown when incoming request) --- */}
      {showHandshake && (
        <Handshake partnerName={handshakePartner} onAccept={handleAccept} onDecline={handleDecline} />
      )}

      {/* --- Main content area switches by state --- */}
      <main className="content">
        {/* ============ IDLE ============ */}
        {state === 'idle' && !errorMsg && (
          <div className="screen idle-screen">
            {idleMode === 'home' && (
              <>
                <p className="subtitle">Private 1:1 video side channel</p>
                <input
                  className="input"
                  type="text"
                  placeholder="Your name"
                  value={yourName}
                  onChange={(e) => setYourName(e.target.value)}
                />
                <button className="btn btn-primary" onClick={handleCreate}>
                  Create Session
                </button>
                <button className="btn btn-secondary" onClick={() => setIdleMode('join')}>
                  Join Session
                </button>
              </>
            )}

            {idleMode === 'join' && (
              <>
                <p className="subtitle">Enter the 4-letter code</p>
                <input
                  className="input code-input"
                  type="text"
                  maxLength={4}
                  placeholder="ABCD"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                />
                <input
                  className="input"
                  type="text"
                  placeholder="Your name"
                  value={yourName}
                  onChange={(e) => setYourName(e.target.value)}
                />
                <button className="btn btn-primary" onClick={handleJoin} disabled={joinCode.length !== 4}>
                  Join
                </button>
                <button className="btn btn-secondary" onClick={() => setIdleMode('home')}>
                  Back
                </button>
              </>
            )}

            {/* Camera selector + preview (visible in both idle modes) */}
            <div className="camera-section">
              <label className="camera-label">Secondary Camera</label>
              <select
                className="select"
                value={selectedCamera}
                onChange={(e) => setSelectedCamera(e.target.value)}
              >
                {cameras.length === 0 && <option value="">No cameras found</option>}
                {cameras.map((cam) => (
                  <option key={cam.deviceId} value={cam.deviceId}>
                    {cam.label || `Camera ${cam.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>
              <video
                ref={localVideoRef}
                className="camera-preview"
                autoPlay
                playsInline
                muted
              />
            </div>
          </div>
        )}

        {/* ============ CREATING / WAITING ============ */}
        {(state === 'creating' || state === 'waiting') && (
          <div className="screen waiting-screen">
            <p className="subtitle">Share this code with your friend</p>
            <div className="code-display">{sessionCode || '····'}</div>
            <div className="pulse-container">
              <span className="pulse-dot" />
              <span className="pulse-text">Waiting for partner…</span>
            </div>
            <button className="btn btn-secondary" onClick={handleKill}>
              Cancel
            </button>
          </div>
        )}

        {/* ============ LIVE ============ */}
        {state === 'live' && (
          <div className="screen live-screen">
            <div className="live-banner">
              ⚠️ You are LIVE{partnerName ? ` to ${partnerName}` : ''}.
              <br />
              Your Zoom camera state doesn&apos;t affect this.
            </div>

            {/* Remote video — what you see (your partner's face) */}
            <div className="video-section">
              <label className="camera-label">Partner&apos;s face</label>
              <video
                ref={remoteVideoRef}
                className="remote-video"
                autoPlay
                playsInline
              />
            </div>

            {/* Local preview — what they see (your secondary camera) */}
            <div className="video-section">
              <label className="camera-label">What they see (your camera)</label>
              <video
                ref={localVideoRef}
                className="camera-preview"
                autoPlay
                playsInline
                muted
              />
            </div>

            <button className="btn btn-danger btn-kill" onClick={handleKill}>
              KILL
            </button>
          </div>
        )}

        {/* ============ DARK / KILLED ============ */}
        {state === 'dark' && (
          <div className="screen dark-screen">
            <div className="icon-large">🔌</div>
            <p className="message">Connection ended</p>
            <button className="btn btn-primary" onClick={handleReset}>
              Start new session
            </button>
          </div>
        )}

        {/* ============ ERROR ============ */}
        {(state === 'error' || errorMsg) && (
          <div className="screen error-screen">
            <div className="icon-large">⚠️</div>
            <p className="message error-message">{errorMsg || 'Something went wrong.'}</p>
            <button className="btn btn-primary" onClick={handleRetry}>
              Try again
            </button>
          </div>
        )}
      </main>

      {/* ============ STREAMING CHAT (no history — if you don't see it, you miss it) ============ */}
      {(state === 'live' || state === 'waiting' || state === 'handshake') && (
        <div className="chat-overlay">
          <div className="chat-stream">
            {chatMessages.map((msg) => (
              <div key={msg.timestamp} className="chat-bubble chat-stream-in">
                <span className="chat-sender">{msg.sender}</span>
                <span className="chat-text">{msg.text}</span>
              </div>
            ))}
          </div>
          <div className="chat-input-row">
            <input
              className="input chat-input"
              type="text"
              placeholder="Type a message… (no history)"
              value={chatInput}
              maxLength={200}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSendChat()
              }}
            />
            <button className="btn btn-secondary chat-send" onClick={handleSendChat} disabled={!chatInput.trim()}>
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
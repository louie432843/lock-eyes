/**
 * test/setup.ts — Global test setup for vitest.
 *
 * Mocks browser APIs that aren't available in jsdom:
 * - navigator.mediaDevices (getUserMedia, enumerateDevices)
 * - MediaStream
 * - window.electronAPI (Electron preload bridge)
 */

import { vi } from 'vitest'

// --- Mock MediaStream ---
class MockMediaStream {
  private tracks: MockMediaStreamTrack[]
  constructor(tracks: MockMediaStreamTrack[] = []) {
    this.tracks = tracks
  }
  getTracks() {
    return this.tracks
  }
  getVideoTracks() {
    return this.tracks.filter((t) => t.kind === 'video')
  }
  getAudioTracks() {
    return this.tracks.filter((t) => t.kind === 'audio')
  }
}
globalThis.MediaStream = MockMediaStream as any

// --- Mock MediaStreamTrack ---
class MockMediaStreamTrack {
  kind: string
  enabled: boolean = true
  readyState: 'live' | 'ended' = 'live'
  id: string
  constructor(kind: string = 'video') {
    this.kind = kind
    this.id = Math.random().toString(36).slice(2)
  }
  stop() {
    this.readyState = 'ended'
  }
}
globalThis.MediaStreamTrack = MockMediaStreamTrack as any

// --- Mock navigator.mediaDevices ---
const mockDevices = [
  { deviceId: 'cam-1', kind: 'videoinput', label: 'Built-in Camera' },
  { deviceId: 'cam-2', kind: 'videoinput', label: 'USB Webcam' },
  { deviceId: 'mic-1', kind: 'audioinput', label: 'Built-in Mic' },
]

Object.defineProperty(globalThis.navigator, 'mediaDevices', {
  value: {
    enumerateDevices: vi.fn().mockResolvedValue(mockDevices),
    getUserMedia: vi.fn().mockResolvedValue(new MockMediaStream([new MockMediaStreamTrack('video')])),
  },
  writable: true,
  configurable: true,
})

// --- Mock window.electronAPI ---
const mockElectronAPI = {
  getCameras: vi.fn().mockResolvedValue([
    { deviceId: 'cam-1', label: 'Built-in Camera' },
    { deviceId: 'cam-2', label: 'USB Webcam' },
  ]),
  startCamera: vi.fn().mockResolvedValue(undefined),
  stopCamera: vi.fn().mockResolvedValue(undefined),
  createSession: vi.fn().mockResolvedValue(''),
  joinSession: vi.fn().mockResolvedValue(undefined),
  acceptHandshake: vi.fn(),
  declineHandshake: vi.fn(),
  killConnection: vi.fn(),
  openReactionWindow: vi.fn(),
  closeReactionWindow: vi.fn(),
  sendReactionStream: vi.fn(),
  onStateChange: vi.fn(),
  onHandshakeRequest: vi.fn(),
  onPartnerName: vi.fn(),
  onError: vi.fn(),
  removeAllListeners: vi.fn(),
}

Object.defineProperty(globalThis.window, 'electronAPI', {
  value: mockElectronAPI,
  writable: true,
  configurable: true,
})

// Make window.electronAPI available as a typed mock for per-test override
export { mockElectronAPI, MockMediaStream, MockMediaStreamTrack }
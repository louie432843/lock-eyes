/**
 * src/global.d.ts — Global type declarations for the renderer.
 *
 * Declares the `window.electronAPI` interface that the preload exposes
 * via contextBridge.exposeInMainWorld(). This allows TypeScript to
 * recognize `window.electronAPI.*` calls in the renderer without
 * needing nodeIntegration or direct access to the preload module.
 */

// These types mirror the ones in electron/preload.ts
type ConnectionState = 'idle' | 'creating' | 'waiting' | 'handshake' | 'live' | 'dark' | 'error'

interface CameraInfo {
  deviceId: string
  label: string
}

interface HandshakeRequest {
  partnerName: string
}

interface ElectronAPI {
  getCameras: () => Promise<CameraInfo[]>
  startCamera: (deviceId: string) => Promise<void>
  stopCamera: () => Promise<void>
  createSession: () => Promise<string>
  joinSession: (code: string, name: string) => Promise<void>
  acceptHandshake: () => void
  declineHandshake: () => void
  killConnection: () => void
  openReactionWindow: () => void
  closeReactionWindow: () => void
  sendReactionStream: (tracks: MediaStreamTrack[]) => void
  onStateChange: (callback: (state: ConnectionState) => void) => void
  onHandshakeRequest: (callback: (request: HandshakeRequest) => void) => void
  onPartnerName: (callback: (name: string) => void) => void
  onError: (callback: (message: string) => void) => void
  removeAllListeners: () => void
}

interface Window {
  electronAPI: ElectronAPI
}
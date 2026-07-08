/**
 * electron/preload.ts — Secure bridge between main process and renderer.
 *
 * Uses contextBridge.exposeInMainWorld() to safely expose IPC APIs to the
 * renderer process. This is Electron's recommended security model:
 *   - contextIsolation: true  (renderer can't touch Node APIs directly)
 *   - nodeIntegration: false (no require() in renderer, no conflict with Vite)
 *
 * The renderer accesses these via `window.electronAPI.*`.
 * All PeerJS logic runs in the renderer as a bundled browser module (not
 * via Node require), so nodeIntegration is NOT needed.
 */

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

// Status types matching the state machine in the UI
export type ConnectionState = 'idle' | 'creating' | 'waiting' | 'handshake' | 'live' | 'dark' | 'error'

export interface CameraInfo {
  deviceId: string
  label: string
}

export interface HandshakeRequest {
  partnerName: string
}

// Expose the APIs the renderer needs via contextBridge
contextBridge.exposeInMainWorld('electronAPI', {
  // Camera
  getCameras: (): Promise<CameraInfo[]> => ipcRenderer.invoke('cameras:get'),
  startCamera: (deviceId: string): Promise<void> => ipcRenderer.invoke('cameras:start', deviceId),
  stopCamera: (): Promise<void> => ipcRenderer.invoke('cameras:stop'),

  // PeerJS session (no-ops in main — renderer handles PeerJS directly)
  createSession: (): Promise<string> => ipcRenderer.invoke('peer:create'),
  joinSession: (code: string, name: string): Promise<void> => ipcRenderer.invoke('peer:join', code, name),
  acceptHandshake: (): void => ipcRenderer.send('peer:accept'),
  declineHandshake: (): void => ipcRenderer.send('peer:decline'),
  killConnection: (): void => ipcRenderer.send('peer:kill'),

  // Reaction window
  openReactionWindow: (): void => ipcRenderer.send('reaction:open'),
  closeReactionWindow: (): void => ipcRenderer.send('reaction:close'),

  // Pass remote stream tracks to the reaction window
  sendReactionStream: (tracks: MediaStreamTrack[]): void =>
    ipcRenderer.send('reaction:set-stream', tracks),

  // Event listeners
  onStateChange: (callback: (state: ConnectionState) => void): void => {
    ipcRenderer.on('peer:state', (_event: IpcRendererEvent, state: ConnectionState) => callback(state))
  },
  onHandshakeRequest: (callback: (request: HandshakeRequest) => void): void => {
    ipcRenderer.on('peer:handshake', (_event: IpcRendererEvent, request: HandshakeRequest) => callback(request))
  },
  onPartnerName: (callback: (name: string) => void): void => {
    ipcRenderer.on('peer:partner-name', (_event: IpcRendererEvent, name: string) => callback(name))
  },
  onError: (callback: (message: string) => void): void => {
    ipcRenderer.on('peer:error', (_event: IpcRendererEvent, message: string) => callback(message))
  },

  // Clean up listeners
  removeAllListeners: (): void => {
    ipcRenderer.removeAllListeners('peer:state')
    ipcRenderer.removeAllListeners('peer:handshake')
    ipcRenderer.removeAllListeners('peer:partner-name')
    ipcRenderer.removeAllListeners('peer:error')
  },
})

// Type for the exposed API (used in App.tsx for the window.electronAPI type)
export type ElectronAPI = {
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
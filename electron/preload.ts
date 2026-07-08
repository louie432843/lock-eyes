import { ipcRenderer, type IpcRendererEvent } from 'electron'

// Status types matching the state machine in the UI
export type ConnectionState = 'idle' | 'creating' | 'waiting' | 'handshake' | 'live' | 'dark' | 'error'

export interface CameraInfo {
  deviceId: string
  label: string
}

export interface HandshakeRequest {
  partnerName: string
}

// Expose the APIs the renderer needs
const electronAPI = {
  // Camera
  getCameras: (): Promise<CameraInfo[]> => ipcRenderer.invoke('cameras:get'),
  startCamera: (deviceId: string): Promise<void> => ipcRenderer.invoke('cameras:start', deviceId),
  stopCamera: (): Promise<void> => ipcRenderer.invoke('cameras:stop'),

  // PeerJS session
  createSession: (): Promise<string> => ipcRenderer.invoke('peer:create'),
  joinSession: (code: string, name: string): Promise<void> => ipcRenderer.invoke('peer:join', code, name),
  acceptHandshake: (): void => ipcRenderer.send('peer:accept'),
  declineHandshake: (): void => ipcRenderer.send('peer:decline'),
  killConnection: (): void => ipcRenderer.send('peer:kill'),

  // Reaction window
  openReactionWindow: (): void => ipcRenderer.send('reaction:open'),
  closeReactionWindow: (): void => ipcRenderer.send('reaction:close'),

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
}

export type ElectronAPI = typeof electronAPI

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export default electronAPI
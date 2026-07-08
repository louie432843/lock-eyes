/**
 * electron/reaction-preload.ts — Preload for the reaction window.
 *
 * Exposes a minimal IPC bridge for the reaction window to receive
 * the remote video stream tracks from the main process.
 * Uses contextBridge (contextIsolation: true, nodeIntegration: false).
 */

import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('reactionAPI', {
  onSetStream: (callback: (tracks: MediaStreamTrack[]) => void): void => {
    ipcRenderer.on('reaction:set-stream', (_event: unknown, tracks: MediaStreamTrack[]) => callback(tracks))
  },
  onClearStream: (callback: () => void): void => {
    ipcRenderer.on('reaction:clear-stream', () => callback())
  },
})
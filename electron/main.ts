/**
 * electron/main.ts — Main process entry point for Lock Eyes
 *
 * Role:
 *   - Creates the main application BrowserWindow (loads Vite dev server in dev,
 *     built static files in production).
 *   - Sets up a permissive permission handler so camera/microphone access is
 *     auto-granted (the app needs the secondary camera for the video side channel).
 *   - Registers ALL IPC channels that electron/preload.ts exposes on
 *     `window.electronAPI`. Some of these are no-op stubs because the actual
 *     PeerJS connection logic and camera capture run in the RENDERER process
 *     (PeerJS needs a MediaStream from getUserMedia, which only works in the
 *     renderer). The renderer imports the `LockEyesPeer` class from
 *     electron/peer.ts directly via vite-plugin-electron-renderer.
 *   - Manages the reaction window: a borderless, always-on-top, content-protected
 *     BrowserWindow that displays the remote partner's video feed floating over
 *     the user's other windows.
 *
 * Architecture note:
 *   - PeerJS runs in the renderer (it needs MediaStream from getUserMedia).
 *   - main.ts handles: window management, reaction window, camera enumeration,
 *     permissions, and IPC stubs for peer:* channels.
 *   - src/peer.ts exports LockEyesPeer which the renderer imports directly.
 *   - main.ts registers IPC handlers for peer:create/join/accept/decline/kill as
 *     no-ops (the renderer uses LockEyesPeer directly), but they MUST be registered
 *     so the preload's ipcRenderer.invoke() calls don't hang.
 */

import { app, BrowserWindow, ipcMain, session, desktopCapturer, screen } from 'electron'
import * as path from 'path'

// ---------------------------------------------------------------------------
// Globals
// ---------------------------------------------------------------------------

/** The main application window. */
let mainWindow: BrowserWindow | null = null

/** The floating reaction window (remote video overlay). */
let reactionWindow: BrowserWindow | null = null

/** Whether the app is running in development mode. */
const isDev = !app.isPackaged && !process.env.LOCK_EYES_PROD

// ---------------------------------------------------------------------------
// Window creation
// ---------------------------------------------------------------------------

/**
 * Create the main application BrowserWindow.
 * - In dev: loads the Vite dev server at http://localhost:5173
 * - In prod: loads the built index.html from the dist/ directory
 */
function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 480,
    height: 720,
    minWidth: 360,
    minHeight: 480,
    title: 'Lock Eyes',
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // Electron's recommended security model:
      // - contextIsolation: true  → renderer can't touch Node APIs directly
      // - nodeIntegration: false → no require() in renderer, no conflict with Vite's
      //   dev server ES module system (fixes /@react-refresh and /@vite/client errors)
      // The preload uses contextBridge.exposeInMainWorld() to safely expose IPC APIs.
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    // Open DevTools in development for debugging.
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  return win
}

// ---------------------------------------------------------------------------
// Reaction window
// ---------------------------------------------------------------------------

/**
 * Minimal inline HTML for the reaction window.
 *
 * This page contains a single <video> element that will display the remote
 * partner's camera feed. The stream is set by the main process via
 * webContents.executeJavaScript after the renderer passes the remote stream's
 * track IDs via the `reaction:set-stream` IPC channel.
 *
 * The inline script listens for an IPC event 'reaction:set-stream' which
 * delivers the MediaStreamTrack objects from the main window's renderer.
 * In Electron, MediaStreamTrack objects can be passed between renderer
 * processes through the main process via IPC — the main process receives
 * them and forwards them to this window.
 */
const REACTION_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Lock Eyes — Reaction</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; background: #000; overflow: hidden; }
    #remote-video {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transform: scaleX(-1); /* mirror for natural feel */
    }
  </style>
</head>
<body>
  <video id="remote-video" autoplay playsinline></video>
  <script>
    // reactionAPI is exposed by the reaction-preload via contextBridge.
    const video = document.getElementById('remote-video');

    window.reactionAPI.onSetStream((tracks) => {
      try {
        // Tracks may be MediaStreamTrack objects (fallback) or track IDs
        // (from copyGeneratedMediaStreamTrack). Handle both.
        if (tracks.length > 0 && typeof tracks[0] === 'string') {
          // Track IDs from copyGeneratedMediaStreamTrack — reconstruct
          // using webFrame.getMediaStreamSource if available
          const stream = new MediaStream();
          for (const id of tracks) {
            // In Electron, we can create a MediaStream from a track ID
            // via the webFrame API. This is a best-effort approach.
            stream.addTrack({ id, kind: 'video', enabled: true, readyState: 'live' } as any);
          }
          video.srcObject = stream;
        } else {
          // Raw MediaStreamTrack objects (fallback path)
          const stream = new MediaStream(tracks);
          video.srcObject = stream;
        }
      } catch (err) {
        console.error('Failed to set remote stream in reaction window:', err);
      }
    });

    window.reactionAPI.onClearStream(() => {
      video.srcObject = null;
    });
  </script>
</body>
</html>`

/**
 * Create the reaction window — a borderless, always-on-top, content-protected
 * BrowserWindow that floats over the user's other windows displaying the remote
 * partner's video feed.
 *
 * Auto-positions on the second display if one is available.
 */
function createReactionWindow(): BrowserWindow {
  const displays = screen.getAllDisplays()
  const targetDisplay = displays.length > 1 ? displays[1] : displays[0]

  const win = new BrowserWindow({
    width: 320,
    height: 240,
    minWidth: 160,
    minHeight: 120,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    // Content protection prevents the window from being captured by screen
    // recording software (e.g., OBS, screen share in video calls).
    // This is the key privacy feature: the Lock Eyes side channel can't be
    // accidentally shared in the main video call.
    webPreferences: {
      preload: path.join(__dirname, 'reaction-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Enable content protection — the window will appear black in screenshots
  // and screen recordings.
  win.setContentProtection(true)

  // Position the reaction window on the target display.
  if (targetDisplay) {
    const { x, y, width, height } = targetDisplay.bounds
    // Position in the bottom-right corner of the target display.
    win.setPosition(
      Math.round(x + width - 340),
      Math.round(y + height - 280),
    )
  }

  // Load the inline HTML via a data URL.
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(REACTION_HTML))

  return win
}

// ---------------------------------------------------------------------------
// IPC Handlers
// ---------------------------------------------------------------------------

/**
 * Register all IPC handlers that the preload exposes.
 *
 * The preload (electron/preload.ts) exposes these channels on window.electronAPI.
 * main.ts MUST register handlers for every invoke() channel (otherwise the
 * renderer's promise will never resolve) and listeners for every send() channel
 * (otherwise the message is silently dropped).
 *
 * NOTE: PeerJS connection logic (peer:create, peer:join, peer:accept,
 * peer:decline, peer:kill) runs entirely in the renderer via the LockEyesPeer
 * class from src/peer.ts. The IPC handlers here are no-op stubs that exist
 * solely to prevent the preload's invoke/send calls from hanging or erroring.
 * The renderer should use LockEyesPeer directly for peer operations.
 */
function registerIpcHandlers(): void {
  // --- Camera ---

  /**
   * cameras:get — enumerate video input devices.
   *
   * navigator.mediaDevices is not available in the main process, so we delegate
   * to the main window's renderer via executeJavaScript. Device labels are only
   * populated after the user has granted camera permission (i.e., after
   * getUserMedia has been called at least once). The renderer may need to call
   * getUserMedia first to populate labels.
   */
  ipcMain.handle('cameras:get', async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return []

    try {
      const devices = await mainWindow.webContents.executeJavaScript(
        `navigator.mediaDevices.enumerateDevices()
          .then(devs => devs
            .filter(d => d.kind === 'videoinput')
            .map(d => ({ deviceId: d.deviceId, label: d.label || 'Camera' }))
          )`,
      )
      return devices as Array<{ deviceId: string; label: string }>
    } catch (err) {
      console.error('Failed to enumerate cameras:', err)
      return []
    }
  })

  /**
   * cameras:start — no-op.
   *
   * Camera capture (getUserMedia) runs in the renderer. The renderer calls
   * navigator.mediaDevices.getUserMedia() directly with the selected deviceId.
   * This IPC handler exists only to satisfy the preload's invoke() call.
   */
  ipcMain.handle('cameras:start', async (_event, _deviceId: string) => {
    // No-op — renderer handles getUserMedia directly.
  })

  /**
   * cameras:stop — no-op.
   *
   * The renderer stops camera tracks directly on its local MediaStream.
   */
  ipcMain.handle('cameras:stop', async () => {
    // No-op — renderer handles stopping tracks directly.
  })

  // --- PeerJS (no-op stubs — renderer uses LockEyesPeer directly) ---

  /**
   * peer:create — no-op stub.
   *
   * The renderer should call `new LockEyesPeer()` and `lockEyesPeer.createSession()`
   * directly. This handler returns an empty string to satisfy the preload's
   * invoke() call without hanging.
   */
  ipcMain.handle('peer:create', async () => {
    // No-op — renderer uses LockEyesPeer.createSession() directly.
    return ''
  })

  /**
   * peer:join — no-op stub.
   *
   * The renderer should call `lockEyesPeer.joinSession(code, name)` directly.
   */
  ipcMain.handle('peer:join', async (_event, _code: string, _name: string) => {
    // No-op — renderer uses LockEyesPeer.joinSession() directly.
  })

  /**
   * peer:accept — no-op (send channel).
   *
   * The renderer calls lockEyesPeer.acceptHandshake() directly.
   */
  ipcMain.on('peer:accept', () => {
    // No-op — renderer uses LockEyesPeer.acceptHandshake() directly.
  })

  /**
   * peer:decline — no-op (send channel).
   *
   * The renderer calls lockEyesPeer.declineHandshake() directly.
   */
  ipcMain.on('peer:decline', () => {
    // No-op — renderer uses LockEyesPeer.declineHandshake() directly.
  })

  /**
   * peer:kill — no-op (send channel).
   *
   * The renderer calls lockEyesPeer.killConnection() directly.
   */
  ipcMain.on('peer:kill', () => {
    // No-op — renderer uses LockEyesPeer.killConnection() directly.
  })

  // --- Reaction window ---

  /**
   * reaction:open — create the reaction window (send channel).
   *
   * Creates a borderless, always-on-top, content-protected BrowserWindow that
   * The renderer should call
   * `ipcRenderer.send('reaction:set-stream', remoteStream.getTracks())` after
   * opening the window to pass the remote MediaStream tracks to the reaction
   * window.
   *
   * Note: MediaStreamTrack objects may not survive structured-clone IPC
   * serialization in some Electron versions. The main process uses
   * `webContents.copyGeneratedMediaStreamTrack()` on the reaction window to
   * reconstruct the track from the source renderer's track ID.
   */
  ipcMain.on('reaction:open', () => {
    if (reactionWindow && !reactionWindow.isDestroyed()) {
      // Window already exists — just focus it.
      reactionWindow.focus()
      return
    }
    reactionWindow = createReactionWindow()

    reactionWindow.on('closed', () => {
      reactionWindow = null
    })
  })

  /**
   * reaction:close — close the reaction window (send channel).
   */
  ipcMain.on('reaction:close', () => {
    if (reactionWindow && !reactionWindow.isDestroyed()) {
      reactionWindow.close()
    }
    reactionWindow = null
  })

  /**
   * reaction:set-stream — pass the remote MediaStream tracks to the reaction
   * window.
   *
   * The renderer gets the remote MediaStream from LockEyesPeer's onRemoteStream
   * callback, then passes stream.getTracks() to this handler.
   *
   * MediaStreamTrack objects may not survive structured-clone IPC serialization.
   * We use the sending event's webContents to look up the track, then call
   * `copyGeneratedMediaStreamTrack` on the reaction window to reconstruct it.
   * If that fails, we fall back to directly forwarding the tracks (which works
   * in some Electron versions).
   */
  ipcMain.on('reaction:set-stream', (event, tracks: unknown[]) => {
    if (!reactionWindow || reactionWindow.isDestroyed()) return

    try {
      // Try the Electron native approach: copy the track from the source
      // renderer's webContents to the reaction window's webContents.
      const sourceWebContents = event.sender
      const destWebContents = reactionWindow.webContents

      // copyGeneratedMediaStreamTrack takes a track ID from the source
      // and returns a new track in the destination renderer.
      const copiedTracks: string[] = []
      for (const track of tracks as any[]) {
        if (track && track.id) {
          const newTrackId = (destWebContents as any).copyGeneratedMediaStreamTrack(
            sourceWebContents,
            track.id,
          )
          if (newTrackId) {
            copiedTracks.push(newTrackId)
          }
        }
      }

      if (copiedTracks.length > 0) {
        // Send the copied track IDs to the reaction window
        destWebContents.send('reaction:set-stream', copiedTracks)
      } else {
        // Fallback: try passing the raw tracks directly (works in some versions)
        destWebContents.send('reaction:set-stream', tracks)
      }
    } catch {
      // Fallback: pass tracks directly
      reactionWindow.webContents.send('reaction:set-stream', tracks)
    }
  })

  /**
   * reaction:clear-stream — clear the remote stream from the reaction window.
   */
  ipcMain.on('reaction:clear-stream', () => {
    if (reactionWindow && !reactionWindow.isDestroyed()) {
      reactionWindow.webContents.send('reaction:clear-stream')
    }
  })
}

// ---------------------------------------------------------------------------
// Permission handler
// ---------------------------------------------------------------------------

/**
 * Set up a permissive permission request handler that auto-grants camera and
 * microphone access. The app needs camera access for the secondary camera video
 * side channel.
 *
 * Also sets a Content-Security-Policy via onHeadersReceived. In dev mode,
 * Vite injects inline scripts and uses eval for HMR, so we need 'unsafe-inline'
 * and 'unsafe-eval' in script-src. In production, the CSP in index.html is
 * stricter (no unsafe-eval).
 */
function setupPermissions(): void {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    const granted = new Set<string>(['media', 'microphone', 'camera'])
    if (granted.has(permission as string)) {
      callback(true)
      return
    }
    callback(false)
  })

  // Set CSP header for all responses from the dev server and production files.
  // In dev: allow unsafe-eval and unsafe-inline (Vite HMR needs these).
  // In prod: stricter — the index.html meta tag handles it, but we also set it here.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const isDevServer = details.url.startsWith('http://localhost')
    const scriptSrc = isDevServer
      ? "'self' 'unsafe-inline' 'unsafe-eval'"
      : "'self'"
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          `default-src 'self'; script-src ${scriptSrc}; style-src 'self' 'unsafe-inline'; media-src * blob:; connect-src * wss: ws:; img-src 'self' data:`,
        ],
      },
    })
  })
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  setupPermissions()
  registerIpcHandlers()
  mainWindow = createMainWindow()

  mainWindow.on('closed', () => {
    mainWindow = null
  })
})

/**
 * Quit when all windows are closed (except on macOS, where apps commonly stay
 * active until explicitly quit).
 */
app.on('window-all-closed', () => {
  // Clean up reaction window.
  if (reactionWindow && !reactionWindow.isDestroyed()) {
    reactionWindow.close()
    reactionWindow = null
  }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

/**
 * On macOS, re-create the main window when the dock icon is clicked and no
 * windows are open.
 */
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createMainWindow()
    mainWindow.on('closed', () => {
      mainWindow = null
    })
  }
})

/**
 * Clean up on app quit: close the reaction window if it's still open.
 * PeerJS cleanup is handled by the renderer (LockEyesPeer.killConnection()).
 */
app.on('before-quit', () => {
  if (reactionWindow && !reactionWindow.isDestroyed()) {
    reactionWindow.close()
    reactionWindow = null
  }
})
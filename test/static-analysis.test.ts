/**
 * test/static-analysis.test.ts — Static analysis and code quality checks.
 *
 * Catches bugs that don't require runtime: missing exports, type mismatches,
 * config issues, dead code paths, and structural problems.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(__dirname, '..')

// Helper to read a source file
function readSource(file: string): string {
  return fs.readFileSync(path.join(ROOT, file), 'utf-8')
}

describe('Static Analysis', () => {
  describe('file structure', () => {
    it('has all required source files', () => {
      const required = [
        'electron/main.ts',
        'electron/preload.ts',
        'electron/reaction-preload.ts',
        'electron/peer.ts',
        'src/App.tsx',
        'src/Handshake.tsx',
        'src/main.tsx',
        'src/peer.ts',
        'src/styles.css',
        'src/global.d.ts',
        'index.html',
        'package.json',
        'vite.config.ts',
        'tsconfig.json',
        'vitest.config.ts',
      ]
      for (const f of required) {
        expect(fs.existsSync(path.join(ROOT, f)), `Missing: ${f}`).toBe(true)
      }
    })
  })

  describe('electron/main.ts', () => {
    const main = readSource('electron/main.ts')

    it('uses contextIsolation: true for the main window', () => {
      expect(main).toContain('contextIsolation: true')
    })

    it('uses nodeIntegration: false for the main window', () => {
      expect(main).toContain('nodeIntegration: false')
    })

    it('uses contextIsolation: true for the reaction window', () => {
      // Should appear at least twice (main + reaction)
      const matches = main.match(/contextIsolation:\s*true/g)
      expect(matches?.length).toBeGreaterThanOrEqual(2)
    })

    it('uses nodeIntegration: false for the reaction window', () => {
      const matches = main.match(/nodeIntegration:\s*false/g)
      expect(matches?.length).toBeGreaterThanOrEqual(2)
    })

    it('sets content protection on the reaction window', () => {
      expect(main).toContain('setContentProtection(true)')
    })

    it('sets alwaysOnTop on the reaction window', () => {
      expect(main).toContain('alwaysOnTop: true')
    })

    it('registers all IPC handlers from preload', () => {
      const handlers = [
        'cameras:get',
        'cameras:start',
        'cameras:stop',
        'peer:create',
        'peer:join',
        'peer:accept',
        'peer:decline',
        'peer:kill',
        'reaction:open',
        'reaction:close',
      ]
      for (const h of handlers) {
        expect(main).toContain(`'${h}'`), `Missing IPC handler: ${h}`
      }
    })

    it('does NOT use require() in the renderer HTML', () => {
      // The reaction HTML should not use require('electron')
      expect(main).not.toContain("require('electron')")
    })

    it('sets up permission handler for camera access', () => {
      expect(main).toContain('setPermissionRequestHandler')
      expect(main).toContain("'media'")
      expect(main).toContain("'camera'")
    })

    it('sets a Content-Security-Policy via onHeadersReceived', () => {
      expect(main).toContain('onHeadersReceived')
      expect(main).toContain('Content-Security-Policy')
      expect(main).toContain('script-src')
    })

    it('allows unsafe-eval in dev mode CSP (for Vite HMR)', () => {
      expect(main).toContain('unsafe-eval')
    })

    it('uses copyGeneratedMediaStreamTrack for reaction window track passing', () => {
      expect(main).toContain('copyGeneratedMediaStreamTrack')
    })

    it('does NOT have any stale references to electron/peer.ts', () => {
      expect(main).not.toContain('from electron/peer.ts')
      expect(main).not.toContain('class from electron/peer.ts')
    })
  })

  describe('electron/preload.ts', () => {
    const preload = readSource('electron/preload.ts')

    it('uses contextBridge.exposeInMainWorld', () => {
      expect(preload).toContain('contextBridge.exposeInMainWorld')
    })

    it('exposes electronAPI on the window', () => {
      expect(preload).toContain("'electronAPI'")
    })

    it('does NOT set nodeIntegration: true or contextIsolation: false as config', () => {
      // Check for actual assignments, not just comments mentioning them
      expect(preload).not.toMatch(/nodeIntegration:\s*true/)
      expect(preload).not.toMatch(/contextIsolation:\s*false/)
    })
  })

  describe('src/peer.ts', () => {
    const peer = readSource('src/peer.ts')

    it('exports LockEyesPeer class', () => {
      expect(peer).toContain('export class LockEyesPeer')
    })

    it('exports ConnectionState type', () => {
      expect(peer).toContain('export type ConnectionState')
    })

    it('exports PeerState alias', () => {
      expect(peer).toContain('export type PeerState')
    })

    it('has all required public methods', () => {
      const methods = [
        'setLocalStream',
        'setHostName',
        'sendChatMessage',
        'createSession',
        'joinSession',
        'acceptHandshake',
        'declineHandshake',
        'killConnection',
        'destroy',
      ]
      for (const m of methods) {
        expect(peer).toContain(m), `Missing method: ${m}`
      }
    })

    it('has all required callbacks', () => {
      const callbacks = [
        'onStateChange',
        'onHandshakeRequest',
        'onPartnerName',
        'onRemoteStream',
        'onError',
        'onChatMessage',
      ]
      for (const cb of callbacks) {
        expect(peer).toContain(cb), `Missing callback: ${cb}`
      }
    })

    it('excludes ambiguous characters from code generation', () => {
      expect(peer).toContain('ABCDEFGHJKMNPQRSTUVWXYZ23456789')
      // Must NOT contain 0, O, I, 1, L
      expect(peer).not.toMatch(/chars.*[01ILO]/)
    })

    it('uses lockeyes- prefix for peer IDs', () => {
      expect(peer).toContain("'lockeyes-'")
    })

    it('uppercases the code in createSession for consistent peer IDs', () => {
      expect(peer).toContain("'lockeyes-' + code.toUpperCase()")
    })

    it('has a hostName field for sending host name to guest on accept', () => {
      expect(peer).toContain('hostName')
      expect(peer).toContain('setHostName')
    })

    it('acceptHandshake sends hostName (not partnerName) in the accept message', () => {
      expect(peer).toContain("this.hostName || 'Host'")
      // Must NOT send partnerName in the accept message anymore
      expect(peer).not.toContain("this.partnerName || 'Partner'")
    })

    it('exports ChatMessage interface', () => {
      expect(peer).toContain('export interface ChatMessage')
    })

    it('exports GameMove and GameReset interfaces', () => {
      expect(peer).toContain('export interface GameMove')
      expect(peer).toContain('export interface GameReset')
    })

    it('has sendGameMove and sendGameReset methods', () => {
      expect(peer).toContain('sendGameMove')
      expect(peer).toContain('sendGameReset')
    })

    it('has onGameMove and onGameReset callbacks', () => {
      expect(peer).toContain('onGameMove')
      expect(peer).toContain('onGameReset')
    })

    it('handles game:move and game:reset message types', () => {
      expect(peer).toContain("case 'game:move'")
      expect(peer).toContain("case 'game:reset'")
    })

    it('handles chat message type in handleDataMessage', () => {
      expect(peer).toContain("case 'chat'")
      expect(peer).toContain('onChatMessage')
    })

    it('handles unavailable-id error (code collision retry)', () => {
      expect(peer).toContain("'unavailable-id'")
    })

    it('handles peer-unavailable error (wrong code)', () => {
      expect(peer).toContain("'peer-unavailable'")
    })

    it('cleanup closes mediaConnection and dataConnection', () => {
      expect(peer).toContain('this.mediaConnection.close()')
      expect(peer).toContain('this.dataConnection.close()')
    })

    it('cleanupPeer destroys the peer', () => {
      expect(peer).toContain('this.peer.destroy()')
    })
  })

  describe('src/App.tsx', () => {
    const app = readSource('src/App.tsx')

    it('imports LockEyesPeer from ./peer (not ../electron/peer)', () => {
      expect(app).toContain("from './peer'")
      expect(app).not.toContain("from '../electron/peer'")
    })

    it('does NOT use require() for electron', () => {
      expect(app).not.toContain("require('electron')")
    })

    it('uses window.electronAPI for IPC calls', () => {
      expect(app).toContain('window.electronAPI')
    })

    it('has all state handlers', () => {
      const handlers = ['handleCreate', 'handleJoin', 'handleAccept', 'handleDecline', 'handleKill', 'handleReset', 'handleRetry']
      for (const h of handlers) {
        expect(app).toContain(h), `Missing handler: ${h}`
      }
    })

    it('renders all connection states', () => {
      const states = ["'idle'", "'creating'", "'waiting'", "'live'", "'dark'", "'error'"]
      for (const s of states) {
        expect(app).toContain(s), `Missing state render: ${s}`
      }
    })

    it('has a KILL button in live state', () => {
      expect(app).toContain('KILL')
      expect(app).toContain('btn-danger')
    })

    it('shows the live warning banner', () => {
      expect(app).toContain('LIVE')
      expect(app).toContain("Zoom camera state")
    })

    it('has a "Your name" input on the home screen for the host', () => {
      // The home screen should have a name input for the host
      expect(app).toContain("placeholder=\"Your name\"")
    })

    it('handleReset recreates the LockEyesPeer instance (not just setState)', () => {
      // handleReset should destroy the old peer and create a new one
      expect(app).toContain('peerRef.current.destroy()')
      expect(app).toContain('freshPeer')
      expect(app).toContain('new LockEyesPeer()')
    })

    it('handleCreate calls setHostName before createSession', () => {
      expect(app).toContain('setHostName')
    })

    it('has streaming chat UI with chat overlay', () => {
      expect(app).toContain('chat-overlay')
      expect(app).toContain('chat-stream')
      expect(app).toContain('chat-bubble')
    })

    it('has chat input with no-history placeholder', () => {
      expect(app).toContain('no history')
    })

    it('imports ChatMessage type from peer', () => {
      expect(app).toContain('ChatMessage')
    })

    it('has handleSendChat function', () => {
      expect(app).toContain('handleSendChat')
      expect(app).toContain('sendChatMessage')
    })

    it('shows chat overlay in live, waiting, and handshake states', () => {
      expect(app).toContain("'live'")
      expect(app).toContain("'waiting'")
      expect(app).toContain("'handshake'")
      // The chat overlay condition should include these states
      expect(app).toMatch(/state === 'live' .* state === 'waiting'/)
    })

    it('imports TicTacToe component', () => {
      expect(app).toContain("from './TicTacToe'")
      expect(app).toContain('TicTacToe')
    })

    it('has game state and refs', () => {
      expect(app).toContain('gameMove')
      expect(app).toContain('gameReset')
      expect(app).toContain('myGameSymbol')
    })

    it('assigns X to host and O to guest', () => {
      expect(app).toContain("setMyGameSymbol('X')")
      expect(app).toContain("setMyGameSymbol('O')")
    })

    it('has window focus tracking for chat accumulation', () => {
      expect(app).toContain('windowFocusedRef')
      expect(app).toContain('pendingExpiryRef')
      expect(app).toContain("addEventListener('focus'")
      expect(app).toContain("addEventListener('blur'")
    })

    it('has unread badge for accumulated chat messages', () => {
      expect(app).toContain('chat-unread-badge')
      expect(app).toContain('unread')
    })

    it('only opens reaction window when remote stream exists', () => {
      expect(app).toContain('if (remoteStreamRef.current)')
      expect(app).toContain('openReactionWindow')
    })
  })

  describe('src/global.d.ts', () => {
    const global = readSource('src/global.d.ts')

    it('declares window.electronAPI', () => {
      expect(global).toContain('electronAPI')
      expect(global).toContain('interface Window')
    })

    it('declares all ElectronAPI methods', () => {
      const methods = [
        'getCameras',
        'startCamera',
        'stopCamera',
        'createSession',
        'joinSession',
        'acceptHandshake',
        'declineHandshake',
        'killConnection',
        'openReactionWindow',
        'closeReactionWindow',
        'sendReactionStream',
        'onStateChange',
        'onHandshakeRequest',
        'onPartnerName',
        'onError',
        'removeAllListeners',
      ]
      for (const m of methods) {
        expect(global).toContain(m), `Missing type declaration: ${m}`
      }
    })
  })

  describe('vite.config.ts', () => {
    const vite = readSource('vite.config.ts')

    it('does NOT import vite-plugin-electron-renderer', () => {
      expect(vite).not.toContain('vite-plugin-electron-renderer')
      expect(vite).not.toContain('electronRenderer')
    })

    it('imports vite-plugin-electron', () => {
      expect(vite).toContain('vite-plugin-electron')
    })

    it('has entries for main, preload, reaction-preload, and peer', () => {
      expect(vite).toContain('electron/main.ts')
      expect(vite).toContain('electron/preload.ts')
      expect(vite).toContain('electron/reaction-preload.ts')
      expect(vite).toContain('electron/peer.ts')
    })
  })

  describe('package.json', () => {
    const pkg = JSON.parse(readSource('package.json'))

    it('has test scripts', () => {
      expect(pkg.scripts.test).toBeDefined()
      expect(pkg.scripts['test:watch']).toBeDefined()
    })

    it('does NOT list vite-plugin-electron-renderer as a dependency', () => {
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
      expect(allDeps).not.toHaveProperty('vite-plugin-electron-renderer')
    })

    it('has vitest as a devDependency', () => {
      expect(pkg.devDependencies).toHaveProperty('vitest')
    })

    it('has peerjs as a dependency', () => {
      expect(pkg.dependencies).toHaveProperty('peerjs')
    })

    it('main points to dist-electron/main.js', () => {
      expect(pkg.main).toBe('dist-electron/main.js')
    })
  })

  describe('.gitignore', () => {
    it('excludes node_modules, dist, and release', () => {
      const gitignore = readSource('.gitignore')
      expect(gitignore).toContain('node_modules/')
      expect(gitignore).toContain('dist/')
      expect(gitignore).toContain('release/')
    })
  })

  describe('no stale references', () => {
    it('src/App.tsx does not import from electron/ directory', () => {
      const app = readSource('src/App.tsx')
      expect(app).not.toMatch(/from\s+['"]\.\.\/electron\//)
    })

    it('index.html has a Content-Security-Policy meta tag', () => {
      const html = readSource('index.html')
      expect(html).toContain('Content-Security-Policy')
    })

    it('styles.css has streaming chat styles', () => {
      const css = readSource('src/styles.css')
      expect(css).toContain('.chat-overlay')
      expect(css).toContain('.chat-bubble')
      expect(css).toContain('.chat-stream')
      expect(css).toContain('chat-stream-in')
      expect(css).toContain('chat-fade-out')
    })

    it('styles.css has tic-tac-toe styles', () => {
      const css = readSource('src/styles.css')
      expect(css).toContain('.tictactoe')
      expect(css).toContain('.tictactoe-board')
      expect(css).toContain('.tictactoe-cell')
      expect(css).toContain('.cell-x')
      expect(css).toContain('.cell-o')
    })

    it('styles.css has unread badge style', () => {
      const css = readSource('src/styles.css')
      expect(css).toContain('.chat-unread-badge')
    })

    it('TicTacToe.tsx exists and exports component', () => {
      const ttt = readSource('src/TicTacToe.tsx')
      expect(ttt).toContain('export default function TicTacToe')
      expect(ttt).toContain('WINNING_LINES')
    })
  })
})
# Dogfood QA Report

**Target:** Lock Eyes — Electron + React + PeerJS desktop app
**Date:** July 8, 2026
**Scope:** Full codebase — static analysis, unit tests, integration tests, code quality review
**Tester:** Hermes Agent (automated QA)

---

## Executive Summary

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 0 |
| 🟡 Medium | 3 |
| 🔵 Low | 4 |
| **Total** | **7** |

**Overall Assessment:** Code is structurally sound and all 81 automated tests pass. The 7 findings are code quality and robustness improvements, not blocking defects. The app is ready for end-to-end manual testing with two participants.

---

## Issues

### Issue #1: acceptHandshake sends partner's name back as "Partner" instead of host's name

| Field | Value |
|-------|-------|
| **Severity** | 🟡 Medium |
| **Category** | Functional |
| **URL** | `src/peer.ts:284` |

**Description:**
When the host accepts a handshake, `acceptHandshake()` sends `{type: 'accept', name: this.partnerName || 'Partner'}`. But `this.partnerName` at that point holds the *guest's* name (set by the guest's request message), not the host's name. The guest receives the host's name as their own name, which is displayed incorrectly.

**Steps to Reproduce:**
1. Host creates session, guest joins as "Alice"
2. Host sees "Alice wants to lock eyes" and clicks Accept
3. Host's `acceptHandshake()` sends `{type: 'accept', name: 'Alice'}` (the guest's name)
4. Guest receives `onPartnerName('Alice')` — sees their own name instead of the host's

**Expected Behavior:** The guest should see the host's name.
**Actual Behavior:** The guest sees their own name.

**Fix:** The host's name needs to be passed to the `LockEyesPeer` instance (via a setter or constructor arg) and used in the accept message instead of `this.partnerName`.

---

### Issue #2: No host name input on the "Create Session" screen

| Field | Value |
|-------|-------|
| **Severity** | 🟡 Medium |
| **Category** | UX / Functional |
| **URL** | `src/App.tsx:320-331` |

**Description:**
The "Create Session" flow doesn't ask for the host's name. The "Join Session" flow has a "Your name" input, but the host side doesn't. This means the guest will never know the host's name (related to Issue #1).

**Expected Behavior:** Host should enter their name before or after creating a session.
**Actual Behavior:** Host name is never collected.

**Fix:** Add a name input to the idle/home screen or to the creating/waiting screen.

---

### Issue #3: Comment in main.ts still references "electron/peer.ts" in IPC handler docs

| Field | Value |
|-------|-------|
| **Severity** | 🟡 Medium |
| **Category** | Documentation |
| **URL** | `electron/main.ts:207-208` |

**Description:**
The IPC handler comment block says "runs entirely in the renderer via the LockEyesPeer class from electron/peer.ts" but the file was moved to `src/peer.ts`. The file-level comment was fixed but the inline IPC handler comment was not.

**Expected Behavior:** All comments reference the correct file path.
**Actual Behavior:** Two stale references to `electron/peer.ts` remain in inline comments.

**Fix:** Update the comment at line 207 to say `src/peer.ts`.

---

### Issue #4: `handleReset` doesn't reset the `state` through the peer — it directly calls `setState`

| Field | Value |
|-------|-------|
| **Severity** | 🔵 Low |
| **Category** | Functional |
| **URL** | `src/App.tsx:249-257` |

**Description:**
`handleReset()` calls `setState('idle')` directly on React state, but doesn't call `peerRef.current?.destroy()` or create a new `LockEyesPeer` instance. If the old peer was destroyed (from `killConnection`), the peer instance may be in a bad state. The next `createSession()` or `joinSession()` call could fail silently.

**Expected Behavior:** Reset should create a fresh `LockEyesPeer` instance.
**Actual Behavior:** Reuses the old (possibly destroyed) peer instance.

**Fix:** Re-instantiate the peer in `handleReset`, or recreate it lazily before the next session.

---

### Issue #5: `joinSession` uppercases the code but `createSession` does not

| Field | Value |
|-------|-------|
| **Severity** | 🔵 Low |
| **Category** | Functional |
| **URL** | `src/peer.ts:219` vs `src/peer.ts:161` |

**Description:**
In `joinSession()`, the code is uppercased: `'lockeyes-' + code.toUpperCase()`. But `generateCode()` already returns uppercase, and `createSession()` uses `'lockeyes-' + code` without uppercasing. This works because `generateCode()` returns uppercase, but it's inconsistent. If someone manually sets a lowercase code, the join would work but the host's peer ID wouldn't match.

**Expected Behavior:** Consistent casing on both sides.
**Actual Behavior:** Join uppercases, create doesn't — relies on `generateCode()` always returning uppercase.

**Fix:** Uppercase in `createSession()` too, or remove the `toUpperCase()` from `joinSession()`.

---

### Issue #6: `reaction:set-stream` IPC handler uses `ipcMain.on` but preload uses `ipcRenderer.send`

| Field | Value |
|-------|-------|
| **Severity** | 🔵 Low |
| **Category** | Functional |
| **URL** | `electron/main.ts:356`, `electron/preload.ts:63` |

**Description:**
The preload exposes `sendReactionStream` which calls `ipcRenderer.send('reaction:set-stream', tracks)`. The main process registers `ipcMain.on('reaction:set-stream', ...)`. This works, but `MediaStreamTrack` objects may not survive IPC serialization in Electron — they're not plain JSON. The tracks need to be passed as Electron's native `WebFrameMain` track references, not serialized.

**Expected Behavior:** Remote video tracks display in the reaction window.
**Actual Behavior:** May silently fail depending on Electron version — `MediaStreamTrack` objects don't always survive structured clone across IPC.

**Fix:** Use `webContents.copyGeneratedMediaStreamTrack` or pass track IDs and reconstruct on the other side. This is a known Electron limitation. For the MVP, the in-window `<video>` element in the live screen is the fallback.

---

### Issue #7: No CSP (Content-Security-Policy) header set

| Field | Value |
|-------|-------|
| **Severity** | 🔵 Low |
| **Category** | Security |
| **URL** | `electron/main.ts` (missing) |

**Description:**
The app doesn't set a Content-Security-Policy. In dev mode, Vite injects one, but in production there's no CSP at all. The bug report mentioned a "security warning about an insecure Content-Security-Policy" in the console.

**Expected Behavior:** A CSP is set that restricts script sources to `'self'` and allows WebRTC connections.
**Actual Behavior:** No CSP → Electron logs a deprecation warning.

**Fix:** Add a CSP meta tag to `index.html` or set it via `session.defaultSession.webRequest.onHeadersReceived`.

---

## Issues Summary Table

| # | Title | Severity | Category | Location |
|---|-------|----------|----------|----------|
| 1 | acceptHandshake sends wrong name to guest | 🟡 Medium | Functional | `src/peer.ts:284` |
| 2 | No host name input on Create Session screen | 🟡 Medium | UX | `src/App.tsx:320` |
| 3 | Stale comment references electron/peer.ts | 🟡 Medium | Documentation | `electron/main.ts:207` |
| 4 | handleReset doesn't recreate LockEyesPeer | 🔵 Low | Functional | `src/App.tsx:249` |
| 5 | Inconsistent code casing between create and join | 🔵 Low | Functional | `src/peer.ts:161,219` |
| 6 | MediaStreamTrack may not survive IPC serialization | 🔵 Low | Functional | `electron/main.ts:356` |
| 7 | No Content-Security-Policy header | 🔵 Low | Security | `electron/main.ts` |

## Testing Coverage

### Test Files

| File | Tests | Description |
|------|-------|-------------|
| `test/peer.test.ts` | 13 | LockEyesPeer: state machine, code generation, handshake, kill, destroy, error handling |
| `test/App.test.tsx` | 18 | App component: idle, join, create, handshake, live, dark, error states, button interactions |
| `test/Handshake.test.tsx` | 6 | Handshake component: rendering, partner name display, accept/decline callbacks |
| `test/static-analysis.test.ts` | 44 | Structural checks: file existence, config correctness, no stale refs, security model, exports |

### Features Tested
- LockEyesPeer state machine (idle → creating → waiting → handshake → live → dark → error)
- Session code generation (4 chars, ambiguous characters excluded)
- Handshake protocol (request/accept/decline messages)
- Kill switch (instant teardown, idempotent)
- Error handling (no data connection, no local stream)
- App UI rendering for all connection states
- Camera dropdown population
- Join form validation (4-char code requirement)
- KILL button triggers killConnection
- Handshake modal accept/decline
- Dark state "Start new session" reset
- Error state "Try again" retry
- Static: contextIsolation true, nodeIntegration false
- Static: no `require('electron')` in renderer code
- Static: correct import paths (no stale `../electron/peer` references)
- Static: all IPC handlers registered
- Static: all preload API methods declared
- Static: vite config has no `vite-plugin-electron-renderer`
- Static: all required files exist

### Not Tested / Out of Scope
- **Real PeerJS connection** — requires network and two running instances. Must be tested manually.
- **Camera capture** — requires real hardware and permissions. Mocked in tests.
- **Reaction window** — requires Electron display. Can't test in jsdom.
- **WebRTC video stream** — requires real P2P connection. Mocked.
- **Electron main process** — requires Electron runtime. Static analysis only.

### Blockers
- None. All tests pass.

---

## Test Results

```
Test Files  4 passed (4)
     Tests  81 passed (81)
  Duration  780ms
```

Run with: `npm test`

---

## Recommendations

1. **Fix Issue #1 and #2 together** — Add a host name input and pass it through to the guest. This is the most impactful fix for user experience.
2. **Fix Issue #4** — Recreate the LockEyesPeer instance on reset to avoid stale state.
3. **Fix Issue #6** — Research Electron's `copyGeneratedMediaStreamTrack` API for passing tracks between windows. If too complex for MVP, document the in-window video as the primary display.
4. **Add end-to-end test** — Two app instances connecting via a local PeerJS server would catch integration bugs that unit tests miss.

---

*Report generated: July 8, 2026*
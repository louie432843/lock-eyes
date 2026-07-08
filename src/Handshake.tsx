/**
 * Handshake.tsx — Accept/decline popup for incoming Lock Eyes requests.
 *
 * When someone tries to join your session (or you try to join theirs), the
 * receiving side sees this modal overlay. It shows the partner's name and
 * gives you a clear choice: Accept to begin the video side channel, or
 * Decline to reject.
 *
 * Props:
 *   partnerName — the name of the person requesting to lock eyes
 *   onAccept    — callback when the user clicks Accept
 *   onDecline  — callback when the user clicks Decline
 */

import React from 'react'

interface HandshakeProps {
  partnerName: string
  onAccept: () => void
  onDecline: () => void
}

const Handshake: React.FC<HandshakeProps> = ({ partnerName, onAccept, onDecline }) => {
  const displayName = partnerName || 'Someone'

  return (
    <div className="handshake-overlay">
      <div className="handshake-modal">
        <div className="handshake-icon">👁</div>
        <h2 className="handshake-title">{displayName} wants to lock eyes with you.</h2>
        <p className="handshake-description">
          They&apos;ll be able to see your face via your secondary camera.
          You can kill the connection at any time.
        </p>
        <div className="handshake-buttons">
          <button className="btn btn-primary handshake-accept" onClick={onAccept}>
            Accept
          </button>
          <button className="btn btn-secondary handshake-decline" onClick={onDecline}>
            Decline
          </button>
        </div>
      </div>
    </div>
  )
}

export default Handshake
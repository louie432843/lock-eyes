/**
 * src/TicTacToe.tsx — Tic-tac-toe game playable over the Lock Eyes data channel.
 *
 * The host is always 'X' (goes first), the guest is always 'O'.
 * Moves are sent via peer.sendGameMove() and received via peer.onGameMove().
 * The board is local state — no server, no validation beyond turn order.
 */

import { useState, useCallback, useEffect } from 'react'
import type { GameMove, GameReset } from './peer'

type Cell = 'X' | 'O' | null
type Board = Cell[]

const WINNING_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],  // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8],  // cols
  [0, 4, 8], [2, 4, 6],              // diagonals
]

function checkWinner(board: Board): Cell {
  for (const [a, b, c] of WINNING_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a]
    }
  }
  return null
}

function isBoardFull(board: Board): boolean {
  return board.every((cell) => cell !== null)
}

interface TicTacToeProps {
  mySymbol: 'X' | 'O'
  onMove: (position: number) => void
  onReset: () => void
  incomingMove: GameMove | null
  incomingReset: GameReset | null
}

export default function TicTacToe({ mySymbol, onMove, onReset, incomingMove, incomingReset }: TicTacToeProps) {
  const [board, setBoard] = useState<Board>(Array(9).fill(null))
  const [isMyTurn, setIsMyTurn] = useState(mySymbol === 'X') // X goes first
  const [winner, setWinner] = useState<Cell>(null)
  const [draw, setDraw] = useState(false)
  const [moveCount, setMoveCount] = useState(0)

  // Process incoming move from partner
  useEffect(() => {
    if (!incomingMove) return
    if (incomingMove.position < 0 || incomingMove.position > 8) return

    setBoard((prev) => {
      // Ignore if cell already taken or game is over
      if (prev[incomingMove.position] !== null) return prev
      if (winner || draw) return prev

      const next = [...prev]
      next[incomingMove.position] = incomingMove.player
      const w = checkWinner(next)
      if (w) {
        setWinner(w)
      } else if (isBoardFull(next)) {
        setDraw(true)
      }
      return next
    })
    setIsMyTurn(true)
    setMoveCount((m) => m + 1)
  }, [incomingMove, winner, draw])

  // Process incoming reset from partner
  useEffect(() => {
    if (!incomingReset) return
    setBoard(Array(9).fill(null))
    setWinner(null)
    setDraw(false)
    setMoveCount(0)
    setIsMyTurn(incomingReset.initiatedBy === mySymbol ? false : true)
  }, [incomingReset, mySymbol])

  const handleCellClick = useCallback((index: number) => {
    if (board[index] !== null || winner || draw || !isMyTurn) return

    setBoard((prev) => {
      const next = [...prev]
      next[index] = mySymbol
      const w = checkWinner(next)
      if (w) {
        setWinner(w)
      } else if (isBoardFull(next)) {
        setDraw(true)
      }
      return next
    })
    setIsMyTurn(false)
    setMoveCount((m) => m + 1)
    onMove(index)
  }, [board, winner, draw, isMyTurn, mySymbol, onMove])

  const handleResetClick = useCallback(() => {
    setBoard(Array(9).fill(null))
    setWinner(null)
    setDraw(false)
    setMoveCount(0)
    setIsMyTurn(mySymbol === 'X')
    onReset()
  }, [mySymbol, onReset])

  const status = winner
    ? winner === mySymbol ? '🎉 You win!' : `${winner} wins!`
    : draw
      ? "It's a draw!"
      : isMyTurn
        ? 'Your turn'
        : `${mySymbol === 'X' ? 'O' : 'X'}'s turn`

  return (
    <div className="tictactoe">
      <div className="tictactoe-header">
        <span className="tictactoe-status">{status}</span>
        <span className="tictactoe-symbol">You are {mySymbol}</span>
      </div>
      <div className="tictactoe-board">
        {board.map((cell, i) => (
          <button
            key={i}
            className={`tictactoe-cell ${cell ? `cell-${cell.toLowerCase()}` : ''}`}
            onClick={() => handleCellClick(i)}
            disabled={cell !== null || winner !== null || draw || !isMyTurn}
          >
            {cell || ''}
          </button>
        ))}
      </div>
      <button className="btn btn-secondary tictactoe-reset" onClick={handleResetClick}>
        ↻ New game
      </button>
    </div>
  )
}
import { useState, useRef, useEffect } from 'react'
import story from '../data/story.json'
import {
  calcAccuracy,
  calcWPM,
  calcLongestStreak,
  getCharStates,
} from '../logic/accuracyEngine'
import { resolveNext } from '../logic/branchResolver'

const MAX_TRANSMISSIONS = 6

// Central game-state hook. Owns the current node, the player's typed text,
// the high-level phase, live stats, the history of completed nodes, and the
// transmission counter. Components read everything they need from the
// returned object.
export function useGameState() {
  const [nodeId, setNodeId] = useState('tx01')
  const [typed, setTyped] = useState('')
  const [phase, setPhase] = useState('intro')
  const [stats, setStats] = useState({ wpm: 0, accuracy: 100 })
  const [nodeHistory, setNodeHistory] = useState([])
  const [transmissionNumber, setTransmissionNumber] = useState(1)

  const startTime = useRef(null)
  const inputRef = useRef(null)

  // Derived values recomputed every render.
  const node = story[nodeId]
  const target = node.text
  const charStates = getCharStates(typed, target)

  // Start the clock on the very first keystroke of a transmission.
  useEffect(() => {
    if (typed.length === 1 && startTime.current === null) {
      startTime.current = Date.now()
    }
  }, [typed])

  // Recalculate live stats whenever the player has typed something.
  useEffect(() => {
    if (typed.length > 0) {
      const elapsedSeconds = startTime.current
        ? (Date.now() - startTime.current) / 1000
        : 0
      setStats({
        wpm: calcWPM(typed, elapsedSeconds),
        accuracy: calcAccuracy(typed, target),
      })
    }
  }, [typed, target])

  function handleComplete() {
    const finalAccuracy = calcAccuracy(typed, target)
    const elapsedSeconds = startTime.current
      ? (Date.now() - startTime.current) / 1000
      : 0
    const wpm = calcWPM(typed, elapsedSeconds)
    setNodeHistory((prev) => [
      ...prev,
      {
        nodeId,
        accuracy: finalAccuracy,
        wpm,
        seconds: Math.max(1, Math.round(elapsedSeconds)),
        streak: calcLongestStreak(typed, target),
        chars: typed.length,
      },
    ])

    const next = resolveNext(node, finalAccuracy)

    if (next === null || story[next].ending) {
      // Terminal node reached (either current node is an ending, or the next
      // node is one). Advance to the ending node if there is one, then show
      // the result screen.
      if (next) setNodeId(next)
      setPhase('result')
    } else {
      // Continue to the next transmission.
      setNodeId(next)
      setTyped('')
      setTransmissionNumber((prev) => Math.min(prev + 1, MAX_TRANSMISSIONS))
      startTime.current = null
    }
  }

  function handleKeyDown(e) {
    if (phase !== 'playing') return

    if (e.key === 'Backspace') {
      e.preventDefault()
      setTyped((prev) => prev.slice(0, -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (typed.length >= target.length) handleComplete()
    } else if (e.key.length === 1) {
      e.preventDefault()
      // Guard the length INSIDE the updater so it always sees the freshest
      // value. Reading typed.length from the render closure here would be
      // stale under fast input and let characters append past target.length
      // (overtyping), which corrupts accuracy and every metric derived from it.
      setTyped((prev) => (prev.length < target.length ? prev + e.key : prev))
    }
  }

  function restart() {
    setNodeId('tx01')
    setTyped('')
    setPhase('intro')
    setStats({ wpm: 0, accuracy: 100 })
    setNodeHistory([])
    setTransmissionNumber(1)
    startTime.current = null
  }

  return {
    node,
    target,
    typed,
    charStates,
    stats,
    phase,
    nodeHistory,
    transmissionNumber,
    handleKeyDown,
    restart,
    inputRef,
    setPhase,
  }
}

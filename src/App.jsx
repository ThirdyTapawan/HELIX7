import { useEffect, useState } from 'react'
import { useGameState } from './hooks/useGameState'
import StoryDisplay from './components/StoryDisplay'
import TypingInput from './components/TypingInput'
import StatsBar from './components/StatsBar'
import TransmissionTracker from './components/TransmissionTracker'
import ResultScreen from './components/ResultScreen'
import ShaderField from './components/ShaderField'
import { NEBULA_FRAG, METEOR_FRAG } from './shaders'
import { charsMatch } from './logic/accuracyEngine'
import * as audio from './audio'

const BOOT_ART = `  _   _ _____ _    _____  __    _____
 | | | | ____| |  |_ _\\ \\/ /   |___  |
 | |_| |  _| | |   | | \\  /       / /
 |  _  | |___| |___| | /  \\      / /
 |_| |_|_____|_____|___/_/\\_\\    /_/

      L A S T   T R A N S M I S S I O N`

// The boot log, one entry per line. Revealed one at a time on the intro screen
// so it reads as a transmission arriving live. Copy is unchanged from before.
const LOG_LINES = [
  '> Establishing uplink to Earth Relay Station 4...',
  '> Distress beacon acknowledged.',
  '> Incoming coordinates will arrive in 6 fragments.',
  '> Transcribe each one exactly. Errors corrupt the sequence.',
  '> The Calloway is waiting. So is your crew.',
]

export default function App() {
  const {
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
  } = useGameState()

  const [muted, setMuted] = useState(false)
  // The portion of each boot-log line typed out so far (typewriter effect).
  const [logText, setLogText] = useState(() => LOG_LINES.map(() => ''))
  // Index of the line currently typing; === LOG_LINES.length once finished.
  // Also drives the progress bar and the cursor position.
  const [activeLine, setActiveLine] = useState(0)
  // Momentary signal-glitch flag for the centered content block.
  const [glitch, setGlitch] = useState(false)
  // Live UTC clock string for the intro status bar.
  const [clock, setClock] = useState('')

  // Respect users (and test harnesses) that ask for reduced motion: skip the
  // animated WebGL background entirely for them.
  const reduceMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // Start the generative score as soon as the app loads (on the intro screen),
  // not only when the player presses INITIALIZE. Browser autoplay rules may keep
  // it silent until the first interaction; startOnLoad handles that fallback.
  useEffect(() => {
    audio.startOnLoad()
  }, [])

  // Type the boot log out one character at a time (~15ms/char), each line
  // starting only once the previous finishes, so it reads as a transmission
  // arriving live. activeLine tracks the line being typed (and the cursor),
  // and feeds the sequence-alignment progress bar. Reduced-motion users get
  // the whole log at once.
  useEffect(() => {
    if (phase !== 'intro') return
    if (reduceMotion) {
      setLogText(LOG_LINES.map((l) => l))
      setActiveLine(LOG_LINES.length)
      return
    }
    setLogText(LOG_LINES.map(() => ''))
    setActiveLine(0)
    let line = 0
    let char = 0
    let timer
    const step = () => {
      if (line >= LOG_LINES.length) {
        setActiveLine(LOG_LINES.length)
        return
      }
      const full = LOG_LINES[line]
      char += 1
      setLogText((prev) => {
        const next = prev.slice()
        next[line] = full.slice(0, char)
        return next
      })
      if (char >= full.length) {
        line += 1
        char = 0
        setActiveLine(line)
        // Brief beat between lines before the next one starts typing.
        timer = setTimeout(step, 220)
      } else {
        timer = setTimeout(step, 15)
      }
    }
    timer = setTimeout(step, 300)
    return () => clearTimeout(timer)
  }, [phase, reduceMotion])

  // Rare, brief signal glitch on the centered content. Fires every 8–12s and
  // lasts ~80ms. Skipped for reduced-motion users.
  useEffect(() => {
    if (phase !== 'intro' || reduceMotion) return
    let offTimer
    let nextTimer
    const schedule = () => {
      nextTimer = setTimeout(() => {
        setGlitch(true)
        offTimer = setTimeout(() => setGlitch(false), 80)
        schedule()
      }, 8000 + Math.random() * 4000)
    }
    schedule()
    return () => {
      clearTimeout(nextTimer)
      clearTimeout(offTimer)
    }
  }, [phase, reduceMotion])

  // Live UTC clock for the intro status bar, ticking once a second.
  useEffect(() => {
    const tick = () => setClock(new Date().toISOString().slice(11, 19) + ' UTC')
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // Auto-focus the typing area whenever play begins so the player can type
  // immediately without clicking.
  useEffect(() => {
    if (phase === 'playing' && inputRef.current) {
      inputRef.current.focus()
    }
  }, [phase, node, inputRef])

  // Tighten the score as the mission nears its final transmission.
  useEffect(() => {
    audio.setIntensity((transmissionNumber - 1) / 5)
  }, [transmissionNumber])

  // Ending stinger when the result screen appears.
  useEffect(() => {
    if (phase === 'result') audio.playResult(node.ending || 'neutral')
  }, [phase, node])

  function beginGame() {
    // First real user gesture: safe to spin up audio + the generative score.
    audio.start()
    setPhase('playing')
    // Focus on the next tick once the typing area has rendered.
    requestAnimationFrame(() => {
      if (inputRef.current) inputRef.current.focus()
    })
  }

  function toggleMute() {
    const next = !muted
    setMuted(next)
    audio.setMuted(next)
  }

  // Wrap the game's key handler so each keystroke also fires the right blip.
  function onTypingKeyDown(e) {
    if (e.key === 'Enter') {
      if (typed.length >= target.length) audio.playEnter()
    } else if (e.key === 'Backspace') {
      audio.playKey(true)
    } else if (e.key.length === 1 && typed.length < target.length) {
      audio.playKey(charsMatch(e.key, target[typed.length]))
    }
    handleKeyDown(e)
  }

  return (
    <div className="app-shell">
      {!reduceMotion &&
        (phase === 'intro' ? (
          <ShaderField fragmentShader={NEBULA_FRAG} className="shader-bg shader-bg--nebula" />
        ) : (
          <ShaderField fragmentShader={METEOR_FRAG} className="shader-bg shader-bg--meteor" maxDpr={1} />
        ))}
      <header className="header-bar">
        <span className="header-left">HELIX-7 // COMM TERMINAL v4.2</span>
        <span className="header-right">
          <span className="uplink-status">
            <span className="uplink-dot" aria-hidden="true" />
            UPLINK ACTIVE
          </span>
          <button
            className="mute-toggle"
            onClick={toggleMute}
            aria-label={muted ? 'Unmute audio' : 'Mute audio'}
          >
            {muted ? '[ ♪ OFF ]' : '[ ♪ ON ]'}
          </button>
          <span className="sol-readout">SOL 847</span>
        </span>
      </header>

      {phase === 'intro' && (
        <>
          {/* HUD framing (scanlines, vignette, corner brackets) lives OUTSIDE
              .intro-screen: that element's intro animation applies a filter,
              which creates a containing block and would trap these
              position:fixed overlays inside its padded box. As direct children
              of .app-shell (opacity-only animation, no containing block) they
              anchor to the viewport instead. */}
          <div className="crt-overlay" aria-hidden="true" />
          <span className="corner-bracket corner-bl" aria-hidden="true" />
          <span className="corner-bracket corner-br" aria-hidden="true" />

        <div className="intro-screen">
          {/* Logo + boot copy share one left edge; this whole block is centred
              as a unit, with the button centred under it. The glitch class
              fires a brief signal-disruption shift every 8–12s. */}
          <div className={`boot-block${glitch ? ' glitch' : ''}`}>
            {/* Signal-strength indicator: five live bars, two dim. */}
            <div className="signal-bars" aria-hidden="true">
              <span className="sig-bar sig-on" />
              <span className="sig-bar sig-on" />
              <span className="sig-bar sig-on" />
              <span className="sig-bar sig-on" />
              <span className="sig-bar sig-on" />
              <span className="sig-bar sig-off" />
              <span className="sig-bar sig-off" />
            </div>

            <pre className="boot-art">{BOOT_ART}</pre>

            <div className="boot-text">
              {LOG_LINES.map((line, i) => {
                // Status confirmations (lines 2 and 5) read brighter than the
                // general informational output, terminal-style.
                const bright = i === 1 || i === 4
                // Cursor sits on the line currently typing; once the whole log
                // is done (activeLine past the end) it rests on the last line.
                const cursorHere =
                  activeLine < LOG_LINES.length
                    ? i === activeLine
                    : i === LOG_LINES.length - 1
                return (
                  <p
                    key={i}
                    className={`log-line${bright ? ' log-bright' : ''}`}
                  >
                    {logText[i]}
                    {cursorHere && <span className="cursor-blink">_</span>}
                  </p>
                )
              })}
            </div>

            {/* Sequence-alignment progress, filled as each log line lands. */}
            <div className="boot-progress" aria-hidden="true">
              <div className="progress-labels">
                <span>SEQUENCE ALIGNMENT</span>
                <span>{Math.round((activeLine / LOG_LINES.length) * 100)}%</span>
              </div>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{ width: `${(activeLine / LOG_LINES.length) * 100}%` }}
                />
              </div>
              <div className="progress-ticks">
                <span>0</span>
                <span>25</span>
                <span>50</span>
                <span>75</span>
                <span>100</span>
              </div>
            </div>
          </div>

          <button
            className={`terminal-btn${activeLine >= LOG_LINES.length ? ' is-ready' : ''}`}
            onClick={beginGame}
          >
            <span className="btn-label">INITIALIZE TERMINAL</span>
          </button>
        </div>

          {/* Bottom status bar with the live UTC clock. Kept OUTSIDE
              .intro-screen (same filter-trap reason as the HUD framing) so its
              fixed full-width spans the true viewport edges. */}
          <div className="intro-statusbar" aria-hidden="true">
            <span className="statusbar-left">MEM 0×7F40 OK · ERR 00</span>
            <span className="statusbar-mid">{clock}</span>
            <span className="statusbar-right">SIGNAL 71%</span>
          </div>
        </>
      )}

      {phase === 'playing' && (
        <>
          <StatsBar
            wpm={stats.wpm}
            accuracy={stats.accuracy}
            transmissionNumber={transmissionNumber}
            phase={phase}
          />
          <TransmissionTracker
            transmissionNumber={transmissionNumber}
            nodeHistory={nodeHistory}
          />
          <StoryDisplay text={node.text} />
          <TypingInput
            charStates={charStates}
            target={target}
            onKeyDown={onTypingKeyDown}
            inputRef={inputRef}
          />
          <p className="type-hint">
            &gt; TRANSCRIBE THE TRANSMISSION — PRESS [ENTER] WHEN COMPLETE
          </p>
        </>
      )}

      {phase === 'result' && (
        <ResultScreen
          node={node}
          nodeHistory={nodeHistory}
          onRestart={restart}
        />
      )}
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'

// Final debrief. Shows the closing story beat, the ending badge, a set of
// headline performance cards, a per-transmission telemetry table, and an
// analytical "operator profile" derived entirely from the data the game
// actually tracks per transmission: { accuracy, wpm, seconds, streak, chars }.
const ENDING_LABELS = {
  good: 'SIGNAL RECOVERED',
  neutral: 'PARTIAL RECOVERY',
  bad: 'SIGNAL LOST',
}

// Accuracy colour tiers: green for high, amber for mid, red only for low.
function accTier(acc) {
  if (acc >= 90) return 'good'
  if (acc >= 70) return 'warn'
  return 'bad'
}

// Speed tiers are relative to the run's own average, so the same green/amber/red
// language reads as "fast / typical / slow for this operator" rather than danger.
function speedTier(wpm, avg) {
  if (avg <= 0) return 'good'
  const ratio = wpm / avg
  if (ratio >= 0.95) return 'good'
  if (ratio >= 0.7) return 'warn'
  return 'bad'
}

// Combined per-transmission score: accuracy is the backbone, speed (normalised
// to the player's own peak) adds up to a 10-point bonus so a fast clean run
// outranks a slow clean one.
function scoreOf(h, peakWpm) {
  const speedFactor = peakWpm > 0 ? (h.wpm || 0) / peakWpm : 0
  return h.accuracy + speedFactor * 10
}

// Operator rank band from a 0–100ish composite of accuracy + speed.
function operatorClass(score) {
  if (score >= 97) return { grade: 'S', tier: 'ELITE OPERATOR' }
  if (score >= 92) return { grade: 'A+', tier: 'EXCEPTIONAL' }
  if (score >= 88) return { grade: 'A', tier: 'HIGHLY PROFICIENT' }
  if (score >= 84) return { grade: 'A-', tier: 'PROFICIENT' }
  if (score >= 80) return { grade: 'B+', tier: 'CAPABLE' }
  if (score >= 75) return { grade: 'B', tier: 'COMPETENT' }
  if (score >= 68) return { grade: 'B-', tier: 'DEVELOPING' }
  if (score >= 60) return { grade: 'C', tier: 'UNSTEADY' }
  if (score >= 50) return { grade: 'D', tier: 'STRUGGLING' }
  return { grade: 'E', tier: 'SIGNAL DEGRADED' }
}

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

// Ticks a value up from 0 to `target` on an ease-out curve so the headline
// debrief numbers count up dramatically when the result screen mounts. Honours
// reduced-motion by snapping straight to the final figure.
function useCountUp(target, { duration = 1100, delay = 0 } = {}) {
  const [value, setValue] = useState(0)
  const rafRef = useRef()

  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(target)
      return
    }
    let start
    function step(now) {
      if (start === undefined) start = now
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3) // easeOutCubic
      setValue(target * eased)
      if (t < 1) rafRef.current = requestAnimationFrame(step)
      else setValue(target)
    }
    const timeoutId = setTimeout(() => {
      rafRef.current = requestAnimationFrame(step)
    }, delay)
    return () => {
      clearTimeout(timeoutId)
      cancelAnimationFrame(rafRef.current)
    }
  }, [target, duration, delay])

  return value
}

// One headline aggregate, with its number counting up to the real figure.
function CountUpStat({ label, value, suffix = '', delay }) {
  const shown = useCountUp(value, { delay })
  return (
    <div className="stat result-stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">
        {Math.round(shown)}
        {suffix}
      </span>
    </div>
  )
}

export default function ResultScreen({ node, nodeHistory, onRestart }) {
  const total = nodeHistory.length
  const avgAccuracy =
    total > 0
      ? Math.round(nodeHistory.reduce((s, h) => s + h.accuracy, 0) / total)
      : 0
  const avgWpm =
    total > 0
      ? Math.round(nodeHistory.reduce((s, h) => s + (h.wpm || 0), 0) / total)
      : 0
  const peakWpm = total > 0 ? Math.max(...nodeHistory.map((h) => h.wpm || 0)) : 0
  // Scale the speed bars against the player's own best run (min floor so a slow
  // session still shows meaningful relative lengths).
  const wpmScale = Math.max(peakWpm, 1)

  // --- Consistency: standard deviation of WPM across transmissions. Labelled
  // off the coefficient of variation so it stays meaningful whether the run is
  // 10 WPM or 200 WPM, but the raw stdev is what we display. ---
  const variance =
    total > 0
      ? nodeHistory.reduce((s, h) => s + ((h.wpm || 0) - avgWpm) ** 2, 0) / total
      : 0
  const stdev = Math.sqrt(variance)
  const cv = avgWpm > 0 ? stdev / avgWpm : 0
  const consistencyLabel =
    cv < 0.15 ? 'STEADY' : cv < 0.35 ? 'VARIABLE' : 'ERRATIC'

  // --- Best transmission hero (highest combined score) ---
  let bestIdx = 0
  for (let i = 1; i < total; i++) {
    if (scoreOf(nodeHistory[i], peakWpm) > scoreOf(nodeHistory[bestIdx], peakWpm))
      bestIdx = i
  }
  const best = nodeHistory[bestIdx]

  // --- Improvement trend: first-half vs second-half accuracy ---
  const half = Math.floor(total / 2)
  const avgOf = (arr) =>
    arr.length ? arr.reduce((s, h) => s + h.accuracy, 0) / arr.length : 0
  const firstAcc = avgOf(nodeHistory.slice(0, half))
  const secondAcc = avgOf(nodeHistory.slice(total - half))
  const trendDelta = half > 0 ? Math.round(secondAcc - firstAcc) : 0
  const trendArrow = trendDelta > 0 ? '↑' : trendDelta < 0 ? '↓' : '→'
  const trendTier = trendDelta > 0 ? 'good' : trendDelta < 0 ? 'bad' : 'warn'

  // --- Operator class: composite of avg accuracy + a modest speed bump ---
  const speedBump = Math.min(10, (avgWpm / 40) * 10)
  const opScore = avgAccuracy * 0.9 + speedBump
  const op = operatorClass(opScore)

  // --- Longest clean streak across all transmissions ---
  let streakIdx = 0
  for (let i = 1; i < total; i++) {
    if ((nodeHistory[i].streak || 0) > (nodeHistory[streakIdx].streak || 0))
      streakIdx = i
  }
  const bestStreak = total > 0 ? nodeHistory[streakIdx].streak || 0 : 0

  const ending = node.ending || 'neutral'
  const label = ENDING_LABELS[ending] || ENDING_LABELS.neutral

  const txLabel = (i) => `TX${String(i + 1).padStart(2, '0')}`

  return (
    <div className="result-screen">
      <div className={`ending-badge ending-${ending}`}>{label}</div>

      <div className="story-display" key={node.text}>
        <span className="story-prefix">&gt; FINAL TRANSMISSION //</span>
        <p className="story-text">{node.text}</p>
      </div>

      {/* Headline performance cards */}
      <div className="result-summary">
        <CountUpStat label="AVG ACCURACY" value={avgAccuracy} suffix="%" delay={350} />
        <CountUpStat label="AVG SPEED" value={avgWpm} suffix=" WPM" delay={460} />

        <div className="stat result-stat result-card">
          <span className="stat-label">CONSISTENCY</span>
          <span className={`stat-value consistency-${consistencyLabel.toLowerCase()}`}>
            {consistencyLabel}
          </span>
          <span className="result-card-sub">σ {stdev.toFixed(1)} WPM</span>
        </div>

        <div className="stat result-stat result-card">
          <span className="stat-label">TREND</span>
          <span className={`stat-value tx-val-${trendTier}`}>
            {trendArrow} {trendDelta > 0 ? '+' : ''}
            {trendDelta}%
          </span>
          <span className="result-card-sub">first vs. last half</span>
        </div>
      </div>

      {/* Best transmission callout */}
      <div className="result-hero">
        <span className="result-hero-label">&gt; BEST TRANSMISSION</span>
        <span className="result-hero-value">
          {txLabel(bestIdx)} — {best ? best.wpm || 0 : 0} WPM @{' '}
          <span className={`tx-val-${accTier(best ? best.accuracy : 0)}`}>
            {best ? best.accuracy : 0}%
          </span>
        </span>
      </div>

      {/* Per-transmission telemetry table */}
      <div className="tx-table">
        <div className="tx-table-title">&gt; PER-TRANSMISSION TELEMETRY</div>

        <div className="tx-thead">
          <span className="th-tx">TX</span>
          <span className="th-speed">SPEED</span>
          <span className="th-acc">ACCURACY</span>
          <span className="th-time">TIME</span>
        </div>

        {nodeHistory.map((h, i) => (
          <div
            className="tx-trow"
            key={h.nodeId + i}
            style={{ '--row-delay': `${0.95 + i * 0.09}s` }}
          >
            <span className="txc-id">{txLabel(i)}</span>

            <div className="txc-speedbar">
              <div className="tele-track">
                <div
                  className={`tele-fill tele-${speedTier(h.wpm || 0, avgWpm)}`}
                  style={{ width: `${Math.min(100, ((h.wpm || 0) / wpmScale) * 100)}%` }}
                />
              </div>
            </div>
            <span className="txc-wpm">{h.wpm || 0} WPM</span>

            <div className="txc-accbar">
              <div className="tele-track">
                <div
                  className={`tele-fill tele-${accTier(h.accuracy)}`}
                  style={{ width: `${h.accuracy}%` }}
                />
              </div>
            </div>
            <span className={`txc-acc tx-val-${accTier(h.accuracy)}`}>
              {h.accuracy}%
            </span>

            <span className="txc-time">{h.seconds || 0}s</span>
          </div>
        ))}
      </div>

      {/* Analytical operator profile */}
      <div className="operator-profile">
        <div className="op-title">&gt; OPERATOR PROFILE</div>

        <div className="op-body">
          <div className="op-class">
            <span className={`op-grade op-grade-${accTier(avgAccuracy)}`}>
              {op.grade}
            </span>
            <span className="op-class-meta">
              <span className="op-class-label">OPERATOR CLASS</span>
              <span className="op-class-tier">{op.tier}</span>
            </span>
          </div>

          <div className="op-metrics">
            <div className="op-metric">
              <span className="op-metric-label">LONGEST CLEAN STREAK</span>
              <span className="op-metric-value">{bestStreak} chars</span>
              <span className="op-metric-sub">{txLabel(streakIdx)}</span>
            </div>

            <div className="op-metric op-spark-metric">
              <span className="op-metric-label">ACCURACY TREND</span>
              <div className="op-spark">
                {nodeHistory.map((h, i) => (
                  <div className="spark-col" key={h.nodeId + i}>
                    <div className="spark-track">
                      <div
                        className={`spark-bar tele-${accTier(h.accuracy)}`}
                        style={{ height: `${Math.max(6, h.accuracy)}%` }}
                      />
                    </div>
                    <span className="spark-label">{i + 1}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <button className="terminal-btn result-restart" onClick={onRestart}>
        <span className="btn-label">REINITIALIZE</span>
      </button>
    </div>
  )
}

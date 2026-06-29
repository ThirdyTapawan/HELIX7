// Live readout of typing speed, accuracy, and a dramatised reactor power
// figure. Power is purely cosmetic flavour — it falls as transmissions stack
// up and as accuracy drops.
export default function StatsBar({ wpm, accuracy, transmissionNumber }) {
  let power = 100 - transmissionNumber * 10 - Math.max(0, 100 - accuracy) / 5
  power = Math.round(Math.min(95, Math.max(5, power)))
  const powerLow = power < 50

  return (
    <div className="stats-bar">
      <div className="stat">
        <span className="stat-label">WPM</span>
        <span className="stat-value">{wpm}</span>
      </div>
      <div className="stat">
        <span className="stat-label">ACC</span>
        <span className="stat-value">{accuracy}%</span>
      </div>
      <div className="stat">
        <span className="stat-label">POWER</span>
        <span className={`stat-value${powerLow ? ' stat-warn' : ''}`}>
          {power}%
        </span>
      </div>
    </div>
  )
}

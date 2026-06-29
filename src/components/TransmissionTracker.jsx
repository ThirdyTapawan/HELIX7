// Six-slot progress strip. Completed slots are green, the active slot blinks
// amber, and not-yet-reached slots stay dark.
export default function TransmissionTracker({ nodeHistory }) {
  const slots = [0, 1, 2, 3, 4, 5]
  const completed = nodeHistory.length

  return (
    <div className="transmission-tracker">
      {slots.map((i) => {
        let status = 'locked'
        if (i < completed) status = 'done'
        else if (i === completed) status = 'active'

        const label = `TX0${i + 1}`
        return (
          <div key={i} className={`tx-slot tx-${status}`}>
            <span className={`tx-dot tx-dot-${status}`} />
            <span className="tx-label">{label}</span>
          </div>
        )
      })}
    </div>
  )
}

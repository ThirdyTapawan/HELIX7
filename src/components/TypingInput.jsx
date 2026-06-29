// The interactive transcription area. It is a focusable div that captures
// key events directly (no real <input>), rendering each target character as a
// span styled by its current state.
export default function TypingInput({ charStates, target, onKeyDown, inputRef }) {
  const chars = target.split('')
  const lastIsCursor = charStates[charStates.length - 1] === 'cursor'

  return (
    <div
      className="typing-area"
      tabIndex={0}
      onKeyDown={onKeyDown}
      ref={inputRef}
    >
      {chars.map((ch, i) => (
        <span key={i} className={`char ${charStates[i] || 'pending'}`}>
          {ch}
        </span>
      ))}
      {!lastIsCursor && <span className="char cursor-blink">_</span>}
    </div>
  )
}

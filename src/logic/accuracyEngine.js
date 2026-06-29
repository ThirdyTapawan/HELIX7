// accuracyEngine.js
// Pure functions for measuring transcription accuracy, typing speed,
// and per-character visual state.

// Some transmissions contain typographic punctuation the player can't reach on
// a normal keyboard (em dash "—", en dash "–", curly quotes). Normalise those
// to their plain-keyboard equivalents so e.g. typing "-" matches "—".
function normalizeChar(c) {
  switch (c) {
    case '—': // em dash
    case '–': // en dash
      return '-'
    case '‘': // left single quote
    case '’': // right single quote / apostrophe
      return "'"
    case '“': // left double quote
    case '”': // right double quote
      return '"'
    default:
      return c
  }
}

export function charsMatch(typedChar, targetChar) {
  return normalizeChar(typedChar) === normalizeChar(targetChar)
}

// Compare typed against target character by character and return the
// integer percentage (0-100) of correct characters out of typed.length.
// An empty typed string is treated as a perfect 100.
export function calcAccuracy(typed, target) {
  if (typed.length === 0) return 100
  let correct = 0
  for (let i = 0; i < typed.length; i++) {
    if (charsMatch(typed[i], target[i])) correct++
  }
  return Math.round((correct / typed.length) * 100)
}

// Longest run of consecutive correct characters in a single transcription.
// Grounded in the same character comparison as calcAccuracy.
export function calcLongestStreak(typed, target) {
  let best = 0
  let run = 0
  for (let i = 0; i < typed.length; i++) {
    if (charsMatch(typed[i], target[i])) {
      run++
      if (run > best) best = run
    } else {
      run = 0
    }
  }
  return best
}

// Words-per-minute: count words in typed (split on whitespace), divide by
// the elapsed time in minutes, and return a rounded integer.
export function calcWPM(typed, elapsedSeconds) {
  if (elapsedSeconds === 0) return 0
  const words = typed.trim().split(/\s+/).filter(Boolean).length
  const minutes = elapsedSeconds / 60
  return Math.round(words / minutes)
}

// Build an array the same length as target describing each character's state:
//   "correct" - typed matches target at this index
//   "wrong"   - typed has a character here but it does not match
//   "cursor"  - the current caret position (index === typed.length)
//   "pending" - not yet typed
export function getCharStates(typed, target) {
  const states = []
  for (let i = 0; i < target.length; i++) {
    if (i < typed.length) {
      states.push(charsMatch(typed[i], target[i]) ? 'correct' : 'wrong')
    } else if (i === typed.length) {
      states.push('cursor')
    } else {
      states.push('pending')
    }
  }
  return states
}

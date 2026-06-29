// Self-contained Web Audio engine — no asset files. Everything is synthesised
// at runtime so the build stays dependency-free.
//
//   SFX: short blip + filtered-noise click on every keypress (a "retro NASA
//        lab" console feel), confirm tones on Enter, an ending stinger.
//   Music: a slow generative drone pad plus sparse sonar-style pings. The pings
//          get faster and brighter as the mission progresses (setIntensity),
//          so the score tightens as the player nears the final transmission.
//
// The score is started as early as the intro loads (startOnLoad). Browser
// autoplay policies usually keep the AudioContext suspended until the first user
// interaction, so startOnLoad also resumes it on the first key/click/touch.

let ctx = null
let master = null
let sfxGain = null
let musicGain = null
let noiseBuffer = null

let padNodes = []
let pingTimer = null
let musicStarted = false
let muted = false
let intensity = 0

const MASTER_VOL = 0.85
const SCALE = [220, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25] // A minor-ish

function init() {
  if (ctx) return ctx
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  ctx = new AC()

  master = ctx.createGain()
  master.gain.value = muted ? 0 : MASTER_VOL
  master.connect(ctx.destination)

  sfxGain = ctx.createGain()
  sfxGain.gain.value = 0.6
  sfxGain.connect(master)

  musicGain = ctx.createGain()
  musicGain.gain.value = 0.0001
  musicGain.connect(master)

  // One reusable noise buffer for the mechanical key "click".
  const len = Math.floor(ctx.sampleRate * 0.2)
  noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate)
  const data = noiseBuffer.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1

  return ctx
}

// ---- SFX primitives ----

function noiseClick(t, gain, freq) {
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = freq
  bp.Q.value = 0.8
  const g = ctx.createGain()
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03)
  src.connect(bp)
  bp.connect(g)
  g.connect(sfxGain)
  src.start(t)
  src.stop(t + 0.04)
}

function blip(t, freq, dur, type, gain) {
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  osc.frequency.exponentialRampToValueAtTime(freq * 0.7, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + 0.004)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g)
  g.connect(sfxGain)
  osc.start(t)
  osc.stop(t + dur + 0.02)
}

export function playKey(correct = true) {
  if (!ctx) return
  const t = ctx.currentTime
  noiseClick(t, correct ? 0.08 : 0.1, correct ? 1800 : 700)
  blip(
    t,
    correct ? 680 + Math.random() * 60 : 150,
    0.05,
    correct ? 'square' : 'sawtooth',
    correct ? 0.05 : 0.09
  )
}

export function playEnter() {
  if (!ctx) return
  const t = ctx.currentTime
  blip(t, 880, 0.08, 'square', 0.07)
  blip(t + 0.06, 1174.7, 0.1, 'square', 0.06)
}

export function playResult(kind) {
  if (!ctx) return
  const t = ctx.currentTime
  const seq =
    kind === 'good'
      ? [523.25, 659.25, 783.99, 1046.5]
      : kind === 'bad'
        ? [392.0, 329.63, 261.63, 196.0]
        : [523.25, 587.33, 523.25, 440.0]
  seq.forEach((f, i) => blip(t + i * 0.13, f, 0.2, 'triangle', 0.09))
}

// ---- Generative music ----

function schedulePing() {
  // Higher intensity -> shorter gaps between pings.
  const base = 5200 - intensity * 3400
  const delay = base + Math.random() * 2400
  pingTimer = setTimeout(() => {
    if (!ctx || !musicStarted) return
    const t = ctx.currentTime
    let f = SCALE[Math.floor(Math.random() * SCALE.length)]
    if (intensity > 0.6 && Math.random() < 0.35) f *= 1.5 // tense upper octave
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = f
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.1 + intensity * 0.08, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6)
    osc.connect(g)
    if (ctx.createStereoPanner) {
      const pan = ctx.createStereoPanner()
      pan.pan.value = Math.random() * 2 - 1
      g.connect(pan)
      pan.connect(musicGain)
    } else {
      g.connect(musicGain)
    }
    osc.start(t)
    osc.stop(t + 1.7)
    schedulePing()
  }, delay)
}

export function startMusic() {
  if (!init() || musicStarted) return
  musicStarted = true

  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 520
  filter.Q.value = 5
  filter.connect(musicGain)

  // Slow filter sweep gives the drone its breathing movement.
  const lfo = ctx.createOscillator()
  const lfoGain = ctx.createGain()
  lfo.frequency.value = 0.05
  lfoGain.gain.value = 240
  lfo.connect(lfoGain)
  lfoGain.connect(filter.frequency)
  lfo.start()
  padNodes.push(lfo)

  // Low drone: root + octave + fifth.
  const chord = [55.0, 110.0, 164.81, 220.0]
  chord.forEach((freq, i) => {
    const osc = ctx.createOscillator()
    osc.type = i === 0 ? 'sine' : 'sawtooth'
    osc.frequency.value = freq
    osc.detune.value = (i - 1.5) * 4
    const g = ctx.createGain()
    g.gain.value = i === 0 ? 0.5 : 0.16
    osc.connect(g)
    g.connect(filter)
    osc.start()
    padNodes.push(osc)
  })

  musicGain.gain.cancelScheduledValues(ctx.currentTime)
  musicGain.gain.setValueAtTime(0.0001, ctx.currentTime)
  musicGain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 5)

  schedulePing()
}

export function stopMusic() {
  if (!ctx || !musicStarted) return
  musicStarted = false
  clearTimeout(pingTimer)
  pingTimer = null
  const t = ctx.currentTime
  musicGain.gain.cancelScheduledValues(t)
  musicGain.gain.setValueAtTime(musicGain.gain.value, t)
  musicGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.5)
  padNodes.forEach((n) => {
    try {
      n.stop(t + 1.6)
    } catch (e) {
      /* already stopped */
    }
  })
  padNodes = []
}

// ---- Control ----

// Called on the INITIALIZE gesture: builds the context (allowed here) and music.
export function start() {
  if (!init()) return
  if (ctx.state === 'suspended') ctx.resume()
  startMusic()
}

let autostartArmed = false

// Kick the score off as early as possible — ideally the moment the intro loads.
// Browser autoplay policies usually leave a freshly created AudioContext
// "suspended" until a user gesture, so we also arm a one-shot listener that
// resumes it on the very first interaction anywhere on the page (key, click, or
// touch) rather than waiting specifically for the INITIALIZE button.
export function startOnLoad() {
  start()
  if (!ctx || ctx.state === 'running' || autostartArmed) return
  autostartArmed = true

  const unlock = () => {
    if (ctx && ctx.state === 'suspended') ctx.resume()
    startMusic() // idempotent — ensures the drone is running once unlocked
    remove()
  }
  const remove = () => {
    autostartArmed = false
    ;['pointerdown', 'mousedown', 'keydown', 'touchstart'].forEach((ev) =>
      window.removeEventListener(ev, unlock)
    )
  }
  ;['pointerdown', 'mousedown', 'keydown', 'touchstart'].forEach((ev) =>
    window.addEventListener(ev, unlock)
  )
}

// level: 0..1 mission progress. Tightens the score as it rises.
export function setIntensity(level) {
  intensity = Math.max(0, Math.min(1, level))
}

export function setMuted(value) {
  muted = value
  if (master && ctx) {
    master.gain.setTargetAtTime(muted ? 0 : MASTER_VOL, ctx.currentTime, 0.02)
  }
}

export function isMuted() {
  return muted
}

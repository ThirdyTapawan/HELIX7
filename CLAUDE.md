# CLAUDE.md

Guidance for working in this repository. Read this before making changes.

## What this is

**HELIX-7 // COMM TERMINAL** (package name `the-last-transmission`) is a browser-based
narrative **typing game** set in deep space. The player is a comm operator who transcribes
6 fragmented distress transmissions. Typing **accuracy** on each transmission branches the
story and ultimately decides one of three endings (good / neutral / bad).

It is a React + Vite single-page app with **zero runtime dependencies beyond React** — audio
is fully synthesised at runtime (Web Audio API, no asset files) and backgrounds are raw WebGL
shaders (no Three.js). Aesthetic: retro phosphor-green CRT terminal.

The README.md is the authoritative design/spec document. This file is the fast-path summary
for making code changes.

## Commands

```bash
npm install        # Node 18+ required
npm run dev        # Vite dev server at http://localhost:5173
npm run build      # production build → /dist (static, host anywhere)
npm run preview    # serve the production build locally
```

There is **no test runner script** in package.json. Playwright is a devDependency and is used
ad-hoc via the standalone scripts `shots.mjs` and `_result_shot.mjs` (screenshot/smoke helpers).
The "test-first" functions mentioned in the README refer to the pure logic in `src/logic/` —
those are the safest things to change and the natural place to add real tests if asked.

## Architecture (where things live)

```
src/
├── main.jsx                  # ReactDOM root, mounts <App/>
├── App.jsx                   # Render layer + wiring ONLY: phase routing, intro animation,
│                             #   shader selection, audio triggers, 4 useEffects
├── App.css                   # ALL styles — CSS custom properties, layout, keyframes,
│                             #   prefers-reduced-motion block at the very end
├── audio.js                  # Web Audio engine: SFX + generative score (no assets)
├── shaders.js                # GLSL ES 1.00 fragment shaders: NEBULA + METEOR
├── data/story.json           # Branching story graph (the game's content)
├── hooks/useGameState.js     # ★ Single source of truth for all game logic/state
├── logic/
│   ├── accuracyEngine.js     # Pure functions: WPM, accuracy, char states, streak, normalize
│   └── branchResolver.js     # resolveNext(node, accuracy) → next node id | null
└── components/
    ├── StoryDisplay.jsx        # Renders incoming transmission text (key={text} remounts it)
    ├── TypingInput.jsx         # Char-by-char typing area — a <div> + onKeyDown, NOT an <input>
    ├── StatsBar.jsx            # Live WPM / Accuracy / cosmetic Power HUD
    ├── TransmissionTracker.jsx # 6-slot TX01–TX06 progress strip
    ├── ResultScreen.jsx        # End-of-run debrief + analytics + operator grade
    └── ShaderField.jsx         # Generic full-viewport WebGL canvas renderer
```

### Layering rule (keep this intact)
- **`src/logic/`** = pure, dependency-free, easily testable. Put computation here.
- **`src/hooks/useGameState.js`** = owns all mutable game state; orchestrates logic.
- **`App.jsx`** = render + side-effect wiring only. Don't put game rules here.
- **Components** = presentational; receive props, render, capture input.

## How the game loop works

Three phases (`phase` in `useGameState`): `intro` → `playing` → `result`.

1. **intro** — animated boot sequence; player presses INITIALIZE TERMINAL → `playing`.
2. **playing** — player transcribes the current node's `text`. Per-keystroke, `useGameState`
   recomputes `charStates`, `wpm`, `accuracy`.
3. On **Enter** when `typed.length >= target.length`, `handleComplete()`:
   - finalizes accuracy / WPM / elapsed seconds / longest streak,
   - pushes a record to `nodeHistory`,
   - calls `resolveNext(node, accuracy)` for the next node id,
   - if terminal (node has `ending`), go to `result`; else advance `nodeId`, reset `typed` & `startTime`.

### Branching rule (the one knob)
In `branchResolver.js`: **accuracy ≥ 80 → `node.good`, else `node.bad`.** The 80 threshold is
deliberately isolated there so it's easy to change. Up to 6 transmissions, then a terminal node.

### Story content (`data/story.json`)
Flat `key → node` map. Non-terminal node: `{ "text", "good": "<id>", "bad": "<id>" }`.
Terminal node: `{ "text", "ending": "good" | "neutral" | "bad" }`. The starting node is `tx01`.
**To edit the narrative or branching, this JSON file is the only thing you touch.**

## Key invariants & gotchas (don't break these)

- **No `<input>` element.** All typing is raw `keydown` on a focusable `<div>` in `TypingInput`.
  Backspace deletes the last char; overtyping past target length is blocked.
- **Overtyping guard lives inside the `setTyped` updater** (uses the updater's previous value,
  not the closure's `typed.length`) — this prevents stale-closure bugs under fast input. Keep it there.
- **The WPM clock starts on the FIRST keystroke of each transmission** (`startTime` ref, `null`
  between transmissions), so reading time isn't counted. Don't start it on node load.
- **Character normalization**: em dash `—`, en dash `–` all match `-`; curly quotes match
  straight quotes (`normalizeChar` / `charsMatch` in `accuracyEngine.js`). The player never needs
  to type special characters — preserve this when adding story text.
- **`charStates`** values are exactly `'correct' | 'wrong' | 'cursor' | 'pending'`; CSS in App.css
  styles each. Adding a new state means updating both `getCharStates` and App.css.
- **`calcAccuracy('', target)` returns 100** (empty string edge case) — relied on by live HUD.

## Audio (`audio.js`)

- Single `AudioContext`, created lazily in `init()`. `startOnLoad()` arms one-shot listeners on
  `pointerdown/mousedown/keydown/touchstart` to resume past autoplay restrictions ASAP.
- SFX: `playKey(correct)` (per keypress, branchy timbre), `playEnter()`, `playResult(kind)`
  (4-note stinger; kind = good/neutral/bad).
- Generative score: drone pad (4 oscillators + shared low-pass + slow LFO) and randomized sonar
  pings. `setIntensity(0..1)` is driven by `transmissionNumber` — more/louder pings as you progress.
- Mute = fast gain ramp on master gain (not context suspend), so unmute is instant.

## WebGL backgrounds (`ShaderField.jsx` + `shaders.js`)

- `ShaderField` is generic: one full-screen triangle per frame, uniforms `u_resolution` and
  `u_time`. Pass it a shader string. App.jsx picks NEBULA (intro) vs METEOR (playing/result).
- **NEBULA**: domain-warped fBm, phosphor-green color ramp. Renders up to 2× DPR.
- **METEOR**: accumulated phosphor streaks; includes a `tanh4()` polyfill because GLSL ES 1.00
  (WebGL 1) has no `tanh`. Capped at 1× DPR (it's behind opaque panels).
- **Accessibility-critical**: if `prefers-reduced-motion: reduce` matches, `ShaderField` is not
  rendered at all (plain CSS background). Preserve this when touching backgrounds.

## Result screen analytics (`ResultScreen.jsx`)

All derived purely from `nodeHistory` (no server, no storage). Records are
`{ nodeId, accuracy, wpm, seconds, streak, chars }`. Computes Avg Accuracy, Avg WPM,
Consistency (CV of WPM → STEADY/VARIABLE/ERRATIC), Trend (2nd-half minus 1st-half accuracy),
Best Transmission, Longest Clean Streak, and a composite **Operator Grade** (S→E, accuracy 90%
weight + capped speed bonus). Headline numbers animate via a `useCountUp` rAF hook (snaps to
final value under reduced motion).

## Visual system (`App.css`)

Built on a small set of CSS custom properties (the phosphor palette: `--phosphor`,
`--phosphor-dim`, `--phosphor-muted`, `--phosphor-pending`, plus `--amber-warn`,
`--red-critical`, and the three `--bg-*` tones). Color tiers carry meaning: green = correct/good,
amber = neutral/warning, red = wrong/bad. Notable animations: `flicker`, `scanPulse`,
`glitchFlicker`, `badgeReveal`/`badgeGlow`, `introVeil`. **The `prefers-reduced-motion` override
block at the end of App.css disables animations — keep new animations covered there.**

## When asked to change something, start here

| Task | Touch |
|---|---|
| Edit story text / branching paths / endings | `src/data/story.json` |
| Change the 80% pass threshold | `src/logic/branchResolver.js` |
| Typing/accuracy/WPM behavior | `src/logic/accuracyEngine.js` (+ maybe `useGameState.js`) |
| Game flow / phases / state | `src/hooks/useGameState.js` |
| Sounds / music | `src/audio.js` |
| Backgrounds / shaders | `src/shaders.js`, `src/components/ShaderField.jsx` |
| End-screen stats | `src/components/ResultScreen.jsx` |
| Any styling / colors / animation | `src/App.css` |

After changes, run `npm run dev` and verify in-browser; always re-check the
`prefers-reduced-motion` path and that no `<input>` was introduced into the typing flow.

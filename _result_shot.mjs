import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1440, height: 1180 }, reducedMotion: 'reduce' })
await p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' })
await p.click('button.terminal-btn')
await p.waitForSelector('.typing-area')
await p.waitForTimeout(400) // let the typing area settle before the first line

const target = () =>
  p.$eval('.typing-area', (el) =>
    Array.from(el.querySelectorAll('.char'))
      .filter((s) => !s.classList.contains('cursor-blink'))
      .map((s) => s.textContent)
      .join('')
  )
const isResult = () => p.$('.result-screen').then(Boolean)

// A real keyboard can't emit em dashes / curly quotes; a human types the plain
// equivalents, which the game normalises back to a match. Playwright otherwise
// drops these glyphs, so mirror what a person would actually press.
const human = (s) =>
  s.replace(/[—–]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"')

for (let i = 0; i < 8; i++) {
  if (await isResult()) break
  const t = await target()
  await p.focus('.typing-area')
  // Vary speed per transmission; inject a few wrong chars on tx2/tx5 so the
  // accuracy tiers (amber/red) are visible in the telemetry.
  const ht = human(t)
  if (i === 1) {
    await p.keyboard.type(ht.slice(0, -8), { delay: 2 })
    await p.keyboard.type('xxqzwkvm', { delay: 2 }) // ~8 wrong -> high-90s
  } else if (i === 4) {
    await p.keyboard.type(ht.slice(0, -40), { delay: 4 })
    await p.keyboard.type('q'.repeat(40), { delay: 4 }) // many wrong -> low tier
  } else {
    await p.keyboard.type(ht, { delay: 5 })
  }
  // Wait for React to commit the full line, then Enter; retry if it didn't
  // advance (machine-speed race where Enter outruns the last keystroke).
  for (let r = 0; r < 6; r++) {
    await p.waitForTimeout(250)
    await p.keyboard.press('Enter')
    await p.waitForTimeout(200)
    if ((await isResult()) || (await target()) !== t) break
  }
}

await p.waitForSelector('.result-screen', { timeout: 10000 })
await p.waitForTimeout(1300)
await p.screenshot({ path: 'C:/Users/tapaw/Desktop/Helix7/screenshots/4-result-good.png' })
console.log('saved')
await b.close()

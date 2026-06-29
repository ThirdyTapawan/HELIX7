import { chromium } from 'playwright'

const OUT = 'C:/Users/tapaw/Desktop/Helix7/screenshots'
const URL = 'http://localhost:5173/'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(URL, { waitUntil: 'networkidle' })

function keyFor(ch) {
  if (ch === ' ') return 'Space'
  return ch
}

async function currentTarget() {
  return page.$eval('.typing-area', (el) =>
    Array.from(el.querySelectorAll('.char'))
      .filter((s) => !s.classList.contains('cursor-blink'))
      .map((s) => s.textContent)
      .join('')
  )
}

async function transcribeCurrent() {
  const target = await currentTarget()
  await page.focus('.typing-area')
  await page.keyboard.type(target, { delay: 0 })
  return target
}

// 1. Intro / boot screen
await page.waitForSelector('.intro-screen')
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}/1-intro.png` })

// Enter the game
await page.click('button.terminal-btn')
await page.waitForSelector('.typing-area')
await page.waitForTimeout(400)

// 2. Playing screen, fresh transmission
await page.screenshot({ path: `${OUT}/2-playing-fresh.png` })

// 3. Playing screen mid-type with a wrong char to show states
const target0 = await currentTarget()
await page.focus('.typing-area')
await page.keyboard.type(target0.slice(0, 70), { delay: 0 })
await page.keyboard.press('z') // deliberate wrong char -> red styling
await page.waitForTimeout(300)
await page.screenshot({ path: `${OUT}/3-playing-typing.png` })

// Restart clean and play through perfectly for the good ending
await page.goto(URL, { waitUntil: 'networkidle' })
await page.click('button.terminal-btn')
await page.waitForSelector('.typing-area')

for (let i = 0; i < 6; i++) {
  await transcribeCurrent()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(250)
  if (await page.$('.result-screen')) break
}

await page.waitForSelector('.result-screen')
await page.waitForTimeout(400)
// 4. Result screen (good ending)
await page.screenshot({ path: `${OUT}/4-result-good.png` })

await browser.close()
console.log('done')

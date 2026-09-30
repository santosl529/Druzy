'use client'

import { useEffect, useRef, useState } from 'react'
import { GeodeIcon } from '@/components/geode-icon'

/** Loading skeletons carry this attribute; the splash finishes once none remain. */
const LOADING_SELECTOR = '[data-app-loading]'

/** Openness at which GeodeIcon's stone splits (see its chunk transforms). */
const SPLIT = 0.55
/** Finish timing (ms): race to the split, burst + bloom, then fade to the page. */
const TO_SPLIT = 320
const BLOOM = 520
const FADE = 320

/**
 * GeodeIcon's four stone chunks (outer shape + inner shading), redrawn so they
 * can fly far past the icon's own subtle split. Each flies off along its
 * diagonal with a spin: [dx, dy, rotate].
 */
const SHARDS: { outer: string; inner: string; innerFill: string; fly: [number, number, number] }[] = [
  { outer: 'M10 14 L18 8 L32 8 L33 30 L32 32 L8 32 L8 20 Z', inner: 'M12 16 L20 11 L32 11 L32 29 L10 29 L10 21 Z', innerFill: '#7a7880', fly: [-70, -90, -40] },
  { outer: 'M32 8 L46 8 L54 14 L56 20 L56 32 L32 32 L31 30 Z', inner: 'M32 11 L44 11 L52 17 L54 21 L54 29 L32 29 Z', innerFill: '#7a7880', fly: [80, -80, 35] },
  { outer: 'M8 32 L32 32 L33 34 L32 56 L18 56 L10 50 L8 44 Z', inner: 'M10 35 L32 35 L32 53 L20 53 L12 48 L10 43 Z', innerFill: '#6a6870', fly: [-85, 75, 30] },
  { outer: 'M32 32 L56 32 L56 44 L54 50 L46 56 L32 56 L31 34 Z', inner: 'M32 35 L54 35 L54 43 L52 47 L44 53 L32 53 Z', innerFill: '#6a6870', fly: [75, 90, -45] },
]

/**
 * Full-screen geode shown while the app opens. The waiting phase is pure CSS
 * (globals.css), so it plays before hydration. Once hydrated and the page's
 * data has streamed in (no loading skeleton left in the DOM), the geode races
 * through the remaining stages, its stone shards burst out, and the overlay
 * fades to the page. The backdrop covers the page from the first paint; the
 * geode waits 200ms before appearing, and if the load finishes first the
 * backdrop just fades out without playing.
 *
 * Lives in the app layout, so it only appears on a full load (or on entering
 * the app from /login) — client navigations keep the mounted layout.
 */
export function BootSplash() {
  const [done, setDone] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    let cancelled = false
    const animations: Animation[] = []

    function finish() {
      observer.disconnect()
      if (cancelled || !root) return
      const svg = root.querySelector<SVGSVGElement>('.boot-splash-geode')
      const mark = root.querySelector<HTMLElement>('.boot-splash-mark')
      if (!svg || !mark || typeof root.animate !== 'function') {
        setDone(true)
        return
      }
      // Loaded before the geode appeared: just fade the backdrop to the page.
      if (parseFloat(getComputedStyle(mark).opacity) < 0.05) {
        root.dataset.phase = 'finishing'
        const quick = root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, fill: 'forwards' })
        animations.push(quick)
        quick.finished.then(() => !cancelled && setDone(true)).catch(() => {})
        return
      }

      // Continue from wherever the loading loop is, rather than restarting.
      const current = parseFloat(getComputedStyle(svg).getPropertyValue('--openness')) || 0
      root.dataset.phase = 'finishing'
      const splitAt = TO_SPLIT / (TO_SPLIT + BLOOM)
      // Remaining stages up to the split, then bloom; the geode swells as it opens.
      const bloom = svg.animate(
        [
          { '--openness': Math.min(current, SPLIT), transform: 'scale(1)', easing: 'ease-in' },
          { '--openness': SPLIT, transform: 'scale(1.04)', offset: splitAt, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' },
          { '--openness': 1, transform: 'scale(1.15)' },
        ],
        { duration: TO_SPLIT + BLOOM, fill: 'forwards' },
      )
      animations.push(bloom)
      // At the split, the full-size shards take over from the icon's stone and
      // fly outward (hidden until then — fill 'forwards' only).
      root.querySelectorAll<SVGGElement>('[data-shard]').forEach((shard, i) => {
        const [dx, dy, rot] = SHARDS[i].fly
        animations.push(
          shard.animate(
            [
              { opacity: 1, transform: 'translate(0, 0) rotate(0deg) scale(1)' },
              { opacity: 1, offset: 0.55 },
              { opacity: 0, transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(0.7)` },
            ],
            { duration: BLOOM + 80, delay: TO_SPLIT, easing: 'cubic-bezier(0.15, 0.8, 0.3, 1)', fill: 'forwards' },
          ),
        )
      })
      const fade = root.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: FADE,
        delay: TO_SPLIT + BLOOM - 120,
        easing: 'ease-out',
        fill: 'forwards',
      })
      animations.push(fade)
      fade.finished.then(() => !cancelled && setDone(true)).catch(() => {})
    }

    const observer = new MutationObserver(() => {
      if (!document.querySelector(LOADING_SELECTOR)) finish()
    })
    if (document.querySelector(LOADING_SELECTOR)) {
      observer.observe(document.body, { childList: true, subtree: true })
    } else {
      finish()
    }

    return () => {
      cancelled = true
      observer.disconnect()
      for (const a of animations) a.cancel()
    }
  }, [])

  if (done) return null

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className="boot-splash fixed inset-0 z-[100] flex items-center justify-center bg-background"
    >
      <div className="boot-splash-mark flex flex-col items-center gap-6">
        <div className="relative size-28 sm:size-36">
          <GeodeIcon crystalType="amethyst" openness={0} className="boot-splash-geode size-full" />
          {/* Burst shards: invisible until the finish animation takes over. */}
          <svg viewBox="0 0 64 64" className="absolute inset-0 size-full overflow-visible pointer-events-none">
            {SHARDS.map((s, i) => (
              <g
                key={i}
                data-shard=""
                opacity="0"
                style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                fill="#9a98a0"
                stroke="rgba(0,0,0,0.85)"
                strokeWidth="1.3"
                strokeLinejoin="round"
              >
                <path d={s.outer} />
                <path d={s.inner} fill={s.innerFill} stroke="none" />
              </g>
            ))}
          </svg>
        </div>
        <span className="font-heading text-2xl font-bold tracking-tight text-foreground/80">Druzy</span>
      </div>
    </div>
  )
}

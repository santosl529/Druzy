import { useId } from 'react'
import { geodeVars } from '@/lib/geode-style'

interface Props {
  crystalType: string
  openness: number
  className?: string
}

export function GeodeIcon({ crystalType, openness, className }: Props) {
  // useId produces a stable, unique-per-instance id — safe for SVG defs.
  const uid = useId().replace(/:/g, '-')
  const crystalGrad = `${uid}-crystal`
  const roughen = `${uid}-roughen`
  const halo = `${uid}-halo`
  const innerGlow = `${uid}-inner-glow`

  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      style={geodeVars(crystalType, openness)}
      role="img"
      aria-label="Geode tracker"
    >
      <defs>
        {/* Crystal fill: glow -> primary (top-left highlight -> deeper hue) */}
        <linearGradient id={crystalGrad} x1="0" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="var(--crystal-glow)" />
          <stop offset="40%" stopColor="var(--crystal-primary)" />
          <stop offset="100%" stopColor="var(--crystal-primary)" stopOpacity="0.8" />
        </linearGradient>
        {/* Roughen edges into gentle hand-drawn waviness (low frequency =
            wobble, not speckle) for a non-vector, inked feel */}
        <filter id={roughen} x="-8%" y="-8%" width="116%" height="116%">
          <feTurbulence type="fractalNoise" baseFrequency="0.14" numOctaves="2" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="1.8" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        {/* Soft colored halo behind the stone */}
        <radialGradient id={halo} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--crystal-glow)" stopOpacity="0.5" />
          <stop offset="65%" stopColor="var(--crystal-glow)" stopOpacity="0.2" />
          <stop offset="100%" stopColor="var(--crystal-glow)" stopOpacity="0" />
        </radialGradient>
        {/* Inner glow for the crack seam */}
        <radialGradient id={innerGlow} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--crystal-glow)" stopOpacity="1" />
          <stop offset="60%" stopColor="var(--crystal-primary)" stopOpacity="0.7" />
          <stop offset="100%" stopColor="var(--crystal-primary)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* === LAYER 0: Halo — always present, intensifies with openness === */}
      <ellipse cx="32" cy="33" rx="30" ry="28" fill={`url(#${halo})`}
        style={{ opacity: 'calc(0.4 + var(--openness) * 0.6)' }} />

      {/* === LAYER 1: Crystal cluster — grows from center gap, sits BELOW the
              stone so the parting chunks reveal it === */}
      {/* Glowing core behind crystals (visible from splitting onward) */}
      <ellipse cx="32" cy="32" rx="10" ry="9"
        fill={`url(#${innerGlow})`}
        style={{ opacity: 'calc(max(var(--openness) - 0.5, 0) * 3)' }} />
      {/* Main crystal cluster — a central faceted gem with pointed crystals
          fanning out radially in 8 directions (frame 8/10). */}
      <g
        fill={`url(#${crystalGrad})`}
        stroke="rgba(0,0,0,0.62)"
        strokeWidth="0.7"
        strokeLinejoin="round"
        style={{
          opacity: 'calc(max(var(--openness) - 0.5, 0) * 2.5)',
          transform: 'scale(calc(0.55 + var(--openness) * 0.45))',
          transformOrigin: '32px 32px',
        }}
      >
        {/* Radial crystal points (drawn behind the central gem) */}
        <polygon points="32,6 37,18 32,25 27,18" />
        <polygon points="50,14 45,26 37,27 38,19" opacity="0.95" />
        <polygon points="58,32 46,27 39,32 46,37" opacity="0.92" />
        <polygon points="50,50 38,45 37,37 45,38" opacity="0.9" />
        <polygon points="32,58 27,46 32,39 37,46" opacity="0.92" />
        <polygon points="14,50 19,38 27,37 26,45" opacity="0.9" />
        <polygon points="6,32 18,27 25,32 18,37" opacity="0.92" />
        <polygon points="14,14 26,19 27,27 19,26" opacity="0.95" />

        {/* Central faceted gem (on top of the radial points) */}
        <polygon points="32,21 41,26 41,37 32,43 23,37 23,26" />
        {/* Gem facet lines */}
        <path d="M32,21 L28,28 L36,28 Z M28,28 L23,37 M36,28 L41,37 M28,28 L32,43 M36,28 L32,43"
          fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth="0.5" />
        {/* Gem table highlight */}
        <polygon points="32,21 36,28 32,30 28,28" fill="var(--crystal-glow)" opacity="0.7" stroke="none" />

        {/* White sparkle tips on the prominent crystals */}
        <polygon points="32,6 33,11 32,14 31,11" fill="white" opacity="0.85" stroke="none" />
        <polygon points="14,14 18,17 19,19 16,18" fill="white" opacity="0.7" stroke="none" />
        <polygon points="50,14 47,18 45,19 48,16" fill="white" opacity="0.7" stroke="none" />
      </g>

      {/* === LAYER 2: Stone shell — 4 chunks, flush when sealed, fly to corners when split === */}
      {/*
        The stone is a horizontal oval/rectangular shape with chamfered corners,
        split into top-left, top-right, bottom-left, bottom-right quadrants.
        Each chunk translates outward past the 0.55 threshold.
        Reference (frame 2): faceted grey stone with wavy/chunky silhouette.
      */}
      <g fill="#9a98a0" stroke="rgba(0,0,0,0.85)" strokeWidth="1.3" strokeLinejoin="round"
        style={{ opacity: 'calc(max(1 - max(var(--openness) - 0.65, 0) * 5, 0))' }}>
        {/* Each chunk flies outward AND shrinks past the 0.55 split threshold,
            so by full bloom they read as small rock fragments in the corners
            (frame 10) instead of large slabs that cover the crystal. The scale
            origin is each chunk's own centroid. */}
        {/* Top-left chunk */}
        <path
          style={{ transform: 'translate(calc(max(var(--openness) - 0.55, 0) * -50px), calc(max(var(--openness) - 0.55, 0) * -46px)) scale(calc(1 - max(var(--openness) - 0.55, 0) * 1.1))', transformOrigin: '20px 20px' }}
          d="M10 14 L18 8 L32 8 L33 30 L32 32 L8 32 L8 20 Z"
          filter={`url(#${roughen})`}
        />
        {/* Top-right chunk */}
        <path
          style={{ transform: 'translate(calc(max(var(--openness) - 0.55, 0) * 50px), calc(max(var(--openness) - 0.55, 0) * -46px)) scale(calc(1 - max(var(--openness) - 0.55, 0) * 1.1))', transformOrigin: '44px 20px' }}
          d="M32 8 L46 8 L54 14 L56 20 L56 32 L32 32 L31 30 Z"
          filter={`url(#${roughen})`}
        />
        {/* Bottom-left chunk */}
        <path
          style={{ transform: 'translate(calc(max(var(--openness) - 0.55, 0) * -50px), calc(max(var(--openness) - 0.55, 0) * 46px)) scale(calc(1 - max(var(--openness) - 0.55, 0) * 1.1))', transformOrigin: '20px 44px' }}
          d="M8 32 L32 32 L33 34 L32 56 L18 56 L10 50 L8 44 Z"
          filter={`url(#${roughen})`}
        />
        {/* Bottom-right chunk */}
        <path
          style={{ transform: 'translate(calc(max(var(--openness) - 0.55, 0) * 50px), calc(max(var(--openness) - 0.55, 0) * 46px)) scale(calc(1 - max(var(--openness) - 0.55, 0) * 1.1))', transformOrigin: '44px 44px' }}
          d="M32 32 L56 32 L56 44 L54 50 L46 56 L32 56 L31 34 Z"
          filter={`url(#${roughen})`}
        />
        {/* Stone facet shading — dark inner edges (share each chunk's transform) */}
        {/* Top-left inner shading */}
        <path
          style={{ transform: 'translate(calc(max(var(--openness) - 0.55, 0) * -50px), calc(max(var(--openness) - 0.55, 0) * -46px)) scale(calc(1 - max(var(--openness) - 0.55, 0) * 1.1))', transformOrigin: '20px 20px' }}
          d="M12 16 L20 11 L32 11 L32 29 L10 29 L10 21 Z"
          fill="#7a7880" stroke="none"
        />
        {/* Top-right inner shading */}
        <path
          style={{ transform: 'translate(calc(max(var(--openness) - 0.55, 0) * 50px), calc(max(var(--openness) - 0.55, 0) * -46px)) scale(calc(1 - max(var(--openness) - 0.55, 0) * 1.1))', transformOrigin: '44px 20px' }}
          d="M32 11 L44 11 L52 17 L54 21 L54 29 L32 29 Z"
          fill="#7a7880" stroke="none"
        />
        {/* Bottom-left inner shading */}
        <path
          style={{ transform: 'translate(calc(max(var(--openness) - 0.55, 0) * -50px), calc(max(var(--openness) - 0.55, 0) * 46px)) scale(calc(1 - max(var(--openness) - 0.55, 0) * 1.1))', transformOrigin: '20px 44px' }}
          d="M10 35 L32 35 L32 53 L20 53 L12 48 L10 43 Z"
          fill="#6a6870" stroke="none"
        />
        {/* Bottom-right inner shading */}
        <path
          style={{ transform: 'translate(calc(max(var(--openness) - 0.55, 0) * 50px), calc(max(var(--openness) - 0.55, 0) * 46px)) scale(calc(1 - max(var(--openness) - 0.55, 0) * 1.1))', transformOrigin: '44px 44px' }}
          d="M32 35 L54 35 L54 43 L52 47 L44 53 L32 53 Z"
          fill="#6a6870" stroke="none"
        />
      </g>

      {/* === LAYER 3: Seam inner-glow — glows on the stone surface before split === */}
      <rect x="8" y="29.5" width="48" height="5" rx="1"
        fill={`url(#${innerGlow})`}
        style={{ opacity: 'calc(min(max(var(--openness) - 0.2, 0) * 5, 1) * max(1 - max(var(--openness) - 0.6, 0) * 5, 0))' }} />

      {/* === LAYER 4: Crack network — lights up during cracking/charging, on top of the stone, fades at split === */}
      <g stroke="var(--crystal-glow)" strokeLinecap="round" fill="none"
         filter={`url(#${roughen})`}
         style={{ opacity: 'calc(min(max(var(--openness) - 0.2, 0) * 5, 1) * max(1 - max(var(--openness) - 0.6, 0) * 4, 0))' }}>
        {/* Main vertical crack */}
        <path d="M32 14 L31 24 L33 28 L32 32" strokeWidth="2.5" />
        {/* Main seam (horizontal) */}
        <path d="M10 32 L20 31 L32 32 L44 31 L54 32" strokeWidth="2" />
        {/* Lower vertical */}
        <path d="M32 32 L31 38 L33 44 L32 50" strokeWidth="2.5" />
        {/* Branch cracks upper */}
        <path d="M31 22 L22 25" strokeWidth="1.2" />
        <path d="M33 26 L42 23" strokeWidth="1.2" />
        {/* Branch cracks lower */}
        <path d="M31 37 L22 40" strokeWidth="1.2" />
        <path d="M33 41 L42 38" strokeWidth="1.2" />
      </g>
      {/* Bright crack core (thinner, brighter line on top) */}
      <g stroke="white" strokeLinecap="round" fill="none"
         style={{ opacity: 'calc(min(max(var(--openness) - 0.35, 0) * 6, 0.8) * max(1 - max(var(--openness) - 0.6, 0) * 4, 0))' }}>
        <path d="M32 18 L31 26 L33 29 L32 32" strokeWidth="1" />
        <path d="M32 32 L31 37 L33 42 L32 46" strokeWidth="1" />
        <path d="M14 32 L32 32 L50 32" strokeWidth="0.8" />
      </g>

      {/* === LAYER 5: Burst rays + sparkles — bloom only (gated past ~0.8), on top === */}
      <g stroke="var(--crystal-primary)" strokeWidth="1.7" strokeLinecap="round"
         style={{ opacity: 'calc(max(var(--openness) - 0.8, 0) * 5)' }}>
        {/* Cardinal rays */}
        <line x1="32" y1="1" x2="32" y2="9" />
        <line x1="63" y1="32" x2="55" y2="32" />
        <line x1="32" y1="63" x2="32" y2="55" />
        <line x1="1" y1="32" x2="9" y2="32" />
        {/* Diagonal rays */}
        <line x1="9" y1="9" x2="15" y2="15" />
        <line x1="55" y1="9" x2="49" y2="15" />
        <line x1="9" y1="55" x2="15" y2="49" />
        <line x1="55" y1="55" x2="49" y2="49" />
        {/* Secondary rays for fuller bloom */}
        <line x1="20" y1="2" x2="22" y2="9" />
        <line x1="44" y1="2" x2="42" y2="9" />
        <line x1="62" y1="20" x2="55" y2="22" />
        <line x1="62" y1="44" x2="55" y2="42" />
        <line x1="20" y1="62" x2="22" y2="55" />
        <line x1="44" y1="62" x2="42" y2="55" />
        <line x1="2" y1="20" x2="9" y2="22" />
        <line x1="2" y1="44" x2="9" y2="42" />
      </g>
      {/* Sparkle stars at bloom */}
      <g fill="white" style={{ opacity: 'calc(max(var(--openness) - 0.82, 0) * 6)' }}>
        {/* 4-point star at top */}
        <path d="M32 10 L33 13 L36 14 L33 15 L32 18 L31 15 L28 14 L31 13 Z" />
        {/* 4-point star left */}
        <path d="M14 28 L15 30 L17 31 L15 32 L14 34 L13 32 L11 31 L13 30 Z" />
        {/* 4-point star right */}
        <path d="M50 28 L51 30 L53 31 L51 32 L50 34 L49 32 L47 31 L49 30 Z" />
      </g>

      {/* === LAYER 6: Splatter dots — late bloom accent === */}
      <g fill="var(--crystal-primary)"
         style={{ opacity: 'calc(max(var(--openness) - 0.85, 0) * 7)' }}>
        <circle cx="16" cy="12" r="1.2" />
        <circle cx="48" cy="12" r="0.9" />
        <circle cx="12" cy="48" r="1" />
        <circle cx="52" cy="48" r="1.2" />
        <circle cx="8" cy="30" r="0.8" />
        <circle cx="56" cy="34" r="0.8" />
        <circle cx="32" cy="6" r="0.9" />
        <circle cx="32" cy="58" r="0.9" />
        <circle cx="20" cy="5" r="0.6" />
        <circle cx="44" cy="5" r="0.6" />
        <circle cx="20" cy="59" r="0.6" />
        <circle cx="44" cy="59" r="0.6" />
      </g>
    </svg>
  )
}

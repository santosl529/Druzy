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
        {/* Roughen edges for a hand-painted, non-vector feel */}
        <filter id={roughen} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="3" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="1.2" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        {/* Soft colored halo behind the stone */}
        <radialGradient id={halo} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--crystal-glow)" stopOpacity="0.35" />
          <stop offset="70%" stopColor="var(--crystal-glow)" stopOpacity="0.12" />
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

      {/* === LAYER 1: Burst rays + sparkles — bloom only (gated past ~0.8) === */}
      <g stroke="var(--crystal-primary)" strokeWidth="1.2" strokeLinecap="round"
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

      {/* === LAYER 2: Seam inner-glow — visible before split === */}
      {/* Horizontal seam glow background (fades when chunks fly apart) */}
      <rect x="8" y="29.5" width="48" height="5" rx="1"
        fill={`url(#${innerGlow})`}
        style={{ opacity: 'calc(min(max(var(--openness) - 0.2, 0) * 5, 1) * max(1 - max(var(--openness) - 0.6, 0) * 5, 0))' }} />

      {/* === LAYER 3: Crack network — lights up during cracking/charging, fades at split === */}
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

      {/* === LAYER 4: Crystal cluster — grows from center gap === */}
      {/* Glowing core behind crystals (visible from splitting onward) */}
      <ellipse cx="32" cy="32" rx="10" ry="9"
        fill={`url(#${innerGlow})`}
        style={{ opacity: 'calc(max(var(--openness) - 0.5, 0) * 3)' }} />
      {/* Main crystal cluster */}
      <g
        fill={`url(#${crystalGrad})`}
        stroke="rgba(0,0,0,0.6)"
        strokeWidth="0.6"
        strokeLinejoin="round"
        style={{
          opacity: 'calc(max(var(--openness) - 0.5, 0) * 2.5)',
          transform: 'scale(calc(0.55 + var(--openness) * 0.45))',
          transformOrigin: '32px 32px',
        }}
      >
        {/* Central tall crystal */}
        <polygon points="32,10 36,26 32,48 28,26" />
        {/* Left crystals */}
        <polygon points="21,18 26,30 22,46 17,32" opacity="0.95" />
        <polygon points="14,24 19,33 15,44 10,35" opacity="0.85" />
        {/* Right crystals */}
        <polygon points="43,18 47,32 42,46 38,30" opacity="0.95" />
        <polygon points="49,24 54,35 50,44 45,33" opacity="0.85" />
        {/* Lower crystals */}
        <polygon points="28,38 33,50 29,60 25,50" opacity="0.9" />
        <polygon points="36,38 39,50 35,60 31,50" opacity="0.9" />
        {/* Facet highlights — white tips */}
        <polygon points="32,10 34,22 32,30 31,22" fill="var(--crystal-glow)" opacity="0.6" stroke="none" />
        <polygon points="21,18 23,27 22,34 20,27" fill="var(--crystal-glow)" opacity="0.5" stroke="none" />
        <polygon points="43,18 45,27 43,34 42,27" fill="var(--crystal-glow)" opacity="0.5" stroke="none" />
        {/* White sparkle tips */}
        <polygon points="32,10 33,14 32,17 31,14" fill="white" opacity="0.85" stroke="none" />
        <polygon points="21,18 22,21 21,24 20,21" fill="white" opacity="0.75" stroke="none" />
        <polygon points="43,18 44,21 43,24 42,21" fill="white" opacity="0.75" stroke="none" />
      </g>

      {/* === LAYER 5: Stone shell — 4 chunks, flush when sealed, fly to corners when split === */}
      {/*
        The stone is a horizontal oval/rectangular shape with chamfered corners,
        split into top-left, top-right, bottom-left, bottom-right quadrants.
        Each chunk translates outward past the 0.55 threshold.
        Reference (frame 2): faceted grey stone with wavy/chunky silhouette.
      */}
      <g fill="#9a98a0" stroke="rgba(0,0,0,0.72)" strokeWidth="0.9" strokeLinejoin="round">
        {/* Top-left chunk */}
        <path
          style={{ transform: 'translate(calc(max(var(--openness) - 0.55, 0) * -38px), calc(max(var(--openness) - 0.55, 0) * -34px))' }}
          d="M10 14 L18 8 L32 8 L33 30 L32 32 L8 32 L8 20 Z"
          filter={`url(#${roughen})`}
        />
        {/* Top-right chunk */}
        <path
          style={{ transform: 'translate(calc(max(var(--openness) - 0.55, 0) * 38px), calc(max(var(--openness) - 0.55, 0) * -34px))' }}
          d="M32 8 L46 8 L54 14 L56 20 L56 32 L32 32 L31 30 Z"
          filter={`url(#${roughen})`}
        />
        {/* Bottom-left chunk */}
        <path
          style={{ transform: 'translate(calc(max(var(--openness) - 0.55, 0) * -38px), calc(max(var(--openness) - 0.55, 0) * 34px))' }}
          d="M8 32 L32 32 L33 34 L32 56 L18 56 L10 50 L8 44 Z"
          filter={`url(#${roughen})`}
        />
        {/* Bottom-right chunk */}
        <path
          style={{ transform: 'translate(calc(max(var(--openness) - 0.55, 0) * 38px), calc(max(var(--openness) - 0.55, 0) * 34px))' }}
          d="M32 32 L56 32 L56 44 L54 50 L46 56 L32 56 L31 34 Z"
          filter={`url(#${roughen})`}
        />
        {/* Stone facet shading — dark inner edges (always drawn with chunk, hidden behind cracks) */}
        {/* Top-left inner shading */}
        <path
          style={{ transform: 'translate(calc(max(var(--openness) - 0.55, 0) * -38px), calc(max(var(--openness) - 0.55, 0) * -34px))' }}
          d="M12 16 L20 11 L32 11 L32 29 L10 29 L10 21 Z"
          fill="#7a7880" stroke="none"
        />
        {/* Top-right inner shading */}
        <path
          style={{ transform: 'translate(calc(max(var(--openness) - 0.55, 0) * 38px), calc(max(var(--openness) - 0.55, 0) * -34px))' }}
          d="M32 11 L44 11 L52 17 L54 21 L54 29 L32 29 Z"
          fill="#7a7880" stroke="none"
        />
        {/* Bottom-left inner shading */}
        <path
          style={{ transform: 'translate(calc(max(var(--openness) - 0.55, 0) * -38px), calc(max(var(--openness) - 0.55, 0) * 34px))' }}
          d="M10 35 L32 35 L32 53 L20 53 L12 48 L10 43 Z"
          fill="#6a6870" stroke="none"
        />
        {/* Bottom-right inner shading */}
        <path
          style={{ transform: 'translate(calc(max(var(--openness) - 0.55, 0) * 38px), calc(max(var(--openness) - 0.55, 0) * 34px))' }}
          d="M32 35 L54 35 L54 43 L52 47 L44 53 L32 53 Z"
          fill="#6a6870" stroke="none"
        />
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

/**
 * The Mentor mascot — single source of truth for geometry and palette.
 *
 * Design locked 2026-06-10 (spec: docs/specs/2026-06-10-mentor-mascot-and-birth-animation.md,
 * reference render: docs/logo-designs/mentor-mascot/mentor-mascot-locked.svg).
 *
 * Two poses:
 * - HERO: full eight-arm sprawl — ceremonies, splash-scale surfaces (≥120px).
 * - BADGE: compact tucked-arm crop — small surfaces (~48–96px) where the
 *   sprawl turns to noise. Suckers are omitted below readable size.
 *
 * Colors are brand-fixed by design (ceremony/brand character, same exception
 * as AnimatedSplash / *Celebration components) — do not migrate to theme tokens.
 */

export const MASCOT_COLORS = {
  /** Body gradient top (bright teal) */
  tealBright: '#14b8a6',
  /** Body gradient bottom + primary arm fill */
  tealDeep: '#0d9488',
  /** Alternating arm depth */
  tealDarker: '#0f766e',
  /** Sucker spots */
  mint: '#99f6e4',
  /** Beanie dome */
  beanie: '#8b5cf6',
  /** Beanie band */
  beanieBand: '#a78bfa',
  /** Pupils + smirk */
  navy: '#1a1a3e',
  /** Eyelid crease */
  crease: '#0a5d55',
  /** Eye whites */
  white: '#ffffff',
  /** Milestone dots (the "juggling balls" — same trio as the logo) */
  dotPink: '#f472b6',
  dotViolet: '#a78bfa',
  dotMint: '#5eead4',
} as const;

type ArmPath = { d: string; fill: string };
type SuckerSpot = { cx: number; cy: number; rx: number; ry: number };

const { tealDeep, tealDarker } = MASCOT_COLORS;

/** Full hero pose — eight wavy tapered arms, graduated suckers. ViewBox 0 0 230 185. */
export const MASCOT_HERO = {
  viewBox: '0 0 230 185',
  width: 230,
  height: 185,
  gradient: { y1: 8, y2: 104 },
  head: { cx: 110, cy: 54, r: 46 },
  skirt: { cx: 110, cy: 86, rx: 46, ry: 16 },
  arms: [
    { d: 'M74,76 C48,66 38,92 8,52 C2,68 22,98 76,92 Z', fill: tealDeep },
    {
      d: 'M80,88 C54,100 44,116 26,136 C22,142 28,150 34,144 C50,126 64,112 86,100 Z',
      fill: tealDarker,
    },
    {
      d: 'M92,96 C84,120 74,134 64,156 C61,164 70,170 74,162 C84,142 94,120 102,100 Z',
      fill: tealDeep,
    },
    {
      d: 'M106,98 C104,124 96,142 104,164 C107,172 116,170 114,161 C110,142 116,120 118,100 Z',
      fill: tealDarker,
    },
    {
      d: 'M122,96 C132,120 144,132 154,152 C158,160 150,166 146,158 C136,138 122,118 112,100 Z',
      fill: tealDeep,
    },
    {
      d: 'M132,88 C158,100 174,104 192,124 C198,131 192,140 186,133 C170,114 148,104 128,98 Z',
      fill: tealDarker,
    },
    {
      d: 'M138,74 C166,64 186,90 222,50 C228,66 206,96 142,92 Z',
      fill: tealDeep,
    },
  ] satisfies ArmPath[],
  suckers: [
    { cx: 52, cy: 76, rx: 3.5, ry: 2.4 },
    { cx: 32, cy: 72, rx: 2.8, ry: 2 },
    { cx: 16, cy: 62, rx: 2, ry: 1.4 },
    { cx: 58, cy: 108, rx: 3, ry: 2.2 },
    { cx: 40, cy: 126, rx: 2.2, ry: 1.6 },
    { cx: 80, cy: 128, rx: 3, ry: 2.2 },
    { cx: 70, cy: 150, rx: 2, ry: 1.5 },
    { cx: 106, cy: 130, rx: 3, ry: 2.2 },
    { cx: 106, cy: 152, rx: 2, ry: 1.5 },
    { cx: 136, cy: 130, rx: 3, ry: 2.2 },
    { cx: 146, cy: 150, rx: 2, ry: 1.5 },
    { cx: 162, cy: 110, rx: 3, ry: 2.2 },
    { cx: 180, cy: 124, rx: 2.2, ry: 1.6 },
    { cx: 172, cy: 76, rx: 3.5, ry: 2.4 },
    { cx: 200, cy: 68, rx: 2.5, ry: 1.8 },
  ] satisfies SuckerSpot[],
  beanie: {
    dome: 'M76,32 a34,24 0 0 1 68,0 z',
    band: { x: 72, y: 24, width: 76, height: 9, rx: 4.5 },
  },
  eyes: {
    cy: 46,
    r: 11,
    pupilCy: 48,
    pupilR: 5,
    left: {
      cx: 94,
      lid: 'M83.4,43 A11,11 0 1 1 104.6,43 Z',
      crease: 'M83.4,43 H104.6',
    },
    right: {
      cx: 126,
      lid: 'M115.4,43 A11,11 0 1 1 136.6,43 Z',
      crease: 'M115.4,43 H136.6',
    },
    creaseWidth: 2.5,
  },
  smirk: { d: 'M100,66 q10,6 19,-1', width: 3 },
} as const;

/** Compact badge pose — tucked arms, no suckers. ViewBox 0 0 140 140. */
export const MASCOT_BADGE = {
  viewBox: '0 0 140 140',
  width: 140,
  height: 140,
  gradient: { y1: 32, y2: 95 },
  head: { cx: 70, cy: 62, r: 30 },
  skirt: { cx: 70, cy: 84, rx: 30, ry: 11 },
  arms: [
    { d: 'M48,74 C34,66 28,84 12,64 C8,76 22,92 50,86 Z', fill: tealDeep },
    {
      d: 'M52,84 C40,94 34,102 26,112 C23,117 29,122 32,117 C40,106 48,96 58,90 Z',
      fill: tealDarker,
    },
    {
      d: 'M62,89 C58,102 52,110 49,119 C47,124 54,127 56,121 C60,110 66,100 69,92 Z',
      fill: tealDeep,
    },
    {
      d: 'M78,89 C82,102 88,110 91,119 C93,124 86,127 84,121 C80,110 74,100 71,92 Z',
      fill: tealDarker,
    },
    {
      d: 'M88,84 C100,94 106,102 114,112 C117,117 111,122 108,117 C100,106 92,96 82,90 Z',
      fill: tealDeep,
    },
    {
      d: 'M92,74 C106,66 112,84 128,64 C132,76 118,92 90,86 Z',
      fill: tealDarker,
    },
  ] satisfies ArmPath[],
  beanie: {
    dome: 'M48,48 a22,16 0 0 1 44,0 z',
    band: { x: 45, y: 43, width: 50, height: 6.5, rx: 3.2 },
  },
  eyes: {
    cy: 58,
    r: 7,
    pupilCy: 59.5,
    pupilR: 3.2,
    left: {
      cx: 60,
      lid: 'M53.3,56 A7,7 0 1 1 66.7,56 Z',
      crease: 'M53.3,56 H66.7',
    },
    right: {
      cx: 80,
      lid: 'M73.3,56 A7,7 0 1 1 86.7,56 Z',
      crease: 'M73.3,56 H86.7',
    },
    creaseWidth: 2,
  },
  smirk: { d: 'M63,72 q7,4 13,-1', width: 2.4 },
  /** Final resting spots of the juggled milestone dots (BrandCelebration). */
  juggleDots: [
    { cx: 38, cy: 26, r: 5, fill: MASCOT_COLORS.dotPink },
    { cx: 70, cy: 12, r: 6, fill: MASCOT_COLORS.dotViolet },
    { cx: 102, cy: 24, r: 7, fill: MASCOT_COLORS.dotMint },
  ],
} as const;

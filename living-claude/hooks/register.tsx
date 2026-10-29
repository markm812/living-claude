import type { Register, Timer } from 'claude-code'

// The band draws one Raster and repaints it with $.ui.blit: a redraw per frame
// would be capped at ten a second and would re-run the whole render chain.
const PANE = 'living-claude'
const KEY = 'scene'
const FRAME_MS = 160

const BLANK = 0x20
const UPPER = 0x2580 // fg paints the cell's top pixel, bg its bottom
const LOWER = 0x2584 // fg paints the bottom pixel, so the top can stay the terminal's own
const CLEAR = 0x01000000 // the terminal's own colour, and only ever a background

// Sprout's Guild: every scene is 48x16 pixels over a 32 frame loop, so one
// geometry and one palette serve all fourteen.
const SPRITE_W = 48
const SPRITE_H = 16
const FRAMES = 32
const SCENE_ROWS = SPRITE_H / 2 // two pixels to a cell, at scale 1

const PAL: Record<string, number> = {
  o: 0xd97757, d: 0xb85c3e, k: 0x1f1e1d, w: 0xfaf9f5, p: 0xeba59a, y: 0xf2c14e,
  m: 0x6a9bcc, r: 0xc9473f, g: 0x8a8578, b: 0x8b5e3c, B: 0x5a3a22, s: 0xc4bfb3,
  S: 0x6e6a62, G: 0x6f8f4e, P: 0x6b4e9b, h: 0xe3c77e, L: 0x9cc3e6, n: 0x33507a,
}

type P = readonly [number, number]
type Grid = string[][]
// A point list destructures to `number | undefined` under the strict index
// rule, so the two setters take the loose pair and drop what falls off-grid.
type Ink = (x: number | undefined, y: number | undefined, c: string) => void
type Pts = (c: string, list: readonly P[]) => void
type Rect = (c: string, x0: number, y0: number, x1: number, y1: number) => void
type Body = (bx: number, dy?: number) => void
type SceneFn = (
  s: Ink, pts: Pts, g: Grid, t: number,
  A: Ink, AR: Rect, AE: Pts, body: Body, IE: Pts,
) => void

const BASE = [
  '................',
  '........ooo.....',
  '.......oo.......',
  '.......d........',
  '...oooooooooo...',
  '..oooooooooooo..',
  '..oooooooooooo..',
  '..oookooookooo..',
  '..oookooookooo..',
  '..oooooooooooo..',
  '..oooooddooooo..',
  '..oooooooooooo..',
  '...oooooooooo...',
  '...dddddddddd...',
  '....dd....dd....',
  '................',
]

const R = (s: Ink, c: string, x0: number, y0: number, x1: number, y1: number): void => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) s(x, y, c)
}

const clearEyes = (s: Ink): void => { for (const [x, y] of [[5, 7], [5, 8], [10, 7], [10, 8]] as const) s(x, y, 'o') }
const clearMouth = (s: Ink): void => { s(7, 10, 'o'); s(8, 10, 'o') }
const clearSprout = (s: Ink): void => { for (const [x, y] of [[8, 1], [9, 1], [10, 1], [7, 2], [8, 2], [7, 3]] as const) s(x, y, '.') }
const happyEyes = (pts: Pts): void => pts('k', [[5, 7], [4, 8], [6, 8], [10, 7], [9, 8], [11, 8]])
const cheeks = (pts: Pts): void => pts('p', [[3, 9], [12, 9]])
const blink = (s: Ink, pts: Pts): void => { clearEyes(s); pts('d', [[4, 8], [5, 8], [6, 8], [9, 8], [10, 8], [11, 8]]) }
const BL = (s: Ink, pts: Pts, t: number, a = 20): void => { if (t === a || t === a + 1) blink(s, pts) }
const wiggle = (s: Ink, pts: Pts, t: number): void => {
  if (t % 16 >= 8) { clearSprout(s); pts('o', [[5, 1], [6, 1], [7, 1], [7, 2], [8, 2]]); s(8, 3, 'd') }
}
const SW = (t: number): number => ([0, 0, 1, 1, 0, 0, -1, -1][t % 8]) ?? 0

function frame(fn: SceneFn, t: number): Grid {
  const g: Grid = []
  for (let y = 0; y < SPRITE_H; y++) g.push(new Array<string>(SPRITE_W).fill('.'))
  let ox = 0
  let oy = 0
  const A: Ink = (x, y, c) => {
    if (x === undefined || y === undefined) return
    const row = g[y]
    if (row !== undefined && x >= 0 && x < SPRITE_W) row[x] = c
  }
  const AR: Rect = (c, x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) A(x, y, c) }
  const AE: Pts = (c, list) => { for (const [x, y] of list) if (g[y]?.[x] === '.') A(x, y, c) }
  // The body sets the origin every later `s` and `pts` call is read against.
  const body: Body = (bx, dy = 0) => {
    ox = bx
    oy = dy
    BASE.forEach((row, y) => row.split('').forEach((c, x) => { if (c !== '.') A(x + bx, y + dy, c) }))
  }
  const s: Ink = (x, y, c) => { if (x !== undefined && y !== undefined) A(x + ox, y + oy, c) }
  const pts: Pts = (c, list) => { for (const [x, y] of list) s(x, y, c) }
  const IE: Pts = (c, list) => { for (const [x, y] of list) if (g[y + oy]?.[x + ox] === '.') A(x + ox, y + oy, c) }
  fn(s, pts, g, t, A, AR, AE, body, IE)

  return g
}

const loop = (fn: SceneFn): Grid[] => Array.from({ length: FRAMES }, (_, t) => frame(fn, t))

export type Mascot = { name: string; scene: SceneFn }

export const MASCOTS: readonly [Mascot, ...Mascot[]] = [
  {
    name: 'Sprout',
    scene: (s, pts, g, t, A, AR, AE, body) => {
      body(16, t % 8 < 4 ? 0 : 1)
      wiggle(s, pts, t); BL(s, pts, t, 12); BL(s, pts, t, 27)
    },
  },
  {
    name: 'Miner',
    scene: (s, pts, g, t, A, AR, AE, body) => {
      body(8)
      AR('S', 0, 0, 47, 0); AE('S', [[5, 1], [5, 2], [13, 1], [30, 1], [30, 2], [30, 3], [41, 1]]); AR('S', 0, 1, 3, 14); [[1, 4], [2, 9], [1, 12]].forEach(([x, y]) => A(x, y, 'g'))
      AR('S', 26, 1, 47, 14); [[29, 4], [35, 8], [44, 3], [40, 11], [33, 12], [46, 7]].forEach(([x, y]) => A(x, y, 'y')); [[28, 10], [38, 5], [42, 13], [31, 7], [45, 10], [36, 2], [27, 13]].forEach(([x, y]) => A(x, y, 'g'))
      AR('S', 0, 15, 47, 15); for (let x = 2; x < 48; x += 5) A(x, 15, 'g')
      AR('S', 5, 10, 9, 13); A(5, 10, 'g'); A(9, 13, 'g'); A(6, 14, 'k'); A(8, 14, 'k'); AE('b', [[4, 13], [10, 13]])
      A(24, 1, 'g'); AR(t % 6 < 3 ? 'y' : 'h', 24, 2, 25, 3); if (t % 6 < 3) AE('h', [[23, 3], [26, 2]])
      clearSprout(s); BL(s, pts, t); R(s, 'y', 6, 2, 9, 2); R(s, 'y', 4, 3, 11, 3); R(s, 'y', 3, 4, 12, 4); if (t < 29) pts('w', [[7, 3], [8, 3]]); R(s, 'S', 12, 13, 15, 14); s(13, 13, 'g'); s(15, 14, 'g')
      if (t < 24) {
        const p = t % 12
        if (p < 3) { R(s, 'b', 14, 5, 14, 11); R(s, 'S', 12, 4, 15, 4); pts('S', [[12, 5], [15, 5]]) }
        else if (p < 5) { R(s, 'b', 14, 1, 14, 8); R(s, 'S', 12, 0, 15, 0); pts('S', [[12, 1], [15, 1]]) }
        else {
          R(s, 'b', 14, 7, 14, 11); R(s, 'S', 13, 12, 15, 12)
          if (p < 7) pts('y', [[11, 12], [15, 11], [12, 11], [11, 10]])
          else if (p < 9) pts('y', [[10, 11], [11, 13], [15, 10]])
          else if (p < 11) pts('y', [[9, 10], [10, 14]])
        }
      } else {
        const p = t - 24
        R(s, 'b', 14, 8, 14, 11); R(s, 'S', 13, 12, 15, 12); pts('o', [[14, 6], [14, 5], [13, 4]]); if (p > 2) s(11, 1 + Math.min(p - 3, 3), 'L')
      }
      if (t >= 13 && t < 24) { const p = t - 13; AE('y', [[21 - Math.round(p * 1.4), Math.round(12 - 0.3 * p - 5 * Math.sin(Math.PI * p / 10))]]) } else if (t >= 24) A(7, 9, 'y')
    },
  },
  {
    name: 'Hauler',
    scene: (s, pts, g, t, A, AR, AE, body) => {
      body(16, t % 4 < 2 ? 0 : 1)
      AR('b', 1, 9, 6, 14); [[1, 9], [6, 9], [1, 14], [6, 14], [1, 11], [6, 12], [3, 10], [4, 13]].forEach(([x, y]) => A(x, y, 'B')); A(3, 12, 'g'); A(4, 12, 'g')
      AR('b', 7, 11, 11, 14); [[7, 11], [11, 11], [7, 14], [11, 14]].forEach(([x, y]) => A(x, y, 'B')); A(9, 12, 'g')
      AR('b', 2, 4, 5, 8); [[2, 4], [5, 4], [2, 8], [5, 8], [3, 6], [4, 6]].forEach(([x, y]) => A(x, y, 'B'))
      AR('B', 34, 10, 46, 12); AR('b', 35, 10, 45, 11); A(34, 9, 'B'); A(46, 9, 'B'); AR('k', 36, 13, 37, 14); AR('k', 43, 13, 44, 14); A(36, 13, 'g'); A(43, 13, 'g')
      AR('S', 0, 15, 47, 15); for (let x = 1; x < 48; x += 4) A(x, 15, 'g')
      clearSprout(s)
      const panic = t >= 28
      const w = panic ? (t % 2 ? 2 : -2) : SW(t)
      const two = t >= 16
      if (two) { R(s, 'b', 4 + w, 2, 11 + w, 3); R(s, 'B', 4 + w, 3, 11 + w, 3); pts('B', [[4 + w, 2], [11 + w, 2], [7 + w, 2]]); R(s, 'g', 5 + w, 0, 10 + w, 1); pts('B', [[7 + w, 0], [8 + w, 0]]) }
      else { R(s, 'b', 4 + w, 0, 11 + w, 3); R(s, 'B', 4 + w, 0, 11 + w, 0); R(s, 'B', 4 + w, 3, 11 + w, 3); pts('B', [[4 + w, 1], [4 + w, 2], [11 + w, 1], [11 + w, 2], [6 + w, 1], [7 + w, 2], [8 + w, 1], [9 + w, 2]]) }
      pts('o', [[3, 2], [3, 3], [12, 2], [12, 3]]); clearEyes(s); clearMouth(s)
      if (panic) { pts('w', [[4, 7], [9, 7]]); pts('k', [[5, 7], [4, 8], [5, 8], [10, 7], [9, 8], [10, 8], [7, 10], [8, 10], [7, 11], [8, 11]]) }
      else { pts('k', [[4, 7], [5, 8], [4, 9], [11, 7], [10, 8], [11, 9]]); pts('d', [[7, 10], [8, 10]]) }
      s(14, 5 + ((t % 8) >> 1), 'L'); if (two) s(1, 6 + (((t + 4) % 8) >> 1), 'L')
    },
  },
  {
    name: 'Swordsman',
    scene: (s, pts, g, t, A, AR, AE, body) => {
      body(18, t >= 24 && t % 8 >= 4 ? 1 : 0)
      AR('g', 0, 2, 6, 14); [[0, 1], [2, 1], [4, 1], [6, 1]].forEach(([x, y]) => A(x, y, 'g')); [[1, 4], [4, 4], [2, 7], [5, 7], [1, 10], [4, 10], [2, 13], [5, 13]].forEach(([x, y]) => A(x, y, 'S'))
      AR('s', 9, 0, 9, 6); A(10, 0, 'r'); A(11, 0, 'r'); A(10, 1, 'r'); if (t % 8 < 4) A(12, 0, 'r'); else A(11, 1, 'r')
      const dx = (t >= 10 && t < 16) ? (t % 2) : 0
      AR('h', 39 + dx, 2, 41 + dx, 4); AR('b', 38 + dx, 5, 42 + dx, 9); A(40 + dx, 7, 'y'); [[39 + dx, 7], [41 + dx, 7], [40 + dx, 6], [40 + dx, 8]].forEach(([x, y]) => A(x, y, 'r')); AE('h', [[37 + dx, 5], [43 + dx, 7]]); AR('b', 40, 10, 40, 14); AR('b', 37, 10, 43, 10)
      if (t >= 10 && t < 16) { const p = t - 10; AE('h', [[36 - p, 3 - (p >> 1)], [44 + p, 4 - (p >> 1)], [43 + p, 1]]) }
      AR('G', 0, 15, 47, 15); [8, 14, 22, 30, 36, 44].forEach(x => A(x, 15, 'S'))
      BL(s, pts, t, 28); R(s, 'r', 2, 5, 13, 5); pts('r', [[14, 5], [15, 6], [14, 6]]); pts('d', [[4, 6], [5, 6], [10, 6], [11, 6]])
      const blk = t >= 16 && t < 24
      const sy = blk ? -3 : 0
      R(s, 'n', 0, 7 + sy, 2, 11 + sy); s(1, 9 + sy, 'y'); s(0, 11 + sy, '.'); s(2, 11 + sy, 'o')
      if (blk) {
        const p = t - 16
        if (p < 2) pts('s', [[0, 5], [1, 5]])
        else if (p < 5) pts('y', [[0, 3], [1, 2], [0, 5]])
        else if (p < 7) pts('y', [[0, 2], [1, 1]])
      }
      if (t < 8 || t >= 12) {
        const o = t % 8 < 4 ? 0 : 1
        R(s, 's', 14, 1 + o, 14, 7 + o); s(14, o, 'w'); pts('y', [[13, 8 + o], [14, 8 + o], [15, 8 + o]]); pts('b', [[14, 9 + o], [14, 10 + o]]); s(14, 1 + o + (t % 7), 'w'); if (t >= 12 && t < 14) pts('w', [[15, 2], [15, 3]])
      } else {
        const p = t - 8
        if (p < 2) { pts('s', [[14, 3], [13, 2], [12, 1], [11, 0]]); s(15, 4, 'y'); s(15, 5, 'b') }
        else { R(s, 's', 6, 0, 13, 0); s(5, 0, 'w'); pts('y', [[14, 0], [15, 0]]); pts('w', [[15, 2], [14, 1]]) }
      }
    },
  },
  {
    name: 'Wizard',
    scene: (s, pts, g, t, A, AR, AE, body, IE) => {
      const up = t >= 12 && t < 28 ? -2 : 0
      body(14, up ? -1 : 0)
      AR('B', 0, 2, 9, 14); [2, 6, 10, 14].forEach(y => AR('b', 0, y, 9, y))
      const bk = ['r', 'G', 'm', 'P', 'y', 'n', 'r', 'm']
      const bands: readonly P[] = [[3, 5], [7, 9], [11, 13]]
      bands.forEach(([y0, y1], i) => { for (let x = 1; x < 9; x++) if (x !== 4 + (i % 2)) AR(bk[(x + i) % 8] ?? 'r', x, y0, x, y1) })
      A(3, 1, 'w'); A(3, 0, t % 2 ? 'y' : 'r')
      AR('g', 40, 4, 42, 14); [[39, 14], [43, 14], [39, 4], [43, 4]].forEach(([x, y]) => A(x, y, 'g'))
      const lit = t >= 25 && t < 28
      AR(lit ? 'w' : 'L', 40, 1, 42, 3); A(41, 0, lit ? 'y' : 'L'); if (lit) AE('y', [[39, 2], [43, 1], [44, 3], [38, 0]]); else if (t % 8 < 2) AE('w', [[41, 2]])
      AE('w', [[46, 0], [47, 1], [47, 2], [46, 3]])
      AR('B', 0, 15, 47, 15); for (let x = 3; x < 48; x += 6) A(x, 15, 'b')
      clearSprout(s); BL(s, pts, t, 8)
      const hx = t >= 28 && t % 2 ? 1 : 0
      s(10 + hx, 0, 'P'); R(s, 'P', 9 + hx, 1, 10 + hx, 1); R(s, 'P', 8 + hx, 2, 10 + hx, 2); R(s, 'P', 6, 3, 11, 3); R(s, 'P', 2, 4, 13, 4); s(8, 3, 'y'); clearMouth(s); R(s, 'w', 4, 10, 11, 11); R(s, 'w', 5, 12, 10, 12); pts('w', [[7, 13], [8, 13]])
      R(s, 'b', 1, 5 + up, 1, 14); R(s, t % 4 < 2 ? 'y' : 'L', 0, 3 + up, 2, 4 + up)
      const wand: readonly P[] = [[3, 2 + up], [0, 1 + up], [3, 5 + up], [2, 0]]
      const tip = wand[t % 4]
      if (tip !== undefined) IE('y', [tip])
      if (t >= 20 && t < 28) {
        const p = t - 20
        const len = Math.min(p * 5, 23)
        for (let x = 17; x < 17 + len; x++) AE(x % 2 ? 'L' : 'y', [[x, 0]])
        if (p >= 5) AE('w', [[39, 1], [38, 0]])
        AE('y', [p % 2 ? [17 + Math.min(len, 20), 2] : [19 + (p * 3) % 15, 1]])
      }
    },
  },
  {
    name: 'Archer',
    scene: (s, pts, g, t, A, AR, AE, body) => {
      body(16); clearSprout(s); BL(s, pts, t, 24); R(s, 'G', 5, 2, 10, 2); R(s, 'G', 3, 3, 12, 3); R(s, 'G', 2, 4, 13, 4); pts('G', [[2, 5], [2, 6], [13, 5], [13, 6]])
      AR('b', 16, 6, 17, 11); A(16, 5, 'r'); A(17, 4, 'r'); A(17, 5, 'r')
      AR('G', 0, 15, 47, 15); AE('G', [[3, 14], [9, 14], [36, 14], [12, 14], [40, 14]])
      AR('B', 5, 9, 6, 14); AR('G', 2, 4, 9, 8); AR('G', 3, 3, 8, 3); AR('G', 4, 2, 7, 2); A(1, 6, 'G'); A(10, 6, 'G'); A(4, 5, 'r'); A(7, 7, 'r')
      const cx = 26 + (t >> 2)
      AE('w', [[cx, 1], [cx + 1, 1], [cx + 2, 1], [cx + 1, 0], [cx + 3, 1]])
      const bx = 47 - (t % 24) * 2
      const by = t % 4 < 2 ? 1 : 2
      AE('k', [[bx, by], [bx + 1, by + 1], [bx + 2, by]])
      AR('h', 42, 8, 45, 14); A(43, 10, 'r'); A(44, 10, 'r'); A(43, 12, 'r'); A(44, 12, 'r'); A(43, 11, 'w'); A(44, 11, 'w'); A(42, 9, 'y'); A(45, 13, 'y')
      const pull = t < 4 || (t >= 16 && t < 20)
      AR('b', 33, 5, 33, 10); A(32, 4, 'b'); A(32, 11, 'b'); AR('w', pull ? 31 : 32, 5, pull ? 31 : 32, 10); A(31, 8, 'o'); A(30, 8, 'o')
      if (pull) { A(30, 6, 'r'); AR('b', 31, 6, 33, 6); A(34, 6, 's'); A(30, 7, 'o'); s(5, 7, 'o') }
      const arrow = (x: number, y: number): void => { A(x - 1, y, 'r'); AR('b', x, y, x + 2, y); A(x + 3, y, 's') }
      const Y1 = [6, 6, 6, 7, 7, 8, 9, 10]
      const Y2 = [6, 6, 7, 7, 8, 9, 10, 11]
      if (t >= 4 && t < 12) arrow(34 + (t - 4), Y1[t - 4] ?? 6)
      if (t >= 12) { arrow(39, 10); if (t < 15 && t % 2) A(38, 9, 'r') }
      if (t >= 20 && t < 28) arrow(34 + (t - 20), Y2[t - 20] ?? 6)
      if (t >= 28) arrow(39, 11)
    },
  },
  {
    name: 'Smith',
    scene: (s, pts, g, t, A, AR, AE, body, IE) => {
      body(10)
      AR('S', 32, 3, 46, 14); [[33, 5], [36, 5], [39, 5], [42, 5], [45, 5], [34, 7], [44, 7], [33, 10], [45, 11], [33, 14], [36, 14], [44, 14]].forEach(([x, y]) => A(x, y, 'g'))
      AR('k', 36, 8, 42, 13); AR('r', 37, 11, 41, 13); A(38, 10, t % 2 ? 'y' : 'r'); A(40, 10, t % 2 ? 'r' : 'y'); A(39, 11, 'y'); if (t % 4 < 2) A(39, 9, 'r')
      AR('S', 38, 1, 41, 2); AE('g', [[39 + ((t >> 2) % 3), 0]])
      AR('b', 2, 9, 7, 14); AR('B', 2, 10, 7, 10); AR('B', 2, 13, 7, 13); AR('L', 3, 9, 6, 9); A(4, 9, 'w')
      AR('b', 0, 2, 8, 2); [[2, 3], [2, 4], [1, 5], [3, 5]].forEach(([x, y]) => A(x, y, 's')); AR('s', 6, 3, 6, 6); A(5, 3, 'y'); A(7, 3, 'y')
      AR('S', 0, 15, 47, 15); for (let x = 1; x < 48; x += 5) A(x, 15, 'g')
      BL(s, pts, t, 4); R(s, 'b', 4, 11, 11, 12); pts('b', [[4, 10], [11, 10]]); pts('g', [[3, 9], [12, 9]]); R(s, 'S', 13, 13, 15, 13); s(14, 14, 'S'); R(s, 'S', 13, 15, 15, 15)
      const up = (): void => { R(s, 'b', 14, 7, 14, 10); R(s, 'S', 13, 5, 15, 6) }
      const down = (y: number): void => { R(s, 'b', 14, y - 4, 14, y - 1); R(s, 'S', 13, y, 15, y + 1) }
      if (t < 12) { const p = t % 4; if (p < 2) up(); else { down(11); if (p === 2) pts('y', [[15, 9], [12, 14], [12, 10]]) } }
      else if (t < 16) { up(); s(14, 12, 'r'); if (t % 2) pts('y', [[13, 12], [15, 12]]) }
      else if (t < 24) {
        const p = t % 4
        const hot = p === 2
        s(14, 12, hot ? 'y' : 'r')
        if (p < 2) up(); else { down(10); if (hot) pts('y', [[12, 9], [15, 8], [11, 12], [15, 12]]) }
      }
      else { const p = t - 24; up(); s(14, 12, p < 2 ? 'r' : 's'); IE('w', [[14, 11 - (p % 4)], [13, 9 - (p % 4)], [15, 10 - ((p + 2) % 4)]]) }
    },
  },
  {
    name: 'Cook',
    scene: (s, pts, g, t, A, AR, AE, body, IE) => {
      body(14)
      AR('S', 32, 8, 44, 14); AR('k', 32, 8, 44, 8); AR('B', 34, 10, 42, 13); AR(t % 4 < 2 ? 'h' : 'y', 36, 11, 40, 12)
      AR('g', 38, 5, 43, 7); AR('S', 38, 5, 43, 5); A(40, 4, 'S'); A(41, 4, 'S'); A(37, 6, 'g'); A(44, 6, 'g'); AE('w', [[39 + ((t >> 1) % 3), 3 - ((t >> 2) % 2)], [42, 2 + ((t >> 3) % 2)]])
      A(35, 7, t % 2 ? 'r' : 'y'); A(36, 7, t % 2 ? 'y' : 'r')
      AR('b', 0, 10, 9, 14); AR('B', 0, 10, 9, 10); AR('w', 2, 9, 4, 9); A(3, 8, 'w'); A(7, 9, 'r'); A(7, 8, 'G'); A(8, 9, 'r')
      AR('b', 0, 0, 10, 0); [[2, 1], [1, 2], [2, 2], [3, 2], [7, 1], [6, 2], [7, 2], [8, 2]].forEach(([x, y]) => A(x, y, 'g'))
      for (let x = 0; x < 48; x++) A(x, 15, x % 2 ? 'b' : 'B')
      clearSprout(s); BL(s, pts, t, 8)
      const hx = t >= 24 && t % 4 < 2 ? 1 : 0
      R(s, 'w', 5 + hx, 0, 10 + hx, 0); R(s, 'w', 4 + hx, 1, 11 + hx, 2); R(s, 'w', 5, 3, 10, 3); R(s, 'w', 4, 4, 11, 4); clearMouth(s); pts('d', [[6, 10], [7, 10], [8, 10], [9, 10], [5, 11], [10, 11]]); R(s, 'k', 12, 3, 15, 3); pts('b', [[14, 4], [14, 5], [14, 6]])
      const cake = (y: number): void => { if (y < 0) return; if (y <= 0) s(14, y, 'y'); else pts('y', [[13, y], [14, y]]) }
      if (t < 8) cake([2, 1, 0, 0, 1, 2, 2, 2][t] ?? 2)
      else if (t < 16) { cake(2); IE('w', [t % 2 ? [12, 1] : [15, 0], t % 4 < 2 ? [13, 0] : [12, 0]]) }
      else if (t < 24) {
        const p = t - 16
        cake([2, 0, -1, -1, -1, 0, 1, 2][p] ?? 2)
        if (p >= 2 && p < 5) IE('y', ([[11, 0], [12, 0]] as readonly P[]).slice(0, p - 1))
      }
      else { cake(2); clearEyes(s); happyEyes(pts); cheeks(pts); IE('y', [t % 2 ? [1, 6] : [0, 8]]) }
    },
  },
  {
    name: 'Bard',
    scene: (s, pts, g, t, A, AR, AE, body, IE) => {
      const sing = t >= 16 && t < 24
      body(14 + (sing ? 0 : SW(t)))
      AR('b', 1, 10, 9, 10); AR('B', 2, 11, 2, 14); AR('B', 8, 11, 8, 14); AR('h', 3, 8, 4, 9); A(3, 7, 'w'); A(4, 7, 'w'); AR('h', 6, 8, 7, 9); A(6, 7, 'w'); A(7, 7, 'w')
      A(5, 0, 'g'); A(5, 1, 'g'); AR(t % 6 < 3 ? 'y' : 'h', 4, 2, 6, 3)
      AR('b', 33, 3, 47, 3); AR('g', 34, 4, 46, 14); [[35, 6], [38, 5], [44, 6], [36, 13], [45, 12], [45, 8]].forEach(([x, y]) => A(x, y, 'S')); AR('k', 37, 7, 43, 13); AR('r', 38, 10, 42, 13); A(39, 9, t % 2 ? 'y' : 'r'); A(41, 9, t % 2 ? 'r' : 'y'); A(40, 10, 'y'); if (t % 4 < 2) A(40, 8, 'r')
      AR('B', 0, 15, 47, 15); for (let x = 4; x < 48; x += 7) A(x, 15, 'b')
      clearSprout(s); pts('r', [[5, 2], [6, 2], [7, 2]]); R(s, 'r', 4, 3, 10, 3); R(s, 'r', 3, 4, 12, 4); pts('y', t % 8 < 4 ? [[8, 2], [9, 1], [10, 0], [11, 0]] : [[8, 2], [9, 1], [10, 1], [11, 0]]); clearEyes(s); clearMouth(s)
      if (sing) { blink(s, pts); pts('k', [[7, 10], [8, 10], [7, 11], [8, 11]]) }
      else { happyEyes(pts); pts('d', [[7, 9], [8, 9]]); if (t >= 24) cheeks(pts) }
      R(s, 'h', 3, 10, 7, 12); s(5, 11, 'b'); R(s, 'b', 8, 11, 14, 11); pts('B', [[15, 10], [15, 11]]); s(t % 4 < 2 ? 4 : 6, 10, 'd')
      const n = (ny: number, x: number): void => IE('k', [[x, ny], [x, ny + 1], [x - 1, ny + 2], [x, ny + 2], [x + 1, ny]])
      n(8 - (t % 8), 14); n(8 - ((t + 4) % 8), 1)
      if (t >= 24) {
        n(6 - (t % 8), 11); n(9 - ((t + 2) % 8), 0); n(7 - (t % 8), 18); n(5 - ((t + 3) % 8), -7)
        IE('y', [t % 2 ? [0, 2] : [15, 2], t % 2 ? [13, 4] : [1, 3]])
      }
    },
  },
  {
    name: 'Fisherman',
    scene: (s, pts, g, t, A, AR, AE, body) => {
      body(8); clearSprout(s); BL(s, pts, t, 4); R(s, 'G', 5, 2, 10, 3); R(s, 'G', 3, 4, 12, 4)
      const cx = 38 - (t >> 2)
      AE('w', [[cx, 1], [cx + 1, 1], [cx + 2, 1], [cx + 1, 0], [cx + 3, 1]]); AR('y', 44, 0, 45, 1); AE('y', t % 4 < 2 ? [[43, 0], [46, 2], [44, 3]] : [[46, 0], [43, 2]])
      for (let x = 0; x < 48; x++) {
        A(x, 15, (x + t) % 8 < 2 ? 'w' : 'L')
        if (x >= 27) { A(x, 14, (x + t) % 6 < 3 ? 'L' : 'm'); if ((x + t) % 9 === 0) AE('L', [[x, 13]]) }
      }
      AE('b', Array.from({ length: 27 }, (_, x): P => [x, 14])); A(4, 15, 'B'); A(25, 15, 'B'); A(4, 13, 'B'); A(25, 13, 'B')
      AR('S', 1, 12, 3, 13); A(2, 12, 'L'); A(1, 11, 'S'); A(3, 11, 'S'); AE('G', [[44, 13], [45, 13], [40, 13]]); AR('G', 46, 9, 46, 13); A(47, 11, 'G')
      A(22, 10, 'o'); [[22, 10], [23, 9], [24, 8], [25, 7], [26, 6], [27, 5], [28, 4], [29, 3], [30, 2]].forEach(([x, y]) => A(x, y, 'b')); A(22, 10, 'o')
      const fish = (fx: number, fy: number): void => { A(fx, fy, 'm'); A(fx + 1, fy, 'm'); A(fx, fy + 1, 'm'); A(fx + 1, fy + 1, 'L'); A(fx + 2, fy + (t % 2), 'm'); A(fx, fy, 'w') }
      if (t < 12) { const by = t % 4 < 2 ? 13 : 12; AR('w', 31, 3, 31, by - 1); A(31, by, 'r'); if (t % 4 < 2) A(30, 14, 'w') }
      else if (t < 16) { AR('w', 31, 3, 31, 14); A(31, 15, 'r'); AE('w', [[30, 14], [32, 14], [30, 13], [33, 13]]); clearEyes(s); pts('w', [[4, 7], [9, 7]]); pts('k', [[5, 7], [4, 8], [5, 8], [10, 7], [9, 8], [10, 8]]) }
      else if (t < 24) {
        const p = t - 16
        const ly = [14, 12, 10, 8, 6, 5, 5, 5][p] ?? 5
        AR('w', 31, 3, 31, ly); fish(30, ly + 1); if (p < 4) AE('L', [[33, ly + 3], [29, ly + 3], [31, ly + 4]])
      }
      else { AR('w', 31, 3, 31, 5); fish(30, 6); clearEyes(s); happyEyes(pts); cheeks(pts); AE('y', t % 2 ? [[34, 5], [28, 7]] : [[33, 8], [29, 4]]) }
    },
  },
  {
    name: 'Sailor',
    scene: (s, pts, g, t, A, AR, AE, body) => {
      body(8 + (t >= 16 && t < 24 ? 0 : SW(t)))
      AR('b', 30, 1, 31, 13); AR('B', 28, 0, 33, 0); AR('w', 32, 1, 44, 8)
      const bl = t % 8 < 4
      AR('w', 45, 2, 45, bl ? 7 : 5); if (bl) A(46, 4, 'w'); AR('g', 32, 4, 44, 4); AR('r', 27, 1, 29, 1); if (t % 4 < 2) A(26, 1, 'r')
      AR('y', 2, 0, 3, 1); AE('y', t % 4 < 2 ? [[4, 0], [1, 2]] : [[4, 2], [1, 0]])
      AE('b', Array.from({ length: 48 }, (_, x): P => [x, 14])); [3, 9, 27, 33, 39, 45].forEach(x => { if (g[14]?.[x] === 'b') A(x, 14, 'B') })
      AE('B', [[0, 12], [1, 12], [2, 12], [3, 12], [0, 13], [3, 13], [43, 12], [44, 12], [45, 12], [46, 12], [47, 12], [43, 13], [47, 13]])
      for (let x = 0; x < 48; x++) A(x, 15, (x + t) % 6 < 3 ? 'L' : 'm'); if (t % 8 < 2) A((t * 5) % 48, 15, 'w')
      const gx = 47 - (t % 24) * 2
      const gy = t % 4 < 2 ? 0 : 1
      AE('k', [[gx, gy], [gx + 1, gy + 1], [gx + 2, gy]])
      clearSprout(s); BL(s, pts, t, 28); R(s, 'w', 4, 2, 11, 3); R(s, 'n', 3, 4, 12, 4); R(s, 'n', 3, 11, 12, 12); pts('r', [[7, 11], [8, 11], [7, 12]])
      if (t >= 8 && t < 16) pts('o', [[14, 7], [14, 6], [14, 5], [13, 4]])
      else if (t >= 16 && t < 24) { R(s, 'B', 11, 7, 15, 7); s(15, 7, 'L'); s(5, 7, 'o'); if (t % 2) s(15, 6, 'w') }
      else if (t >= 24) { clearEyes(s); happyEyes(pts); pts('o', t % 4 < 2 ? [[14, 6], [14, 5], [15, 4], [15, 3]] : [[14, 6], [14, 5], [14, 4], [14, 3]]) }
    },
  },
  {
    name: 'Bartender',
    scene: (s, pts, g, t, A, AR, AE, body) => {
      body(12)
      AR('b', 0, 13, 47, 13); AR('B', 0, 14, 47, 15)
      AE('B', Array.from({ length: 48 }, (_, x): P => [x, 3])); AE('B', Array.from({ length: 48 }, (_, x): P => [x, 7]))
      const top: readonly (readonly [number, string])[] = [[1, 'G'], [4, 'r'], [7, 'm'], [31, 'y'], [34, 'P'], [37, 'G'], [41, 'r'], [45, 'm']]
      top.forEach(([x, c]) => { AE(c, [[x, 1], [x + 1, 1], [x, 2], [x + 1, 2]]); AE('s', [[x, 0]]) })
      const low: readonly (readonly [number, string])[] = [[2, 'y'], [6, 'n'], [9, 'r'], [32, 'G'], [36, 'm'], [40, 'y'], [44, 'P']]
      low.forEach(([x, c]) => { AE(c, [[x, 5], [x + 1, 5], [x, 6], [x + 1, 6]]); AE('s', [[x, 4]]) })
      AR('h', 40, 11, 41, 12); A(40, 10, 'w'); A(41, 10, 'w'); AR('h', 45, 11, 46, 12); A(45, 10, 'w'); A(46, 10, 'w'); AR('s', 34, 9, 34, 12); A(33, 9, 's'); A(35, 9, 's')
      clearSprout(s); R(s, 'k', 3, 4, 12, 4); pts('k', [[3, 5], [12, 5]]); s(t % 8 < 4 ? 5 : 6, 4, 'S'); clearMouth(s); R(s, 'k', 6, 10, 9, 10); pts('r', [[6, 11], [6, 12], [6, 13], [7, 12], [8, 12], [9, 11], [9, 12], [9, 13]])
      pts('w', [[13, 12], [15, 12], [13, 13], [15, 13], [13, 14], [15, 14], [13, 15], [14, 15], [15, 15]])
      if (t < 12) {
        const so = t % 2 ? -1 : 0
        const sx = t % 4 < 2 ? 0 : -1
        R(s, 's', 14 + sx, 4 + so, 15 + sx, 7 + so); pts('S', [[14 + sx, 3 + so], [15 + sx, 3 + so], [14 + sx, 2 + so]]); s(14 + sx, 8 + so, 'o')
      }
      else if (t < 20) {
        const p = t - 12
        pts('s', [[14, 6], [15, 6], [14, 7], [15, 7]]); pts('S', [[14, 8], [15, 8]]); s(14, 5, 'o')
        if (p < 7) pts('y', [[14, 9], [14, 10], [14, 11]])
        if (p >= 2) s(14, 14, 'y'); if (p >= 4) s(14, 13, 'y'); if (p >= 6) s(14, 12, 'y')
      }
      else {
        R(s, 'y', 14, 12, 14, 14); s(14, 11, 'r'); pts('w', [[15, 11], [15, 10]])
        if (t < 28) { s(10, 7, 'o'); pts('d', [[9, 8], [10, 8], [11, 8]]); if (t % 2) s(15, 9, 'y') }
      }
      if (t >= 28) { const p = t - 28; pts('w', [[p % 2, 13], [p % 2 + 1, 13]]); s(1, 11, 'o') }
    },
  },
  {
    name: 'Farmer',
    scene: (s, pts, g, t, A, AR, AE, body) => {
      body(16); clearSprout(s); BL(s, pts, t, 8); R(s, 'h', 6, 1, 9, 1); R(s, 'h', 5, 2, 10, 2); R(s, 'r', 5, 3, 10, 3); R(s, 'h', 1, 4, 14, 4); R(s, 'm', 4, 12, 11, 12); pts('m', [[4, 11], [11, 11]])
      AR('y', 2, 0, 3, 1); AE('y', t % 4 < 2 ? [[4, 0], [2, 2], [0, 1]] : [[4, 2], [1, 3]])
      const cx = 22 + (t >> 2)
      AE('w', [[cx, 1], [cx + 1, 1], [cx + 2, 1], [cx + 1, 0]])
      AR('G', 0, 15, 47, 15); for (let x = 8; x <= 16; x++) { A(x, 15, 'B'); A(x, 14, x % 2 ? 'B' : 'b') }
      AR('B', 1, 10, 1, 14); AR('B', 5, 10, 5, 14); AE('b', [[0, 11], [2, 11], [3, 11], [4, 11], [6, 11], [0, 13], [2, 13], [3, 13], [4, 13], [6, 13]])
      const peck = t >= 16 && t % 4 < 2
      AR('w', 12, 13, 13, 13); A(14, peck ? 13 : 12, 'w'); A(14, peck ? 12 : 11, 'r'); A(15, peck ? 13 : 12, 'y'); A(12, 14, 'y'); A(13, 14, 'y')
      AR('b', 31, 4, 31, 14); [[30, 1], [30, 2], [32, 1], [32, 2], [30, 3], [31, 3], [32, 3]].forEach(([x, y]) => A(x, y, 's')); A(30, 9, 'o')
      const l = t % 8 < 4 ? 0 : 1
      for (let x = 34; x < 48; x++) { const h = 10 + (x * 7) % 4; AR('G', x, h, x, 14); A(x + l, h - 1, 'h'); A(x + l, h - 2, 'y') }
      if (t >= 8 && t < 16) { const p = t - 8; pts('o', [[14, 5], [14, 6], [14, 7]]); if (p > 1) s(12, 2 + Math.min(p >> 2, 1), 'L') }
      else if (t >= 16 && t < 24) { const p = t - 16; pts('o', [[1, 8], [1, 9]]); AE('h', [[16, 10 + (p % 3)], [14, 9 + ((p + 1) % 4)], [11, 11 + (p % 3)], [9, 12 + (p % 2)]]) }
      else if (t >= 24) {
        const p = t - 24
        A(10, 13, 'G'); if (p > 1) A(10, 12, 'G'); if (p > 3) A(15, 13, 'G'); if (p > 5) A(15, 12, 'y'); if (p > 4) A(9, 13, 'G'); if (p > 6) A(11, 13, 'G')
        clearEyes(s); happyEyes(pts)
      }
    },
  },
  {
    name: 'Wagoner',
    scene: (s, pts, g, t, A, AR, AE, body, IE) => {
      const bump = t >= 16 && t < 24 ? ([0, 1, 0, 0, -1, 0, 0, 1][t - 16] ?? 0) : (t % 4 < 2 ? 0 : 1)
      AR('w', 27, 3 + bump, 44, 3 + bump); AR('w', 26, 4 + bump, 45, 8 + bump); [31, 36, 41].forEach(x => AR('g', x, 3 + bump, x, 8 + bump)); AR('B', 24, 9 + bump, 46, 10 + bump); A(46, 8 + bump, 'B')
      body(12, bump)
      const wx = 42
      const wy = 12 + bump
      const rim: readonly P[] = [[wx - 1, wy - 2], [wx, wy - 2], [wx + 1, wy - 2], [wx - 2, wy - 1], [wx - 2, wy], [wx - 2, wy + 1], [wx + 2, wy - 1], [wx + 2, wy], [wx + 2, wy + 1], [wx - 1, wy + 2], [wx, wy + 2], [wx + 1, wy + 2]]
      rim.forEach(([x, y]) => A(x, y, 'B')); A(wx, wy, 's')
      const spoke: readonly P[] = t % 2 ? [[wx, wy - 1], [wx, wy + 1], [wx - 1, wy], [wx + 1, wy]] : [[wx - 1, wy - 1], [wx + 1, wy - 1], [wx - 1, wy + 1], [wx + 1, wy + 1]]
      spoke.forEach(([x, y]) => A(x, y, 'b'))
      const l = t % 4 < 2
      AR('b', 2, 8, 8, 11); AR('b', 1, 5, 2, 7); AR('b', 0, 5, 1, 6); A(1, 4, 'b'); A(2, 4, 'k'); A(0, 5, 'k'); AR('b', l ? 3 : 4, 12, l ? 3 : 4, 14); AR('b', l ? 7 : 6, 12, l ? 7 : 6, 14); A(9, 9, 'k'); A(9, 10, 'k'); A(10, 11, 'k')
      AE('B', Array.from({ length: 12 }, (_, i): P => [9 + i, 9]))
      const cx = 4 + (t >> 1)
      AE('w', [[cx, 1], [cx + 1, 1], [cx + 2, 1], [cx + 1, 0]])
      AR('g', 0, 15, 47, 15); for (let x = 2; x < 48; x += 7) A(x, 15, 'S')
      clearSprout(s); BL(s, pts, t, 16)
      const hy = t >= 24 && t < 28 ? -1 : 0
      R(s, 'B', 5, 2 + hy, 10, 3 + hy); R(s, 'b', 5, 3 + hy, 10, 3 + hy); R(s, 'B', 2, 4 + hy, 13, 4 + hy); if (hy) pts('o', [[13, 5], [12, 5]])
      R(s, '.', 12, 11, 14, 13); pts('B', [[12, 10], [13, 10], [14, 10], [11, 11], [11, 12], [11, 13], [15, 11], [15, 12], [15, 13], [12, 14], [13, 14], [14, 14]]); s(13, 12, 's'); pts('b', t % 2 ? [[13, 11], [13, 13], [12, 12], [14, 12]] : [[12, 11], [14, 11], [12, 13], [14, 13]]); IE('g', [t % 4 < 2 ? [15, 14] : [15, 15], t % 4 < 2 ? [14, 15] : [12, 15]])
      pts('b', [[1, 12], [1, 11], [1, 10], [1, 9], [0, 8]])
      if (t < 8) pts('k', t % 4 < 2 ? [[0, 7], [0, 6], [1, 5], [1, 4]] : [[0, 7], [0, 6], [0, 5], [0, 4]])
      else if (t < 12) { pts('k', [[0, 7], [0, 6], [1, 5], [2, 4], [3, 3], [4, 2], [5, 1], [6, 0]]); if (t > 8 && t < 11) pts('w', [[7, 0], [8, 0], [7, 1]]) }
      else if (t < 16) pts('k', [[0, 7], [0, 6], [1, 5], [1, 4], [2, 3]])
      else pts('k', [[0, 7], [0, 6], [1, 5], [1, 4]])
      for (let x = 0; x < 48; x++) { const h = 9 + Math.round(2 * Math.sin(x / 5)); for (let y = h; y < 15; y++) AE('G', [[x, y]]) }
    },
  },
]

type Geom = { W: number; H: number; rows: number; s: number }

// The scene is as tall as its sprites, never taller: a band of blank rows above
// the pixels reads as a broken pane, so the share is a ceiling, not a target.
function layout(columns: number, room: number): Geom {
  const s = Math.max(1, Math.min(3, Math.floor((room * 2) / SPRITE_H), Math.floor(columns / SPRITE_W)))

  return { W: SPRITE_W * s, H: SPRITE_H * s, rows: (SPRITE_H * s) / 2, s }
}

function fill(px: Uint32Array, g: Geom, x: number, y: number, w: number, h: number, colour: number): void {
  for (let r = Math.max(0, y); r < Math.min(g.H, y + h); r++) {
    for (let c = Math.max(0, x); c < Math.min(g.W, x + w); c++) px[r * g.W + c] = colour
  }
}

function encode(px: Uint32Array, g: Geom): string {
  const words = new Uint32Array(g.W * g.rows * 3)
  let i = 0
  for (let r = 0; r < g.rows; r++) {
    const top = 2 * r * g.W
    for (let c = 0; c < g.W; c++) {
      const over = px[top + c] ?? CLEAR
      const under = px[top + g.W + c] ?? CLEAR
      // CLEAR in a foreground slot is the terminal's text colour, not nothing: an
      // untouched cell has to be a blank, and a lone bottom pixel a LOWER block.
      if (over === CLEAR && under === CLEAR) {
        words[i++] = BLANK
        words[i++] = CLEAR
        words[i++] = CLEAR
      } else if (over === CLEAR) {
        words[i++] = LOWER
        words[i++] = under
        words[i++] = CLEAR
      } else {
        words[i++] = UPPER
        words[i++] = over
        words[i++] = under
      }
    }
  }

  const bytes = new Uint8Array(words.buffer)
  let latin = ''
  for (let o = 0; o < bytes.length; o += 8192) latin += String.fromCharCode(...bytes.subarray(o, o + 8192))

  return btoa(latin)
}

function paint(g: Geom, cells: Grid): string {
  const px = new Uint32Array(g.W * g.H).fill(CLEAR)
  for (let r = 0; r < SPRITE_H; r++) {
    const row = cells[r]
    if (row === undefined) continue
    for (let c = 0; c < SPRITE_W; c++) {
      const colour = PAL[row[c] ?? '.']
      if (colour === undefined) continue
      fill(px, g, c * g.s, r * g.s, g.s, g.s, colour)
    }
  }

  return encode(px, g)
}

// A class is drawn once and kept: thirty-two frames of a scene cost more to
// build than to hold, and the same class comes up again.
const reel = new Map<string, Grid[]>()

export function framesOf(m: Mascot): Grid[] {
  const had = reel.get(m.name)
  if (had !== undefined) return had
  const made = loop(m.scene)
  reel.set(m.name, made)

  return made
}

export const register: Register = on => {
  let view: { geom: Geom; requestId: string } | null = null
  let timer: Timer | null = null
  let pick: Mascot = MASCOTS[0]
  let shown = false
  let held = false
  let t = 0

  const stop = () => {
    timer?.cancel()
    timer = null
    view = null
    shown = false
    held = false
    t = 0
  }

  const cells = (geom: Geom): string => paint(geom, framesOf(pick)[t] ?? [])

  // The title of a band that is not up yet, on a class drawn at random, and
  // null while one is up: a prompt queued over a running turn must not swap
  // the class under it.
  const claim = (): string | null => {
    if (shown) return null
    pick = MASCOTS[Math.floor(Math.random() * MASCOTS.length)] ?? MASCOTS[0]
    shown = true
    t = 0

    return `Sprout's Guild · ${pick.name}`
  }

  // Opened under the person's own prompt, so the surface seats it at any width;
  // opened unasked it would wait for a 110-column terminal.
  on('prompt.submit', async ($, e, next) => {
    const title = claim()
    if (title !== null) await $.ui.open({ id: PANE, title, rows: SCENE_ROWS })

    return next(e)
  })

  // A prompt typed over a running turn is queued, and the turn it then starts
  // raises no second `prompt.submit`: without this the band misses that turn.
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      const title = claim()
      if (title !== null) await $.ui.open({ id: PANE, title, rows: SCENE_ROWS })
    }

    return next(e)
  })

  // An answered turn is closed by `classic.Stop` below, which alone sees what
  // is still in flight; an interrupt or a refusal may raise no `Stop` at all.
  // shortcut: a turn that dies on an API error drops the band with work still
  // running, because `StopFailure` carries no `background_tasks`; revisit if
  // the stub ever adds one.
  on('turn.complete', async ($, e, next) => {
    const ended = await next(e)
    if (e.agentId === undefined && e.reason !== 'answer') {
      stop()
      await $.ui.close({ id: PANE })
    }

    return ended
  })

  // Holding the band while background work runs is the whole point: the turn's
  // own end closed it over live shells, subagents and workflows.
  // shortcut: one `Stop` of grace, so work the engine never clears — a parked
  // dev server, an MCP monitor — costs one turn and not the session; bound it
  // on the work itself if the stub ever carries `background_tasks` off `Stop`.
  on('classic.Stop', async ($, e, next) => {
    const ended = await next(e)
    if (e.agent_id === undefined) {
      if (held || (e.background_tasks?.length ?? 0) === 0) {
        stop()
        await $.ui.close({ id: PANE })
      } else held = true
    }

    return ended
  })

  on('ui.close', ($, e, next) => {
    if (e.id === PANE) stop()

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, ($, e) => {
    // Dropping the view idles the timer: left set, it would paint and blit at
    // the frame rate into a Raster the surface no longer holds.
    if (e.surface !== 'terminal') {
      const { Text } = $.ui.resolve(e)
      view = null

      return <Text dimColor>The scene needs a terminal.</Text>
    }

    const { Text, Raster } = $.ui.resolve(e)
    const room = Math.min(e.props.scroll.bodyRows, 128)
    if (room < SCENE_ROWS || e.props.bodyColumns < SPRITE_W) {
      view = null

      return <Text dimColor>Too small for the scene.</Text>
    }

    const geom = layout(e.props.bodyColumns, room)
    view = { geom, requestId: e.requestId }
    timer ??= $.clock.every(FRAME_MS, () => {
      if (view === null) return
      t = (t + 1) % FRAMES
      void $.ui.blit({
        requestId: view.requestId,
        key: KEY,
        columns: view.geom.W,
        rows: view.geom.rows,
        cells: cells(view.geom),
      })
    })

    return <Raster key={KEY} columns={geom.W} rows={geom.rows} cells={cells(geom)} />
  })
}

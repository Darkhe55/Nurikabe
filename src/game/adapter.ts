/**
 * ════════════════════════════════════════════════════════════════════
 *  数墙（Nurikabe）—— 游戏适配器
 * ════════════════════════════════════════════════════════════════════
 *
 * 规则：
 *   1. 数字格是白色，其所在白格连通块（岛屿）恰好有「数字」个格子；
 *   2. 每座岛屿有且仅有一个数字；
 *   3. 所有黑格（水）必须上下左右连通成一片；
 *   4. 任意 2×2 区域不能全黑。
 *
 * 状态用 0/1/2：0 = 未定，1 = 黑（水），2 = 白（岛）。
 */

import { playDrop, playPluck } from '../core/audio'
import type {
  CustomSupport,
  GameAdapter,
  Move,
  Puzzle,
  SolveResult,
} from '../core/types'
import { planLogicSolve } from './logic'
import { builtinPuzzles, getReferenceSolution } from './puzzles'
import { hitTest, metricsFor, renderBoard } from './render'
import { solvePuzzle } from './solver'
import {
  applyMove,
  cloneState,
  createEmptyState,
  cycleValue,
  deserializeState,
  firstHintMove,
  invertMove,
  rightClickValue,
  serializeState,
  valueAt,
} from './state'
import { statusBits, validate } from './validate'
import {
  BLACK,
  decodeClues,
  EMPTY,
  encodeClues,
  OUTSIDE,
  type WallPuzzle,
} from './types'

const meta = {
  title: '数墙',
  tagline: '把水连成一片，让每座岛恰好住进一个数字 —— 经典 Nurikabe',
  footerNote:
    '规则：数字格是白色，其所在白格岛屿恰好有「数字」个格子；每座岛屿有且仅有一个数字；所有黑格（水）必须上下左右连通成一片；任意 2×2 区域不能全黑。',
  storageKeyPrefix: 'nurikabe',
  customIdPrefix: 'nurikabe-custom-',
  customMinW: 5,
  customMinH: 5,
  customMaxW: 30,
  customMaxH: 30,
}

const VALUE_CYCLE: Array<number | null> = [null, OUTSIDE, 1, 2, 3, 4, 5, 6, 7, 8, 9]

function readClues(value: unknown, size: number): number[] | null {
  if (typeof value === 'string') return decodeClues(value, size)
  if (Array.isArray(value)) {
    if (value.length !== size) return null
    const out: number[] = []
    for (const v of value) {
      const n = Number(v)
      if (!Number.isInteger(n) || n < -1 || n > 35) return null
      out.push(n)
    }
    return out
  }
  return null
}

const custom: CustomSupport = {
  valueCycle: VALUE_CYCLE,

  keyForDigit: (digit) => {
    if (digit === 0) return OUTSIDE
    if (digit >= 1 && digit <= 9) return digit
    return undefined
  },

  cellLabel: (v) => (v === OUTSIDE ? '外' : v == null ? '' : String(v)),

  cellClass: (v) => (v === OUTSIDE ? 'v-outside' : v == null ? '' : `r${v}`),

  hint:
    '点击格子循环：空 → 外 → 1…9；数字键 1–9 填数字，0 标外部区域，. / 退格清空。外部区域表示不在题板内，游戏中锁定、不能填写。载入后可用「求解」检查是否恰好一解。',

  toGrid: (p) => {
    const clues = (p as WallPuzzle).clues
    if (!Array.isArray(clues) || clues.length !== p.width * p.height) return null
    return {
      width: p.width,
      height: p.height,
      grid: clues.map((v) => (v === OUTSIDE ? OUTSIDE : typeof v === 'number' && v >= 1 ? v : null)),
    }
  },

  makePuzzle: (w, h, grid, existingId) => {
    const clues = grid.map((v) =>
      v === OUTSIDE ? OUTSIDE : typeof v === 'number' && v >= 1 && v <= 35 ? v : 0,
    )
    return {
      id: existingId ?? `${meta.customIdPrefix}${w}x${h}-${Date.now()}`,
      name: `自定义 · ${w}×${h}`,
      width: w,
      height: h,
      difficulty: 'custom',
      clues,
    } satisfies WallPuzzle
  },

  encodePuzzle: (p) => ({
    clues: encodeClues((p as WallPuzzle).clues ?? []),
  }),

  decodePuzzle: (record) => {
    if (typeof record.id !== 'string') return null
    if (typeof record.width !== 'number' || typeof record.height !== 'number') return null
    const w = record.width
    const h = record.height
    if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) return null
    const clues = readClues(record.clues, w * h)
    if (!clues) return null
    return {
      id: record.id,
      name: typeof record.name === 'string' ? record.name : `自定义 · ${w}×${h}`,
      width: w,
      height: h,
      difficulty: 'custom',
      clues,
    } satisfies WallPuzzle
  },
}

function playForMove(move: Move, streak: number): void {
  if (move.from === EMPTY) {
    // 水略低、陆地略高，落子像拨动琴弦
    playPluck(streak, move.to === BLACK ? 0.9 : 1.1)
  } else {
    playDrop(streak)
  }
}

export const adapter: GameAdapter = {
  meta,
  builtinPuzzles,
  getReferenceSolution,
  createEmptyState,
  cloneState,
  cycleValue,
  rightClickValue,
  applyMove,
  invertMove,
  valueAt,
  serializeState,
  deserializeState,
  validate,
  statusBits,
  metricsFor,
  renderBoard,
  hitTest,
  planLogicSolve,
  solvePuzzle: (puzzle: Puzzle, maxNodes?: number): SolveResult => solvePuzzle(puzzle, maxNodes),
  firstHintMove,
  custom,
  playForMove,
}

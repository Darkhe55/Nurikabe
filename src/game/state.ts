/**
 * 数墙 —— 棋盘状态
 *
 * 0 = 未定，1 = 黑格（水），2 = 白格（岛）。
 * 数字格是题面给定，永远锁定为白。
 */

import type { GameState, HitTarget, Move, Puzzle } from '../core/types'
import {
  asWallPuzzle,
  asWallState,
  BLACK,
  decodeCells,
  EMPTY,
  encodeCells,
  OUTSIDE,
  WHITE,
  type WallState,
} from './types'

export function createEmptyState(puzzle: Puzzle): WallState {
  const p = asWallPuzzle(puzzle)
  const size = p.width * p.height
  const givens = new Array<number>(size).fill(EMPTY)
  for (let i = 0; i < size; i++) {
    const v = p.clues?.[i] ?? 0
    if (v === OUTSIDE) givens[i] = OUTSIDE
    else if (v > 0) givens[i] = WHITE
  }
  return {
    puzzleId: p.id,
    width: p.width,
    height: p.height,
    cells: givens.slice(),
    givens,
  }
}

export function cloneState(state: GameState): WallState {
  const s = asWallState(state)
  return {
    puzzleId: s.puzzleId,
    width: s.width,
    height: s.height,
    cells: s.cells.slice(),
    givens: s.givens.slice(),
  }
}

export function cycleValue(state: GameState, target: HitTarget): number {
  const s = asWallState(state)
  const given = s.givens[target.index] ?? EMPTY
  if (given !== EMPTY) return given
  const v = s.cells[target.index] ?? EMPTY
  // 左键：空/负面(白) → 正面(黑)；正面 → 空
  if (v === EMPTY || v === WHITE) return BLACK
  return EMPTY
}

export function rightClickValue(state: GameState, target: HitTarget): number {
  const s = asWallState(state)
  const given = s.givens[target.index] ?? EMPTY
  if (given !== EMPTY) return given
  // 右键把格子直接标成水；已经是水则清除
  return s.cells[target.index] === WHITE ? EMPTY : WHITE
}

export function applyMove(state: GameState, move: Move): void {
  const s = asWallState(state)
  if (move.index < 0 || move.index >= s.cells.length) return
  if ((s.givens[move.index] ?? EMPTY) !== EMPTY) return
  s.cells[move.index] =
    move.to === BLACK || move.to === WHITE ? move.to : EMPTY
}

export function invertMove(move: Move): Move {
  return { index: move.index, from: move.to, to: move.from }
}

export function valueAt(state: GameState, index: number): number {
  return asWallState(state).cells[index] ?? EMPTY
}

export function serializeState(state: GameState): Record<string, unknown> {
  const s = asWallState(state)
  return {
    version: 1,
    puzzleId: s.puzzleId,
    width: s.width,
    height: s.height,
    cells: encodeCells(s.cells),
    givens: encodeCells(s.givens),
  }
}

function readCells(value: unknown, size: number): number[] | null {
  if (typeof value === 'string') return decodeCells(value, size)
  if (Array.isArray(value)) {
    if (value.length !== size) return null
    const out: number[] = []
    for (const v of value) {
      const n = Number(v)
      if (n !== EMPTY && n !== BLACK && n !== WHITE && n !== OUTSIDE) return null
      out.push(n)
    }
    return out
  }
  return null
}

export function deserializeState(data: Record<string, unknown>): WallState | null {
  if (typeof data.puzzleId !== 'string') return null
  if (typeof data.width !== 'number' || typeof data.height !== 'number') return null
  const w = data.width
  const h = data.height
  if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) return null
  const size = w * h

  const cells = readCells(data.cells, size)
  if (!cells) return null
  const givens = readCells(data.givens, size) ?? new Array<number>(size).fill(EMPTY)

  // 题面给定格永远以存档中的锁定值为准
  for (let i = 0; i < size; i++) {
    if (givens[i] !== EMPTY) cells[i] = givens[i]!
  }

  return { puzzleId: data.puzzleId, width: w, height: h, cells, givens }
}

export function firstHintMove(state: GameState, solution: GameState): Move | null {
  const s = asWallState(state)
  const sol = asWallState(solution)
  const size = Math.min(s.cells.length, sol.cells.length)
  for (let i = 0; i < size; i++) {
    if (s.givens[i] !== EMPTY) continue
    if (s.cells[i] === EMPTY && sol.cells[i] !== EMPTY) {
      return { index: i, from: EMPTY, to: sol.cells[i]! }
    }
  }
  for (let i = 0; i < size; i++) {
    if (s.givens[i] !== EMPTY) continue
    if (s.cells[i] !== sol.cells[i]) {
      return { index: i, from: s.cells[i]!, to: sol.cells[i]! }
    }
  }
  return null
}

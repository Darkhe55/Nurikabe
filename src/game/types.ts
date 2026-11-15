/**
 * 数墙（Nurikabe）—— 游戏专用类型
 *
 * 约定与模板核心一致：
 *   0 = 未定（空格）
 *   1 = 黑格（水）
 *   2 = 白格（岛）
 *  -1 = 外部区域（不在题板内，游戏中锁定、不能填写）
 *
 * 题面由 clues 给出：0 表示没有数字，正整数表示该岛屿的格数，
 * -1 表示该格是外部区域（自定义题板可画边界）。
 */

import type { GameState, Puzzle, ValidationResult } from '../core/types'

export const OUTSIDE = -1
export const EMPTY = 0
export const BLACK = 1
export const WHITE = 2

export type CellValue = -1 | 0 | 1 | 2

export interface IslandIssue {
  clueIndex: number
  cells: number[]
  size: number
  limit: number
  kind: 'over' | 'under' | 'merged' | 'missing' | 'sealed'
}

/** 题面：在模板 Puzzle 上增加 clues（每格 0 或岛屿大小） */
export interface WallPuzzle extends Puzzle {
  clues: number[]
  /** 参考解（1 = 黑，2 = 白；仅内置题携带） */
  solution?: number[]
}

/** 棋盘状态：cells 当前盘面，givens 锁定的数字格（白） */
export interface WallState extends GameState {
  cells: number[]
  givens: number[]
}

export interface WallResult extends ValidationResult {
  /** 仍为空的格数 */
  empty: number
  /** 2×2 全黑数量 */
  blockCount: number
  /** 2×2 全黑涉及的格 */
  blockCells: number[]
  /** 黑格连通块数量（完整盘面应 ≤ 1） */
  blackParts: number
  /** 白格连通块数量 */
  whiteParts: number
  /** 被永久隔断、无法再连通的格 */
  trapped: number[]
  /** 岛屿问题明细 */
  islandIssues: IslandIssue[]
  /** 需要高亮的错误格 */
  badCells: number[]
  /** 与题面给定不一致的格 */
  changedGivens: number[]
  /** 数字格总数 */
  clueCount: number
  /** 盘面是否已填满 */
  complete: boolean
}

export function asWallPuzzle(p: Puzzle): WallPuzzle {
  return p as WallPuzzle
}

export function asWallState(s: GameState): WallState {
  return s as WallState
}

const BASE36 = '0123456789abcdefghijklmnopqrstuvwxyz'

/** 编码数字线索：每格一个 base36 字符，0 = 无数字，x = 外部区域 */
export function encodeClues(clues: ArrayLike<number>): string {
  let out = ''
  for (let i = 0; i < clues.length; i++) {
    const v = clues[i]! | 0
    if (v === OUTSIDE) out += 'x'
    else if (v <= 0) out += '0'
    else if (v < BASE36.length) out += BASE36[v]!
    else out += 'z'
  }
  return out
}

/** 解码数字线索；长度不符或含非法字符返回 null */
export function decodeClues(text: string, expected: number): number[] | null {
  if (typeof text !== 'string' || text.length !== expected) return null
  const out = new Array<number>(expected).fill(0)
  for (let i = 0; i < expected; i++) {
    const ch = text[i]!.toLowerCase()
    if (ch === '.' || ch === '-' || ch === '?') {
      out[i] = 0
      continue
    }
    if (ch === 'x') {
      out[i] = OUTSIDE
      continue
    }
    const v = BASE36.indexOf(ch)
    if (v < 0) return null
    out[i] = v
  }
  return out
}

export function clueCountOf(clues: ArrayLike<number>): number {
  let count = 0
  for (let i = 0; i < clues.length; i++) if (clues[i]! > 0) count++
  return count
}

/** 编码盘面：0/1/2 数字串，x = 外部区域 */
export function encodeCells(cells: ArrayLike<number>): string {
  let out = ''
  for (let i = 0; i < cells.length; i++) {
    const v = cells[i]! | 0
    out += v === OUTSIDE ? 'x' : String(v)
  }
  return out
}

/** 解码盘面：接受 0/1/2/x；. 空，B/# 黑，W/o 白，X 外部 */
export function decodeCells(text: string, expected: number): number[] | null {
  if (typeof text !== 'string' || text.length !== expected) return null
  const out = new Array<number>(expected)
  for (let i = 0; i < expected; i++) {
    const ch = text[i]!
    if (ch === 'x' || ch === 'X') out[i] = OUTSIDE
    else if (ch === '0' || ch === '.') out[i] = EMPTY
    else if (ch === '1' || ch === 'B' || ch === 'b' || ch === '#') out[i] = BLACK
    else if (ch === '2' || ch === 'W' || ch === 'w' || ch === 'o' || ch === 'O') out[i] = WHITE
    else return null
  }
  return out
}

/** 数字格在盘面上的锁定值：白；外部区域锁定为 OUTSIDE */
export function givensFromClues(clues: ArrayLike<number>, size: number): number[] {
  const givens = new Array<number>(size).fill(EMPTY)
  for (let i = 0; i < size; i++) {
    const v = clues[i] ?? 0
    if (v === OUTSIDE) givens[i] = OUTSIDE
    else if (v > 0) givens[i] = WHITE
  }
  return givens
}

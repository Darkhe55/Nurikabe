/**
 * 数墙题库生成器
 *
 * 思路：
 *   1. 先铺一张「水网」终盘：偶数行/列全黑，其余为孤立的 1 格白岛；
 *   2. 随机把水格翻成陆地，合并出大小不一的岛屿（保持黑格连通）；
 *   3. 每座白岛选一格写数字 = 岛屿大小；
 *   4. 用候选域 + 规则传播 + 回溯统计解数，只保留恰好一解；
 *   5. 优先保留「传播 + 反证」即可推满的题面。
 *
 * 该文件被 scripts/gen-config.mjs 直接 import（Node 24 支持 type stripping）。
 */

import type { Difficulty } from '../core/types'
import { BLACK, encodeCells, encodeClues, WHITE } from './types.ts'
import { componentsOf, isValidSolution, solveByRules } from './rules.ts'
import { countSolutions } from './solver.ts'

export interface RawPuzzleOut {
  id: string
  name: string
  width: number
  height: number
  difficulty: Difficulty
  series: string
  board: string
  solution: string
}

interface GenSpec {
  w: number
  h: number
  merges: number
  maxIsland: number
  seed: number
  difficulty: Difficulty
  name: string
  series: string
  attempts: number
  clueTries: number
  maxNodes: number
  requireLogic: boolean
}

function mulberry32(a: number): () => number {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pickWeighted(list: number[], rng: () => number): number {
  let total = 0
  for (const v of list) total += v
  let r = rng() * total
  for (let i = 0; i < list.length; i++) {
    r -= list[i]!
    if (r <= 0) return i
  }
  return list.length - 1
}

function has2x2Black(cells: ArrayLike<number>, w: number, h: number): boolean {
  for (let y = 0; y + 1 < h; y++) {
    const row = y * w
    for (let x = 0; x + 1 < w; x++) {
      const a = row + x
      if (
        cells[a] === BLACK &&
        cells[a + 1] === BLACK &&
        cells[a + w] === BLACK &&
        cells[a + w + 1] === BLACK
      ) {
        return true
      }
    }
  }
  return false
}

function blackConnected(cells: ArrayLike<number>, w: number, h: number): boolean {
  return componentsOf(cells, w, h, BLACK).length <= 1
}

/** 水网终盘：偶数行/列是水，其余是互不相连的 1 格白岛 */
function lattice(w: number, h: number): number[] {
  const cells = new Array<number>(w * h).fill(WHITE)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x % 2 === 0 || y % 2 === 0) cells[y * w + x] = BLACK
    }
  }
  return cells
}

/** 随机把水格翻成陆地，制造更大的岛屿；保持黑格连通 */
function growIslands(
  cells: number[],
  w: number,
  h: number,
  merges: number,
  maxIsland: number,
  rng: () => number,
): number {
  const n = w * h
  let done = 0
  const maxTries = merges * 90 + 200

  for (let tries = 0; tries < maxTries && done < merges; tries++) {
    const candidates: number[] = []
    const weights: number[] = []
    for (let i = 0; i < n; i++) {
      if (cells[i] !== BLACK) continue
      const x = i % w
      const y = (i / w) | 0
      let whiteNeighbors = 0
      if (x > 0 && cells[i - 1] === WHITE) whiteNeighbors++
      if (x + 1 < w && cells[i + 1] === WHITE) whiteNeighbors++
      if (y > 0 && cells[i - w] === WHITE) whiteNeighbors++
      if (y + 1 < h && cells[i + w] === WHITE) whiteNeighbors++
      if (whiteNeighbors === 0) continue
      candidates.push(i)
      // 连接越多白岛越优先，避免只贴着同一座岛长
      weights.push(whiteNeighbors * whiteNeighbors)
    }
    if (!candidates.length) break

    const i = candidates[pickWeighted(weights, rng)]!
    cells[i] = WHITE
    if (blackConnected(cells, w, h) && !has2x2Black(cells, w, h)) {
      const compSize = whiteComponents(cells, w, h).find((comp) => comp.includes(i))?.length ?? 0
      if (compSize <= maxIsland) {
        done++
        continue
      }
    }
    cells[i] = BLACK
  }
  return done
}

function whiteComponents(cells: ArrayLike<number>, w: number, h: number): number[][] {
  return componentsOf(cells, w, h, WHITE)
}

/** 在岛屿里挑数字格：优先选「叶尖」格，通常更能锁定岛屿形状 */
function pickClueCell(
  comp: number[],
  cells: ArrayLike<number>,
  w: number,
  h: number,
  rng: () => number,
): number {
  let best = 0
  const picks: number[] = []
  for (const i of comp) {
    const x = i % w
    const y = (i / w) | 0
    let degree = 0
    if (x > 0 && cells[i - 1] === WHITE) degree++
    if (x + 1 < w && cells[i + 1] === WHITE) degree++
    if (y > 0 && cells[i - w] === WHITE) degree++
    if (y + 1 < h && cells[i + w] === WHITE) degree++
    if (picks.length === 0 || degree < best) {
      best = degree
      picks.length = 0
      picks.push(i)
    } else if (degree === best) {
      picks.push(i)
    }
  }
  return picks[Math.floor(rng() * picks.length)] ?? comp[0]!
}

function deriveClues(
  comps: number[][],
  cells: ArrayLike<number>,
  w: number,
  h: number,
  rng: () => number,
): number[] {
  const clues = new Array<number>(w * h).fill(0)
  for (const comp of comps) {
    const cell = pickClueCell(comp, cells, w, h, rng)
    clues[cell] = comp.length
  }
  return clues
}

interface AttemptStats {
  growthFail: number
  tooBig: number
  notUnique: number
  timeout: number
  logicFail: number
  invalid: number
}

function attemptPuzzle(
  spec: GenSpec,
  rng: () => number,
  stats: AttemptStats,
): { clues: number[]; solution: number[] } | null {
  const { w, h } = spec
  const size = w * h
  const cells = lattice(w, h)
  // 每次尝试在目标附近随机取合并数，避免固定终盘结构导致的死路
  const merges = Math.max(0, spec.merges - 2) + Math.floor(rng() * 5)
  const grown = growIslands(cells, w, h, merges, spec.maxIsland, rng)
  if (grown === 0 && spec.merges > 0) {
    stats.growthFail++
    return null
  }

  const comps = whiteComponents(cells, w, h)
  for (const comp of comps) {
    if (comp.length > 35) {
      stats.tooBig++
      return null
    }
  }
  for (let k = 0; k < spec.clueTries; k++) {
    const clues = deriveClues(comps, cells, w, h, rng)
    const counted = countSolutions(clues, size, w, h, 2, spec.maxNodes)
    if (counted.timedOut) {
      // 这一终盘太难判定，直接换一个，避免在多个线索位置重复超时
      stats.timeout++
      break
    }
    if (counted.count !== 1) {
      stats.notUnique++
      continue
    }
    if (!isValidSolution(cells, clues, w, h)) {
      stats.invalid++
      continue
    }
    if (spec.requireLogic) {
      const rules = solveByRules(clues, size, w, h, true, 240)
      if (!rules.ok || !rules.saturated) {
        stats.logicFail++
        continue
      }
    }
    return { clues, solution: cells }
  }

  return null
}

const SPECS: GenSpec[] = [
  {
    w: 6,
    h: 6,
    merges: 2,
    maxIsland: 4,
    seed: 0x4e555201,
    difficulty: 'easy',
    name: '水岸初识',
    series: '入门',
    attempts: 120,
    clueTries: 60,
    maxNodes: 120_000,
    requireLogic: true,
  },
  {
    w: 7,
    h: 7,
    merges: 3,
    maxIsland: 5,
    seed: 0x4e555202,
    difficulty: 'easy',
    name: '礁石浅滩',
    series: '入门',
    attempts: 160,
    clueTries: 80,
    maxNodes: 160_000,
    requireLogic: true,
  },
  {
    w: 8,
    h: 8,
    merges: 4,
    maxIsland: 5,
    seed: 0x4e555203,
    difficulty: 'medium',
    name: '群岛回廊',
    series: '进阶',
    attempts: 200,
    clueTries: 100,
    maxNodes: 120_000,
    requireLogic: false,
  },
  {
    w: 9,
    h: 9,
    merges: 4,
    maxIsland: 5,
    seed: 0x4e555204,
    difficulty: 'medium',
    name: '潮汐迷宫',
    series: '进阶',
    attempts: 240,
    clueTries: 120,
    maxNodes: 150_000,
    requireLogic: false,
  },
  {
    w: 10,
    h: 10,
    merges: 5,
    maxIsland: 6,
    seed: 0x4e555205,
    difficulty: 'hard',
    name: '深海断层',
    series: '挑战',
    attempts: 280,
    clueTries: 140,
    maxNodes: 200_000,
    requireLogic: false,
  },
  {
    w: 10,
    h: 10,
    merges: 6,
    maxIsland: 6,
    seed: 0x4e555206,
    difficulty: 'hard',
    name: '万岛之海',
    series: '挑战',
    attempts: 320,
    clueTries: 160,
    maxNodes: 200_000,
    requireLogic: false,
  },
]

export function generatePuzzles(): RawPuzzleOut[] {
  const out: RawPuzzleOut[] = []
  for (const spec of SPECS) {
    const rng = mulberry32(spec.seed)
    const stats: AttemptStats = {
      growthFail: 0,
      tooBig: 0,
      notUnique: 0,
      timeout: 0,
      logicFail: 0,
      invalid: 0,
    }
    let made: { clues: number[]; solution: number[] } | null = null
    const t0 = Date.now()
    for (let attempt = 0; attempt < spec.attempts; attempt++) {
      made = attemptPuzzle(spec, rng, stats)
      if (made) break
    }
    if (!made) {
      console.error(`[数墙 gen] ${spec.name} 失败统计：`, stats)
      throw new Error(`[数墙 gen] ${spec.name} 在 ${spec.attempts} 次尝试内没有生成合法题`)
    }
    const clues = made.clues.filter((v) => v > 0).length
    const white = made.solution.filter((v) => v === WHITE).length
    console.log(
      `[数墙 gen] ${spec.name} ${spec.w}×${spec.h}：${clues} 个数字，白格 ${white}，${Date.now() - t0}ms`,
    )
    out.push({
      id: `nurikabe-${spec.w}x${spec.h}-${spec.seed.toString(36)}`,
      name: spec.name,
      width: spec.w,
      height: spec.h,
      difficulty: spec.difficulty,
      series: spec.series,
      board: encodeClues(made.clues),
      solution: encodeCells(made.solution),
    })
  }
  return out
}

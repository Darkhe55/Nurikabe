/**
 * 数墙（Nurikabe）—— 规则引擎
 *
 * 规则：
 *   R1 数字格是白色，且它所在的白格连通块（岛屿）恰好有「数字」个格子；
 *   R2 每块白格岛屿有且仅有一个数字；
 *   R3 所有黑格必须上下左右连通成一片；
 *   R4 任意 2×2 区域不能全黑。
 *
 * 本文件只做「必然结论」传播，不做猜测。
 * 传播到的每个结论都可安全用于唯一解证明、逻辑回放与提示。
 */

import { BLACK, EMPTY, OUTSIDE, WHITE } from './types.ts'

export type RuleKind = 'block' | 'island' | 'reach' | 'separate'

export type SetCallback = (index: number, value: number, rule: RuleKind) => void

const DX = [1, -1, 0, 0]
const DY = [0, 0, 1, -1]

export function neighborsOf(index: number, w: number, h: number): number[] {
  const x = index % w
  const y = (index / w) | 0
  const out: number[] = []
  if (x > 0) out.push(index - 1)
  if (x + 1 < w) out.push(index + 1)
  if (y > 0) out.push(index - w)
  if (y + 1 < h) out.push(index + w)
  return out
}

/** 某色的全部连通块 */
export function componentsOf(
  cells: ArrayLike<number>,
  w: number,
  h: number,
  color: number,
): number[][] {
  const n = w * h
  const seen = new Uint8Array(n)
  const out: number[][] = []
  for (let start = 0; start < n; start++) {
    if (cells[start] !== color || seen[start]) continue
    const comp: number[] = []
    const stack = [start]
    seen[start] = 1
    while (stack.length) {
      const i = stack.pop()!
      comp.push(i)
      const x = i % w
      const y = (i / w) | 0
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d]!
        const ny = y + DY[d]!
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const j = ny * w + nx
        if (!seen[j] && cells[j] === color) {
          seen[j] = 1
          stack.push(j)
        }
      }
    }
    out.push(comp)
  }
  return out
}

export function hasEmptyNeighbor(
  cells: ArrayLike<number>,
  w: number,
  h: number,
  index: number,
): boolean {
  return neighborsOf(index, w, h).some((j) => cells[j] === EMPTY)
}

/** 用题面初始化盘面：数字格为白、外部区域为 OUTSIDE，其余为空 */
export function initialGrid(clues: ArrayLike<number>, size: number): number[] {
  const grid = new Array<number>(size).fill(EMPTY)
  for (let i = 0; i < size; i++) {
    const v = clues[i] ?? 0
    if (v === OUTSIDE) grid[i] = OUTSIDE
    else if (v > 0) grid[i] = WHITE
  }
  return grid
}

/**
 * 规则传播到不动点。
 * 返回 false 表示发现矛盾；onSet 会收到每一次确定性填色。
 */
export function propagate(
  cells: Int8Array | number[],
  clues: ArrayLike<number>,
  w: number,
  h: number,
  onSet?: SetCallback,
): boolean {
  const n = w * h
  let changed = true

  const set = (i: number, value: number, kind: RuleKind): boolean => {
    if (cells[i] === value) return true
    if (cells[i] !== EMPTY) return false
    cells[i] = value
    onSet?.(i, value, kind)
    changed = true
    return true
  }

  // 数字格必须是白格
  for (let i = 0; i < n; i++) {
    if ((clues[i] ?? 0) <= 0) continue
    if (cells[i] === BLACK) return false
    if (cells[i] === EMPTY && !set(i, WHITE, 'island')) return false
  }

  while (changed) {
    changed = false

    // —— 白格连通块（岛屿）——
    const whiteComps = componentsOf(cells, w, h, WHITE)
    const compOf = new Int32Array(n).fill(-1)
    for (let c = 0; c < whiteComps.length; c++) {
      for (const i of whiteComps[c]!) compOf[i] = c
    }
    const clueOfComp = new Int32Array(whiteComps.length).fill(-1)
    for (let i = 0; i < n; i++) {
      if ((clues[i] ?? 0) <= 0) continue
      const c = compOf[i]
      if (c < 0) return false
      if (clueOfComp[c]! >= 0) return false
      clueOfComp[c] = i
    }

    for (let c = 0; c < whiteComps.length; c++) {
      const comp = whiteComps[c]!
      const clueCell = clueOfComp[c]!
      if (clueCell >= 0) {
        const limit = clues[clueCell]!
        if (comp.length > limit) return false
        if (comp.length === limit) {
          // 岛屿已满：边界所有空格都必须是水
          for (const i of comp) {
            for (const j of neighborsOf(i, w, h)) {
              if (cells[j] === EMPTY && !set(j, BLACK, 'island')) return false
            }
          }
        } else {
          // 岛屿还需要长大，至少得有一个可延伸的空格
          let canGrow = false
          for (const i of comp) {
            if (hasEmptyNeighbor(cells, w, h, i)) {
              canGrow = true
              break
            }
          }
          if (!canGrow) return false
        }
      } else {
        // 没有数字的白块必须还能连到某个数字
        let canGrow = false
        for (const i of comp) {
          if (hasEmptyNeighbor(cells, w, h, i)) {
            canGrow = true
            break
          }
        }
        if (!canGrow) return false
      }
    }

    // —— 2×2 三黑 → 第四格白 ——
    for (let y = 0; y + 1 < h; y++) {
      const row = y * w
      for (let x = 0; x + 1 < w; x++) {
        const a = row + x
        const b = a + 1
        const c = a + w
        const d = c + 1
        const quad = [a, b, c, d]
        let black = 0
        let unknown = -1
        for (const q of quad) {
          if (cells[q] === BLACK) black++
          else if (cells[q] === EMPTY) unknown = q
        }
        if (black === 4) return false
        if (unknown >= 0) {
          if (black === 3 && !set(unknown, WHITE, 'block')) return false
        }
      }
    }

    // —— 每个数字格的「可生长范围」——
    // 最终岛屿的每一格都必须在数字周围 limit−1 步以内（沿白/空格的路径）。
    const reachable = new Uint8Array(n)
    for (let clueCell = 0; clueCell < n; clueCell++) {
      const limit = clues[clueCell] ?? 0
      if (limit <= 0) continue
      const dist = new Int32Array(n).fill(-1)
      const queue: number[] = [clueCell]
      dist[clueCell] = 0
      reachable[clueCell] = 1
      while (queue.length) {
        const i = queue.shift()!
        if (dist[i]! + 1 >= limit) continue
        for (const j of neighborsOf(i, w, h)) {
          if (dist[j]! >= 0) continue
          if (cells[j] === BLACK || cells[j] === OUTSIDE) continue
          if (cells[j] === WHITE) {
            const cj = compOf[j]!
            const other = cj >= 0 ? clueOfComp[cj]! : -1
            if (other >= 0 && other !== clueCell) continue
          }
          dist[j] = dist[i]! + 1
          reachable[j] = 1
          queue.push(j)
        }
      }

      let reachCount = 0
      for (let i = 0; i < n; i++) if (dist[i]! >= 0) reachCount++
      if (reachCount < limit) return false
    }

    for (let i = 0; i < n; i++) {
      if (cells[i] === EMPTY && !reachable[i]) {
        if (!set(i, BLACK, 'reach')) return false
      } else if (cells[i] === WHITE && (clues[i] ?? 0) <= 0 && !reachable[i]) {
        return false
      }
    }

    // —— 空格若连接两个不同数字的岛屿，只能是水 ——
    for (let i = 0; i < n; i++) {
      if (cells[i] !== EMPTY) continue
      const clueIds = new Set<number>()
      for (const j of neighborsOf(i, w, h)) {
        if (cells[j] !== WHITE) continue
        const cj = compOf[j]!
        const clue = cj >= 0 ? clueOfComp[cj]! : -1
        if (clue >= 0) clueIds.add(clue)
      }
      if (clueIds.size >= 2 && !set(i, BLACK, 'separate')) return false
    }

    // —— 黑格连通性：已被完全包围的黑块必须已经是唯一黑块 ——
    const blackComps = componentsOf(cells, w, h, BLACK)
    if (blackComps.length > 1) {
      for (const comp of blackComps) {
        let canConnect = false
        for (const i of comp) {
          if (hasEmptyNeighbor(cells, w, h, i)) {
            canConnect = true
            break
          }
        }
        if (!canConnect) return false
      }
    }
  }

  return true
}

/** 完整盘面是否满足全部规则 */
export function isValidSolution(
  cells: ArrayLike<number>,
  clues: ArrayLike<number>,
  w: number,
  h: number,
): boolean {
  const n = w * h
  for (let i = 0; i < n; i++) {
    if (cells[i] === OUTSIDE) continue
    if (cells[i] !== BLACK && cells[i] !== WHITE) return false
  }

  for (let y = 0; y + 1 < h; y++) {
    const row = y * w
    for (let x = 0; x + 1 < w; x++) {
      const a = row + x
      const b = a + 1
      const c = a + w
      const d = c + 1
      if (
        cells[a] === BLACK &&
        cells[b] === BLACK &&
        cells[c] === BLACK &&
        cells[d] === BLACK
      ) {
        return false
      }
    }
  }

  if (componentsOf(cells, w, h, BLACK).length > 1) return false

  const whiteComps = componentsOf(cells, w, h, WHITE)
  for (const comp of whiteComps) {
    let clueCell = -1
    for (const i of comp) {
      if ((clues[i] ?? 0) > 0) {
        if (clueCell >= 0) return false
        clueCell = i
      }
    }
    if (clueCell < 0) return false
    if (comp.length !== clues[clueCell]) return false
  }
  return true
}

export interface RuleSolveResult {
  ok: boolean
  solution: number[] | null
  contradiction: boolean
  saturated: boolean
  usedProbing: boolean
}

/**
 * 只用规则（可选用反证探测）尝试解完。
 * 若 saturated 为 true，解是唯一的：每一步都是必然结论。
 */
export function solveByRules(
  clues: ArrayLike<number>,
  size: number,
  w: number,
  h: number,
  probing = true,
  maxRounds = 400,
): RuleSolveResult {
  const grid = initialGrid(clues, size)
  let usedProbing = false

  for (let round = 0; round < maxRounds; round++) {
    if (!propagate(grid, clues, w, h)) {
      return { ok: false, solution: null, contradiction: true, saturated: false, usedProbing }
    }

    let unknown = -1
    for (let i = 0; i < size; i++) {
      if (grid[i] === EMPTY) {
        unknown = i
        break
      }
    }
    if (unknown < 0) {
      const solution = Array.from(grid)
      const ok = isValidSolution(solution, clues, w, h)
      return { ok, solution: ok ? solution : null, contradiction: false, saturated: ok, usedProbing }
    }

    if (!probing) {
      return { ok: false, solution: null, contradiction: false, saturated: false, usedProbing }
    }

    usedProbing = true
    const forced: Array<{ index: number; value: number }> = []
    for (let i = 0; i < size; i++) {
      if (grid[i] !== EMPTY) continue
      let blackImpossible = false
      let whiteImpossible = false
      {
        const trial = Int8Array.from(grid)
        trial[i] = BLACK
        if (!propagate(trial, clues, w, h)) blackImpossible = true
      }
      {
        const trial = Int8Array.from(grid)
        trial[i] = WHITE
        if (!propagate(trial, clues, w, h)) whiteImpossible = true
      }
      if (blackImpossible && whiteImpossible) {
        return { ok: false, solution: null, contradiction: true, saturated: false, usedProbing }
      }
      if (blackImpossible !== whiteImpossible) {
        forced.push({ index: i, value: blackImpossible ? WHITE : BLACK })
      }
    }

    if (!forced.length) {
      return { ok: false, solution: null, contradiction: false, saturated: false, usedProbing }
    }
    for (const { index, value } of forced) {
      if (grid[index] === EMPTY) grid[index] = value
    }
  }

  return { ok: false, solution: null, contradiction: false, saturated: false, usedProbing }
}

/**
 * 数墙 —— 实时校验
 */

import type { GameState, Puzzle, ValidationResult } from '../core/types'
import { componentsOf, hasEmptyNeighbor } from './rules'
import {
  asWallPuzzle,
  asWallState,
  BLACK,
  EMPTY,
  WHITE,
  type IslandIssue,
  type WallResult,
} from './types'

export function validate(state: GameState, puzzle: Puzzle): WallResult {
  const s = asWallState(state)
  const p = asWallPuzzle(puzzle)
  const w = s.width
  const h = s.height
  const size = w * h
  const cells = s.cells
  const clues = p.clues ?? []

  let empty = 0
  let clueCount = 0
  const changed = new Set<number>()
  for (let i = 0; i < size; i++) {
    if (cells[i] === EMPTY) empty++
    if ((clues[i] ?? 0) > 0) {
      clueCount++
      if (cells[i] !== WHITE) changed.add(i)
    }
  }

  let blockCount = 0
  const blockSet = new Set<number>()
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
        blockCount++
        blockSet.add(a)
        blockSet.add(b)
        blockSet.add(c)
        blockSet.add(d)
      }
    }
  }

  const complete = empty === 0
  const bad = new Set<number>(blockSet)
  for (const i of changed) bad.add(i)

  const islandIssues: IslandIssue[] = []
  const whiteComps = componentsOf(cells, w, h, WHITE)
  for (const comp of whiteComps) {
    const clueCells: number[] = []
    for (const i of comp) if ((clues[i] ?? 0) > 0) clueCells.push(i)

    if (clueCells.length > 1) {
      islandIssues.push({
        clueIndex: clueCells[0]!,
        cells: comp.slice(),
        size: comp.length,
        limit: -1,
        kind: 'merged',
      })
      for (const i of comp) bad.add(i)
      continue
    }

    if (clueCells.length === 0) {
      const canGrow = comp.some((i) => hasEmptyNeighbor(cells, w, h, i))
      if (complete || !canGrow) {
        islandIssues.push({
          clueIndex: -1,
          cells: comp.slice(),
          size: comp.length,
          limit: 0,
          kind: complete ? 'missing' : 'sealed',
        })
        for (const i of comp) bad.add(i)
      }
      continue
    }

    const clueIndex = clueCells[0]!
    const limit = clues[clueIndex]!
    if (comp.length > limit) {
      islandIssues.push({ clueIndex, cells: comp.slice(), size: comp.length, limit, kind: 'over' })
      for (const i of comp) bad.add(i)
    } else if (comp.length === limit) {
      // 刚好填满，正确
    } else {
      const canGrow = comp.some((i) => hasEmptyNeighbor(cells, w, h, i))
      if (complete || !canGrow) {
        islandIssues.push({
          clueIndex,
          cells: comp.slice(),
          size: comp.length,
          limit,
          kind: complete ? 'under' : 'sealed',
        })
        for (const i of comp) bad.add(i)
      }
    }
  }

  const blackComps = componentsOf(cells, w, h, BLACK)
  const trapped: number[] = []
  if (blackComps.length > 1) {
    for (const comp of blackComps) {
      const canConnect = comp.some((i) => hasEmptyNeighbor(cells, w, h, i))
      if (!canConnect) {
        for (const i of comp) {
          trapped.push(i)
          bad.add(i)
        }
      }
    }
    if (complete) {
      let largest = 0
      for (let i = 1; i < blackComps.length; i++) {
        if (blackComps[i]!.length > blackComps[largest]!.length) largest = i
      }
      for (let i = 0; i < blackComps.length; i++) {
        if (i === largest) continue
        for (const idx of blackComps[i]!) bad.add(idx)
      }
    }
  }

  const solved =
    complete &&
    blockCount === 0 &&
    blackComps.length <= 1 &&
    changed.size === 0 &&
    islandIssues.length === 0

  return {
    solved,
    empty,
    complete,
    blockCount,
    blockCells: Array.from(blockSet),
    blackParts: blackComps.length,
    whiteParts: whiteComps.length,
    trapped: Array.from(new Set(trapped)),
    islandIssues,
    badCells: Array.from(bad),
    changedGivens: Array.from(changed),
    clueCount,
  }
}

export function statusBits(result: ValidationResult): string[] {
  const r = result as WallResult
  if (r.solved) return ['完成']

  const bits: string[] = []
  if (typeof r.empty === 'number' && r.empty > 0) bits.push(`还需填 ${r.empty} 格`)
  if (r.blockCount > 0) bits.push(`${r.blockCount} 处 2×2 全黑`)

  const over = r.islandIssues.filter((x) => x.kind === 'over').length
  const under = r.islandIssues.filter((x) => x.kind === 'under').length
  const merged = r.islandIssues.filter((x) => x.kind === 'merged').length
  const missing = r.islandIssues.filter((x) => x.kind === 'missing').length
  const sealed = r.islandIssues.filter((x) => x.kind === 'sealed').length
  if (over > 0) bits.push(`${over} 座岛屿超过数字`)
  if (under > 0) bits.push(`${under} 座岛屿未达到数字`)
  if (merged > 0) bits.push(`${merged} 座岛屿连到了多个数字`)
  if (missing > 0) bits.push(`${missing} 块白格没有数字`)
  if (sealed > 0 && r.complete === false) bits.push(`${sealed} 座岛屿被永久封死`)
  if (r.blackParts > 1) {
    if (r.complete) bits.push(`黑格分成 ${r.blackParts} 块未连通`)
    else if (r.trapped.length > 0) bits.push(`有 ${r.trapped.length} 格黑格被隔断`)
  }
  if (r.changedGivens.length > 0) bits.push('数字格被改动')
  if (bits.length === 0) bits.push('继续推理')
  return bits
}

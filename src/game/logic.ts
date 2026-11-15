/**
 * 数墙 —— 逻辑解题回放计划
 *
 * 推理顺序：
 *   1. 2×2 三黑 → 第四格必白
 *   2. 岛屿达到数字 → 边界全部是水
 *   3. 可达性：无法进入任何数字岛屿的空格必为水
 *   4. 空格连接两座不同数字的岛屿 → 必为水
 *   5. 黑格连通性
 *   6. 反证：试填一色后规则矛盾 → 必为另一色
 *   7. 仍卡住时回溯补完（回放里标注「回溯试探」）
 */

import type { GameState, LogicPlan, PlaybackFrame, Puzzle } from '../core/types'
import { findSolution } from './solver'
import { propagate, type RuleKind } from './rules'
import { asWallPuzzle, asWallState, BLACK, EMPTY, WHITE, type WallState } from './types'

const RULE_INFO: Record<RuleKind | 'probe' | 'search', { rule: number; label: string }> = {
  block: { rule: 1, label: '2×2 三黑 → 第四格必须是白格' },
  island: { rule: 2, label: '岛屿已满 / 数字格必须是白格' },
  reach: { rule: 3, label: '可达性：这一格进不了任何岛屿，只能是水' },
  separate: { rule: 4, label: '连接两座岛屿的格子必须是水' },
  probe: { rule: 5, label: '反证：另一种颜色会立刻矛盾' },
  search: { rule: 6, label: '回溯试探：该格最终是这一色' },
}

export function planLogicSolve(puzzle: Puzzle, initialState: GameState): LogicPlan {
  const p = asWallPuzzle(puzzle)
  const s = asWallState(initialState)
  const w = s.width
  const h = s.height
  const size = w * h
  const clues = p.clues ?? []

  const emptyPlan: LogicPlan = {
    puzzleId: p.id,
    frames: [],
    finalState: null,
    ruleSteps: 0,
    saturated: false,
  }
  if (clues.length !== size) return emptyPlan

  const grid = s.cells.slice()
  const displayed = s.cells.slice()
  const frames: PlaybackFrame[] = []
  let lastKind = ''
  let streak = 0
  let contradiction = false

  const emit = (index: number, to: number, kind: RuleKind | 'probe' | 'search'): void => {
    const from = displayed[index] ?? EMPTY
    if (from === to) return
    displayed[index] = to
    if (kind === lastKind) streak++
    else {
      lastKind = kind
      streak = 1
    }
    const info = RULE_INFO[kind]
    frames.push({ rule: info.rule, label: info.label, move: { index, from, to }, streak })
  }

  const onSet = (index: number, value: number, kind: RuleKind): void => {
    emit(index, value, kind)
  }

  const finish = (saturated: boolean): LogicPlan => {
    if (contradiction) return emptyPlan
    const finalState: WallState = {
      puzzleId: s.puzzleId,
      width: w,
      height: h,
      cells: Array.from(grid),
      givens: s.givens.slice(),
    }
    return {
      puzzleId: p.id,
      frames,
      finalState,
      ruleSteps: frames.length,
      saturated,
    }
  }

  if (!propagate(grid, clues, w, h, onSet)) return emptyPlan

  let saturated = true
  for (let round = 0; round < size * 2; round++) {
    let unknown = -1
    for (let i = 0; i < size; i++) {
      if (grid[i] === EMPTY) {
        unknown = i
        break
      }
    }
    if (unknown < 0) break
    if (frames.length > 6000) {
      saturated = false
      break
    }

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
        contradiction = true
        return finish(false)
      }
      if (blackImpossible !== whiteImpossible) {
        forced.push({ index: i, value: blackImpossible ? WHITE : BLACK })
      }
    }

    if (!forced.length) {
      saturated = false
      break
    }
    for (const { index, value } of forced) {
      if (grid[index] === EMPTY) {
        grid[index] = value
        emit(index, value, 'probe')
      }
    }
    if (!propagate(grid, clues, w, h, onSet)) return emptyPlan
  }

  let stillUnknown = false
  for (let i = 0; i < size; i++) {
    if (grid[i] === EMPTY) {
      stillUnknown = true
      break
    }
  }

  if (stillUnknown) {
    const found = findSolution(clues, size, w, h, 600_000)
    if (!found.solution) return emptyPlan
    for (let i = 0; i < size; i++) {
      if (grid[i] === found.solution[i]) continue
      grid[i] = found.solution[i]!
      emit(i, found.solution[i]!, 'search')
    }
    saturated = false
  }

  return finish(saturated)
}

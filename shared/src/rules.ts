import { distance, REACH, RESOURCE_SPOTS, type Point } from './config.ts'
import type { PlayerState } from './protocol.ts'

export interface Target {
    type: 'resource' | 'sheep'
    index: number
    x: number
    y: number
}

/** The closest standing resource or live sheep within reach of `at`. */
export function nearestTarget(s: PlayerState, at: Point, slack = 0): Target | null {
    let best: Target | null = null
    let bestDist = REACH + slack
    s.resources.forEach((r, i) => {
        const spot = RESOURCE_SPOTS[i]!
        const d = distance(at, spot)
        if (r.regrowMs === 0 && r.hp > 0 && d <= bestDist) {
            best = { type: 'resource', index: i, x: spot.x, y: spot.y }
            bestDist = d
        }
    })
    s.sheep.forEach((sheep, i) => {
        const d = distance(at, sheep)
        if (sheep.alive && d <= bestDist) {
            best = { type: 'sheep', index: i, x: sheep.x, y: sheep.y }
            bestDist = d
        }
    })
    return best
}

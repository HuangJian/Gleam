import { describe, test, expect } from 'bun:test'
import {
  clampToViewport,
  snapToEdge,
  defaultFabPos,
  posToMargins,
  marginsToPos,
} from '../ui/components/ReviewFAB'

const vp = { width: 1000, height: 800 }

describe('clampToViewport', () => {
  test('keeps a centered position unchanged', () => {
    expect(clampToViewport({ x: 100, y: 100 }, vp)).toEqual({ x: 100, y: 100 })
  })

  test('clamps overflow on every edge', () => {
    const r = clampToViewport({ x: -50, y: -50 }, vp)
    expect(r.x).toBe(24)
    expect(r.y).toBe(24)
  })

  test('clamps overflow past the bottom-right', () => {
    const r = clampToViewport({ x: 5000, y: 5000 }, vp)
    expect(r.x).toBe(1000 - 48 - 24)
    expect(r.y).toBe(800 - 48 - 24)
  })
})

describe('snapToEdge', () => {
  test('snaps to the left edge when left of center', () => {
    const r = snapToEdge({ x: 100, y: 300 }, vp)
    expect(r.x).toBe(24)
    expect(r.y).toBe(300)
  })

  test('snaps to the right edge when right of center', () => {
    const r = snapToEdge({ x: 900, y: 300 }, vp)
    expect(r.x).toBe(1000 - 48 - 24)
    expect(r.y).toBe(300)
  })

  test('still clamps Y into the viewport', () => {
    const r = snapToEdge({ x: 100, y: 9999 }, vp)
    expect(r.y).toBe(800 - 48 - 24)
  })
})

describe('defaultFabPos', () => {
  test('rests in the bottom-right corner with the standard margin', () => {
    expect(defaultFabPos(vp)).toEqual({ x: 1000 - 48 - 24, y: 800 - 48 - 24 })
  })
})

describe('margins round-trip', () => {
  test('posToMargins / marginsToPos are inverse', () => {
    const pos = { x: 200, y: 150 }
    expect(marginsToPos(posToMargins(pos, vp), vp)).toEqual(pos)
  })

  test('default position yields the standard right/bottom margins', () => {
    const def = defaultFabPos(vp)
    expect(posToMargins(def, vp)).toEqual({ right: 24, bottom: 24 })
  })
})

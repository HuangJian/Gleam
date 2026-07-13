import { describe, expect, test } from 'bun:test'
import { calculateTriggerPosition } from '../ui/components/CaptureTrigger'

describe('calculateTriggerPosition', () => {
  test('keeps the trigger inside the viewport for selections near the bottom', () => {
    const position = calculateTriggerPosition(
      {
        top: 640,
        bottom: 664,
        left: 240,
        width: 120,
      },
      {
        width: 1280,
        height: 800,
      },
    )

    expect(position).toEqual({
      x: 300,
      y: 628,
      placement: 'above',
    })
    expect(position.y).toBeLessThan(800)
  })

  test('places the trigger below when the selection is near the top edge', () => {
    const position = calculateTriggerPosition(
      {
        top: 20,
        bottom: 44,
        left: 120,
        width: 80,
      },
      {
        width: 1280,
        height: 800,
      },
    )

    expect(position).toEqual({
      x: 160,
      y: 56,
      placement: 'below',
    })
  })
})

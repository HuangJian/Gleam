import { describe, expect, test } from 'bun:test'
import { calculateTriggerPosition, detectMediaTarget } from '../ui/components/CaptureTrigger'

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

describe('detectMediaTarget', () => {
  test('returns an image anchor for an <img>', () => {
    const img = document.createElement('img')
    img.src = 'https://example.com/p.png'
    expect(detectMediaTarget(img)).toEqual({
      kind: 'image',
      src: 'https://example.com/p.png',
    })
  })

  test('returns a video anchor for a <video>', () => {
    const video = document.createElement('video')
    video.src = 'https://example.com/c.mp4'
    expect(detectMediaTarget(video)).toEqual({
      kind: 'video',
      src: 'https://example.com/c.mp4',
    })
  })

  test('returns an audio anchor for an <audio>', () => {
    const audio = document.createElement('audio')
    audio.src = 'https://example.com/a.mp3'
    expect(detectMediaTarget(audio)).toEqual({
      kind: 'audio',
      src: 'https://example.com/a.mp3',
    })
  })

  test('returns undefined for non-media elements', () => {
    const div = document.createElement('div')
    expect(detectMediaTarget(div)).toBeUndefined()
    expect(detectMediaTarget(null)).toBeUndefined()
  })
})

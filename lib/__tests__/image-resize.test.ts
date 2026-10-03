import { describe, it, expect } from 'vitest'
import { scaledSize } from '../image-resize'

describe('scaledSize', () => {
  it('caps the longest edge and keeps the aspect ratio', () => {
    expect(scaledSize(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 })
    expect(scaledSize(3024, 4032, 1600)).toEqual({ width: 1200, height: 1600 })
  })
  it('leaves smaller images alone', () => {
    expect(scaledSize(800, 600, 1600)).toEqual({ width: 800, height: 600 })
  })
})

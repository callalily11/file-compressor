import { describe, expect, it } from 'vitest'
import { setJpegDpi } from './jpeg'

describe('setJpegDpi', () => {
  it('adds a JFIF DPI marker when one is absent', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
    const result = setJpegDpi(jpeg, 144)
    expect([...result.slice(2, 9)]).toEqual([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49])
    expect(result[13]).toBe(1)
    expect((result[14] << 8) | result[15]).toBe(144)
    expect((result[16] << 8) | result[17]).toBe(144)
  })

  it('updates an existing JFIF DPI marker', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0xd9])
    const result = setJpegDpi(jpeg, 300)
    expect(result[13]).toBe(1)
    expect((result[14] << 8) | result[15]).toBe(300)
    expect((result[16] << 8) | result[17]).toBe(300)
  })
})

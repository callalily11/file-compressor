import { describe, expect, it } from 'vitest'
import { formatBytes, isSupported, MAX_BYTES, outputName, reduction } from './file'

describe('file helpers', () => {
  it('accepts only supported types and extensions', () => {
    expect(isSupported(new File(['x'], 'plan.pdf', { type: 'application/pdf' }))).toBe(true)
    expect(isSupported(new File(['x'], 'photo.jpg', { type: 'image/jpeg' }))).toBe(true)
    expect(isSupported(new File(['x'], 'archive.zip', { type: 'application/zip' }))).toBe(false)
  })
  it('creates a downloadable name and safe reduction', () => {
    expect(outputName('drawing.pdf')).toBe('drawing_compressed.pdf')
    expect(formatBytes(1024 * 1024)).toBe('1.00 MB')
    expect(reduction(100, 25)).toBe('75.0%')
    expect(reduction(100, 120)).toBe('0.0%')
  })

  it('sets the per-file limit to 300MB', () => {
    expect(MAX_BYTES).toBe(300 * 1024 * 1024)
  })
})

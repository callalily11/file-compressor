import { describe, expect, it } from 'vitest'
import { containsPdfMarker, hasPdfSignatureMarker } from './pdf'

describe('PDF safety markers', () => {
  it('finds PDF markers in binary data', () => {
    const bytes = new TextEncoder().encode('%PDF-1.7\n/ByteRange [0 1 2 3]')
    expect(hasPdfSignatureMarker(bytes)).toBe(true)
    expect(containsPdfMarker(bytes, '/Encrypt')).toBe(false)
  })
})

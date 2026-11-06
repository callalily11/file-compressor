/** Writes the JFIF density metadata without changing the JPEG pixels. */
export function setJpegDpi(source: Uint8Array, requestedDpi: number): Uint8Array {
  const dpi = Math.max(1, Math.min(65_535, Math.round(requestedDpi)))
  if (source[0] !== 0xff || source[1] !== 0xd8) return source

  for (let offset = 2; offset + 4 < source.length; ) {
    if (source[offset] !== 0xff) break
    const marker = source[offset + 1]
    if (marker === 0xda || marker === 0xd9) break
    const length = (source[offset + 2] << 8) | source[offset + 3]
    if (length < 2 || offset + 2 + length > source.length) break
    const jfif = marker === 0xe0 && source[offset + 4] === 0x4a && source[offset + 5] === 0x46 && source[offset + 6] === 0x49 && source[offset + 7] === 0x46 && source[offset + 8] === 0x00
    if (jfif) {
      const result = source.slice()
      result[offset + 11] = 1 // density unit: dots per inch
      result[offset + 12] = dpi >> 8; result[offset + 13] = dpi & 0xff
      result[offset + 14] = dpi >> 8; result[offset + 15] = dpi & 0xff
      return result
    }
    offset += length + 2
  }

  const app0 = new Uint8Array([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, dpi >> 8, dpi & 0xff, dpi >> 8, dpi & 0xff, 0x00, 0x00])
  const result = new Uint8Array(source.length + app0.length)
  result.set(source.slice(0, 2)); result.set(app0, 2); result.set(source.slice(2), 2 + app0.length)
  return result
}

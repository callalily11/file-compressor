const marker = (value: string) => new TextEncoder().encode(value)

export function containsPdfMarker(bytes: Uint8Array, value: string) {
  const needle = marker(value)
  outer: for (let index = 0; index <= bytes.length - needle.length; index += 1) {
    for (let offset = 0; offset < needle.length; offset += 1) if (bytes[index + offset] !== needle[offset]) continue outer
    return true
  }
  return false
}

export const hasPdfSignatureMarker = (bytes: Uint8Array) => containsPdfMarker(bytes, '/ByteRange')

/**
 * Generates a UUID v7 string.
 * UUID v7 is time-ordered and based on the Unix epoch timestamp in milliseconds.
 */
export function generateUUIDv7(): string {
  const now = Date.now()
  // 48-bit timestamp in hex
  const timeHex = now.toString(16).padStart(12, '0')

  // Random bits
  const randArr = new Uint8Array(10)
  crypto.getRandomValues(randArr)

  // Version 7: high 4 bits of octet 6 set to 0111 (0x7)
  const ver = 0x7000 | (((randArr[0] << 8) | randArr[1]) & 0x0fff)
  const verHex = ver.toString(16).padStart(4, '0')

  // Variant 2 (RFC 4122): high 2 bits of octet 8 set to 10 (0x8000)
  const variant = 0x8000 | (((randArr[2] << 8) | randArr[3]) & 0x3fff)
  const varHex = variant.toString(16).padStart(4, '0')

  // Remaining 6 bytes of randomness (12 hex chars)
  const restHex = Array.from(randArr.subarray(4))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  return `${timeHex.slice(0, 8)}-${timeHex.slice(8, 12)}-${verHex}-${varHex}-${restHex}`
}

/**
 * Extracts the timestamp from a UUID v7 string.
 */
export function getTimestampFromUUIDv7(uuid: string): number {
  const parts = uuid.split('-')
  const timeHex = parts[0] + parts[1]
  return parseInt(timeHex, 16)
}

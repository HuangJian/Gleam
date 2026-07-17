/** UUID v7 regex: version nibble = 7, variant bits = 10xx */
const UUID_V7_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Validates that an ID matches the UUID v7 format. Throws on invalid. */
export function validateUuidV7(id: string): void {
  if (!UUID_V7_REGEX.test(id)) {
    throw new Error(`Invalid UUID v7: ${id}`)
  }
}

/** Returns true if the ID is a valid UUID v7, false otherwise. */
export function isValidUuidV7(id: string): boolean {
  return UUID_V7_REGEX.test(id)
}

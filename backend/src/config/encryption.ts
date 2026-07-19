import { createCipheriv, createDecipheriv, scryptSync, randomBytes } from 'node:crypto'

/**
 * AES-256-GCM authenticated encryption for sensitive provider credentials.
 *
 * The encryption key is derived from `GLEAM_BACKEND_SECRET` (environment variable)
 * via scrypt. A random 12-byte IV is generated for each encryption
 * operation and stored alongside the ciphertext.
 *
 *   GLEAM_BACKEND_SECRET → scrypt → 32-byte key
 *   plaintext  → AES-256-GCM → { ciphertext, IV, authTag }
 *
 * The auth tag is concatenated with the ciphertext and stored as a single
 * base64 string. The IV is stored separately as base64.
 *
 * Plaintext API keys are never written into logs or returned through
 * GraphQL. Decryption occurs only within the Gateway at the point of
 * provider invocation.
 */

const IV_LENGTH = 12 // 96-bit IV recommended for GCM
const KEY_LENGTH = 32 // 256-bit key for AES-256
const AUTH_TAG_LENGTH = 16

let cachedKey: Buffer | null = null
let cachedSecret: string | null = null

/**
 * Derive the AES-256 key from GLEAM_BACKEND_SECRET.
 *
 * The key is cached for the lifetime of the process. If GLEAM_BACKEND_SECRET
 * changes between calls (unusual outside tests), the cache is refreshed.
 */
function getEncryptionKey(): Buffer {
  const secret = process.env.GLEAM_BACKEND_SECRET
  if (!secret) {
    throw new Error(
      'GLEAM_BACKEND_SECRET environment variable is required for Intelligence encryption. ' +
        'Set it to a stable, secret string (e.g. `openssl rand -hex 32`).',
    )
  }
  if (cachedKey && cachedSecret === secret) return cachedKey
  cachedKey = scryptSync(secret, 'gleam-intelligence-salt', KEY_LENGTH)
  cachedSecret = secret
  return cachedKey
}

export interface EncryptedPayload {
  /** base64-encoded ciphertext + auth tag (concatenated). */
  ciphertext: string
  /** base64-encoded IV. */
  iv: string
}

export function encrypt(plaintext: string): EncryptedPayload {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv('aes-256-gcm', key, iv)

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  // Concatenate ciphertext + authTag so we can store them as one column.
  const combined = Buffer.concat([encrypted, authTag])

  return {
    ciphertext: combined.toString('base64'),
    iv: iv.toString('base64'),
  }
}

export function decrypt(payload: EncryptedPayload): string {
  const key = getEncryptionKey()
  const combined = Buffer.from(payload.ciphertext, 'base64')
  const iv = Buffer.from(payload.iv, 'base64')

  if (iv.length !== IV_LENGTH) {
    throw new Error(`Invalid IV length: expected ${IV_LENGTH}, got ${iv.length}`)
  }

  // Split combined into ciphertext + authTag.
  const ciphertext = combined.subarray(0, combined.length - AUTH_TAG_LENGTH)
  const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH)

  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return decrypted.toString('utf8')
}

/**
 * Returns true if GLEAM_BACKEND_SECRET is configured. Useful for skipping
 * Intelligence startup when encryption is unavailable.
 */
export function hasEncryptionSecret(): boolean {
  return Boolean(process.env.GLEAM_BACKEND_SECRET)
}

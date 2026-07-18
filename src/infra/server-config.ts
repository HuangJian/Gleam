import type { ServerConfig } from './server-client'

declare function GM_getValue<T>(key: string, defaultValue?: T): T
declare function GM_setValue(key: string, value: unknown): void

const SERVER_URL_KEY = 'gleam_server_url'

/**
 * Reads the server URL from GM storage. Returns '' if not configured.
 */
export function getServerConfig(): ServerConfig {
  return { url: GM_getValue(SERVER_URL_KEY, '') }
}

/**
 * Persists the server URL to GM storage.
 */
export function setServerUrl(url: string): void {
  GM_setValue(SERVER_URL_KEY, url)
}

/**
 * Returns true if a server URL has been configured (non-empty).
 */
export function isServerConfigured(): boolean {
  return GM_getValue(SERVER_URL_KEY, '') !== ''
}

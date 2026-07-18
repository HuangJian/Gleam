import { render } from 'preact'
import createCache from '@emotion/cache'
import { CacheProvider } from '@emotion/react'
import { App } from './ui/App'
import { GMStorageAdapter } from './infra/gm-storage'
import { ServerClient } from './infra/server-client'
import { getServerConfig } from './infra/server-config'
import { SyncService } from './services/sync'

declare function GM_registerMenuCommand(name: string, fn: () => void, accessKey?: string): void

// 1. Initialize the stable Repository layer (local cache + domain storage)
const repository = new GMStorageAdapter()

// 2. Initialize the server client (GraphQL via GM_xmlhttpRequest)
const serverClient = new ServerClient(getServerConfig)

// 3. Initialize the SyncService (orchestrates local cache + remote server)
const syncService = new SyncService(repository, serverClient)

// 2. Inject modern fonts into the main document head (so browser loads them)
function injectFonts() {
  if (document.getElementById('gleam-fonts')) return
  const link = document.createElement('link')
  link.id = 'gleam-fonts'
  link.rel = 'stylesheet'
  link.href =
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Outfit:wght@400;500;600;700&display=swap'
  document.head.appendChild(link)
}

// 3. Initialize the Shadow DOM wrapper to isolate styling
function initApp() {
  // Prevent duplicate mounts
  if (document.getElementById('gleam-root')) return

  injectFonts()

  const host = document.createElement('div')
  host.id = 'gleam-root'

  // Style host to be invisible and not disrupt page layout
  host.style.position = 'absolute'
  host.style.width = '0'
  host.style.height = '0'
  host.style.top = '0'
  host.style.left = '0'
  host.style.border = 'none'
  host.style.margin = '0'
  host.style.padding = '0'

  document.body.appendChild(host)

  const shadowRoot = host.attachShadow({ mode: 'open' })
  const appContainer = document.createElement('div')
  shadowRoot.appendChild(appContainer)

  // 4. Set up Emotion cache for Shadow DOM isolation
  const emotionCache = createCache({
    key: 'gleam-shadow-styles',
    container: shadowRoot,
  })

  // 5. Render Preact App inside CacheProvider
  render(
    <CacheProvider value={emotionCache}>
      <App repository={repository} syncService={syncService} shadowHost={host} />
    </CacheProvider>,
    appContainer,
  )
}

// Ensure the page body is available
if (document.body) {
  initApp()
} else {
  window.addEventListener('DOMContentLoaded', initApp)
}

// 6. Register Tampermonkey UserScript commands if available
if (typeof GM_registerMenuCommand !== 'undefined') {
  GM_registerMenuCommand('打开拾光志', () => {
    // Dispatch custom event to tell the App to open the sidebar
    // Or we can simple trigger a click on the floating action button
    const root = document.getElementById('gleam-root')
    const fab = root?.shadowRoot?.querySelector('button[title="打开拾光志"]')
    if (fab instanceof HTMLButtonElement) {
      fab.click()
    }
  })

  GM_registerMenuCommand('快捷记录新拾光 (Ctrl+Shift+G)', () => {
    // Simulate keyboard event or dispatch custom event to trigger capture panel
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'g',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
      }),
    )
  })
}

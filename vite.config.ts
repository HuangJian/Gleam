import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import monkey from 'vite-plugin-monkey'
import externalGlobals from 'rollup-plugin-external-globals'

// Pinned CDN builds (UMD) of the runtime libraries. Loading them via @require
// keeps the distributed userscript tiny — only our app code is bundled.
// Versions MUST match package.json.
const CDN = 'https://cdn.jsdelivr.net/npm'
const REQUIRE = [
  `${CDN}/preact@10.29.7/dist/preact.umd.js`,
  `${CDN}/preact@10.29.7/hooks/dist/hooks.umd.js`,
  `${CDN}/preact@10.29.7/compat/dist/compat.umd.js`,
  // @emotion/react's UMD reads the global `React` at load time, so alias it
  // from preactCompat (loaded above) before the emotion bundles execute.
  'data:text/javascript,window.React=window.preactCompat;',
  `${CDN}/@emotion/react@11.14.0/dist/emotion-react.umd.min.js`,
  `${CDN}/@emotion/styled@11.14.1/dist/emotion-styled.umd.min.js`,
  `${CDN}/marked@18.0.6/lib/marked.umd.js`,
  `${CDN}/dompurify@3.4.12/dist/purify.min.js`,
]

// Bare module id -> global variable name exposed by the UMD builds above.
// Modules NOT listed here (preact/jsx-runtime, @emotion/cache) are bundled.
const GLOBALS: Record<string, string> = {
  preact: 'preact',
  'preact/hooks': 'preactHooks',
  'preact/compat': 'preactCompat',
  react: 'preactCompat',
  'react-dom': 'preactCompat',
  '@emotion/react': 'emotionReact',
  '@emotion/styled': 'emotionStyled',
  marked: 'marked',
  dompurify: 'DOMPurify',
}

export default defineConfig({
  plugins: [
    preact(),
    // Rewrite bare imports to the CDN globals. Restricted to build so the dev
    // server keeps serving real modules (no @require in dev).
    { ...externalGlobals(GLOBALS), apply: 'build' },
    monkey({
      entry: 'src/main.tsx',
      userscript: {
        name: 'Gleam · 拾光',
        namespace: 'https://github.com/hj/Gleam',
        version: '0.1.0',
        description: '记录你在时间里认知的痕迹',
        match: ['http://*/*', 'https://*/*'],
        require: REQUIRE,
        grant: ['GM_setValue', 'GM_getValue', 'GM_registerMenuCommand'],
        'run-at': 'document-idle',
      },
    }),
  ],
  resolve: {
    alias: {
      react: 'preact/compat',
      'react-dom': 'preact/compat',
      'react/jsx-runtime': 'preact/jsx-runtime',
    },
  },
  build: {
    rollupOptions: {
      // Treat the CDN libraries as external so only app code is bundled.
      // (Rolldown requires an array, not a predicate function.)
      external: Object.keys(GLOBALS),
    },
  },
})

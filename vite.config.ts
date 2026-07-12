import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import monkey from 'vite-plugin-monkey'

export default defineConfig({
  plugins: [
    preact(),
    monkey({
      entry: 'src/main.tsx',
      userscript: {
        name: 'Gleam · 拾光',
        namespace: 'https://github.com/hj/Gleam',
        version: '0.1.0',
        description: '记录你在时间里认知的痕迹',
        match: ['http://*/*', 'https://*/*'],
        grant: ['GM_setValue', 'GM_getValue', 'GM_registerMenuCommand'],
        runAt: 'document-idle',
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
})

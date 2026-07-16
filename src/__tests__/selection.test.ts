import { describe, test, expect } from 'bun:test'
import {
  deriveSourceMarkdown,
  DEFAULT_SOURCE_OPTIONS,
  type SourceCaptureOptions,
} from '../utils/selection'

// A selection inside a <p> that also contains a link the user could not select.
const sel = {
  text: 'see the docs',
  excerptHtml: 'see the <a href="https://x.com">docs</a>',
  excerptFullHtml:
    'see the <a href="https://x.com">docs</a> and <button>Subscribe</button> more text',
  excerptFullTag: 'P',
}

const base: SourceCaptureOptions = { ...DEFAULT_SOURCE_OPTIONS }

describe('deriveSourceMarkdown', () => {
  test('selection-only when fullBlock is off', () => {
    const md = deriveSourceMarkdown(sel, { ...base, fullBlock: false })
    expect(md).toBe('see the [docs](https://x.com)')
  })

  test('full block recovers unselected link text', () => {
    const md = deriveSourceMarkdown(sel, base)
    expect(md).toContain('see the [docs](https://x.com)')
    expect(md).toContain('more text')
  })

  test('pruneNoise removes interactive controls (button)', () => {
    const md = deriveSourceMarkdown(sel, { ...base, pruneNoise: true })
    expect(md).not.toContain('Subscribe')
    const mdNoPrune = deriveSourceMarkdown(sel, { ...base, pruneNoise: false })
    expect(mdNoPrune).toContain('Subscribe')
  })

  test('contentBlocksOnly rejects container blocks (ARTICLE)', () => {
    const container = { ...sel, excerptFullTag: 'ARTICLE' }
    const md = deriveSourceMarkdown(container, { ...base, contentBlocksOnly: true })
    // Falls back to selection only.
    expect(md).toBe('see the [docs](https://x.com)')
    const mdAllow = deriveSourceMarkdown(container, {
      ...base,
      contentBlocksOnly: false,
    })
    expect(mdAllow).toContain('more text')
  })

  test('divAsParagraph treats a leaf DIV as a usable full block', () => {
    const divSel = { ...sel, excerptFullTag: 'DIV' }
    const md = deriveSourceMarkdown(divSel, { ...base, divAsParagraph: false })
    expect(md).toBe('see the [docs](https://x.com)')
    const mdAllow = deriveSourceMarkdown(divSel, { ...base, divAsParagraph: true })
    expect(mdAllow).toContain('more text')
  })

  test('fallBackIfLarge reverts to selection when the block is huge', () => {
    const huge = {
      ...sel,
      excerptFullHtml: 'see the docs ' + 'x'.repeat(5000),
    }
    const md = deriveSourceMarkdown(huge, { ...base, fallBackIfLarge: true })
    expect(md).toBe('see the [docs](https://x.com)')
    const mdNoGuard = deriveSourceMarkdown(huge, { ...base, fallBackIfLarge: false })
    expect(mdNoGuard.length).toBeGreaterThan(1000)
  })

  test('plain text mode is handled by the caller (text passthrough)', () => {
    // deriveSourceMarkdown always returns Markdown; plain-text mode is applied
    // by CapturePanel using excerptText directly. Here we just confirm the
    // selection markdown is produced.
    const md = deriveSourceMarkdown(sel, base)
    expect(md).toContain('[docs](https://x.com)')
  })
})

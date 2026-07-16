import { htmlToMarkdown } from './html-to-markdown'

// True "content" blocks whose full text we want to capture as the source.
const CONTENT_BLOCK_TAGS = new Set([
  'P',
  'LI',
  'BLOCKQUOTE',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'TD',
  'TH',
  'PRE',
  'DD',
  'DT',
])

// Container-level blocks. By default we do NOT capture these as the "full
// block" (they tend to wrap whole articles/sections); the user can opt in.
const CONTAINER_BLOCK_TAGS = new Set(['ARTICLE', 'SECTION', 'FIGURE', 'FIGCAPTION'])

// Broad set used only to detect the nearest block boundary for a selection.
const ANY_BLOCK_TAGS = new Set([...CONTENT_BLOCK_TAGS, ...CONTAINER_BLOCK_TAGS, 'DIV'])

// Nodes removed from a captured block before conversion (interactive controls,
// decorative SVG, hidden content, footnote markers). Images are included
// because a text excerpt rarely wants raw image URLs.
const NOISE_SELECTOR =
  'button, input, select, textarea, svg, img, [aria-hidden="true"], [hidden], .sr-only, sup a[href^="#"], .footnote-ref, .footnoteRef, .gleam-root'

// If the full block is this many times larger than the selection (and above an
// absolute floor), it almost certainly pulled in unrelated content — fall back
// to the selection only.
const FULL_BLOCK_RATIO = 5
const FULL_BLOCK_ABS = 400

function closestBlock(node: Node | null): HTMLElement | null {
  let el: HTMLElement | null = node instanceof HTMLElement ? node : (node?.parentElement ?? null)
  while (el && !ANY_BLOCK_TAGS.has(el.tagName)) {
    el = el.parentElement
  }
  return el
}

export interface SelectionMarkdown {
  /** Plain-text selection (used for empty/guard checks and plain-text mode). */
  text: string
  /** HTML of the selected range only (cloneContents). */
  excerptHtml: string
  /** innerHTML of the enclosing block, or null when the selection spans
   *  multiple blocks. */
  excerptFullHtml: string | null
  /** tagName of the enclosing block, or null. */
  excerptFullTag: string | null
}

/**
 * Extract the raw HTML needed to derive a source excerpt from a DOM Selection.
 *
 * - `excerptHtml`: the selected range, for selection-only capture.
 * - `excerptFullHtml` / `excerptFullTag`: the enclosing block, captured only
 *   when start and end of the selection share the same nearest block (we do
 *   not force-merge separate blocks).
 *
 * Returns null when there is no usable text selection.
 */
export function extractSelectionMarkdown(selection: Selection): SelectionMarkdown | null {
  const text = selection.toString().trim()
  if (!text || selection.rangeCount === 0) return null

  const range = selection.getRangeAt(0)

  const fragment = range.cloneContents()
  const wrap = document.createElement('div')
  wrap.appendChild(fragment)
  const excerptHtml = wrap.innerHTML

  const startBlock = closestBlock(range.startContainer)
  const endBlock = closestBlock(range.endContainer)
  const sameBlock = startBlock && startBlock === endBlock
  const excerptFullHtml = sameBlock ? startBlock.innerHTML : null
  const excerptFullTag = sameBlock ? startBlock.tagName : null

  return { text, excerptHtml, excerptFullHtml, excerptFullTag }
}

export interface SourceCaptureOptions {
  /** Capture the enclosing block (not just the selection). */
  fullBlock: boolean
  /** Reject container blocks (ARTICLE/SECTION/FIGURE) as the full block. */
  contentBlocksOnly: boolean
  /** Remove interactive/decorative/hidden/footnote/image nodes first. */
  pruneNoise: boolean
  /** If the full block is far larger than the selection, use selection only. */
  fallBackIfLarge: boolean
  /** Treat a leaf <div> as a paragraph (many sites use div for paragraphs). */
  divAsParagraph: boolean
}

export const DEFAULT_SOURCE_OPTIONS: SourceCaptureOptions = {
  fullBlock: true,
  contentBlocksOnly: true,
  pruneNoise: true,
  fallBackIfLarge: true,
  divAsParagraph: false,
}

/** Remove noise nodes from an HTML fragment, returning cleaned innerHTML. */
function pruneHtml(html: string, pruneNoise: boolean): string {
  if (!pruneNoise) return html
  const root = document.createElement('div')
  root.innerHTML = html
  root.querySelectorAll(NOISE_SELECTOR).forEach((n) => n.remove())
  return root.innerHTML
}

/**
 * Derive the Markdown source excerpt from raw selection HTML, applying the
 * given capture options. Pure with respect to the live DOM (operates only on
 * the provided strings), so it is unit-testable without a real Selection.
 */
export function deriveSourceMarkdown(
  sel: Pick<SelectionMarkdown, 'text' | 'excerptHtml' | 'excerptFullHtml' | 'excerptFullTag'>,
  opts: SourceCaptureOptions,
): string {
  const selectionMd = htmlToMarkdown(pruneHtml(sel.excerptHtml, opts.pruneNoise), sel.text)

  if (!opts.fullBlock || !sel.excerptFullHtml || !sel.excerptFullTag) {
    return selectionMd
  }

  const tag = sel.excerptFullTag
  const isContent = CONTENT_BLOCK_TAGS.has(tag)
  const isContainer = CONTAINER_BLOCK_TAGS.has(tag)
  const isDiv = tag === 'DIV'

  // Decide whether this block is a usable "full block" given the options.
  const usable =
    isContent || (isDiv && opts.divAsParagraph) || (isContainer && !opts.contentBlocksOnly)
  if (!usable) return selectionMd

  const fullMd = htmlToMarkdown(pruneHtml(sel.excerptFullHtml, opts.pruneNoise), selectionMd)

  if (
    opts.fallBackIfLarge &&
    fullMd.length > selectionMd.length * FULL_BLOCK_RATIO &&
    fullMd.length > FULL_BLOCK_ABS
  ) {
    return selectionMd
  }

  return fullMd
}

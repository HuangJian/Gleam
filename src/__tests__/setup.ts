import { Window } from 'happy-dom'
import { mock } from 'bun:test'

// Mock @emotion/styled: render plain HTML elements instead of styled components.
// @emotion/react's useContext crashes under happy-dom + preact/hooks, so we
// bypass the entire Emotion runtime. Styles are irrelevant for render tests —
// we only care about DOM structure and interactions.
mock.module('@emotion/styled', () => {
  // Return the bare string tag so Preact treats <StyledDiv> as a native DOM
  // element — this ensures ref, children, and event handlers all work
  // correctly without forwardRef. $-prefixed transient props are harmless as
  // extra DOM attributes in tests.
  const proxy = new Proxy(function () {}, {
    get(_target: unknown, tag: string) {
      if (typeof tag !== 'string' || tag === 'then' || tag === '$$typeof') {
        return undefined
      }
      return function _styledTagFactory() {
        return tag
      }
    },
    apply(_target: unknown, _thisArg: unknown, args: [string]) {
      return function _styledCallFactory() {
        return args[0]
      }
    },
  })

  return { default: proxy, __esModule: true }
})

const window = new Window()

// happy-dom's Window/Selection types diverge structurally from the DOM lib
// types, so we assign through Object.assign and cast the selection return.
Object.assign(globalThis, {
  document: window.document,
  window,
  HTMLElement: window.HTMLElement,
  HTMLImageElement: window.HTMLImageElement,
  HTMLVideoElement: window.HTMLVideoElement,
  HTMLAudioElement: window.HTMLAudioElement,
  Element: window.Element,
  Node: window.Node,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  Event: window.Event,
})

globalThis.getSelection = () => window.getSelection() as unknown as Selection

// happy-dom does not implement HTMLElement.focus()/blur(). Add no-op stubs so
// components that call ref.current?.focus() in useEffect don't crash.
const HTMLElementProto = window.HTMLElement.prototype
if (typeof HTMLElementProto.focus !== 'function') {
  HTMLElementProto.focus = function () {}
}
if (typeof HTMLElementProto.blur !== 'function') {
  HTMLElementProto.blur = function () {}
}

// Workaround for happy-dom bug (https://github.com/capricorn86/happy-dom/issues/1165
// → #2182): `Node.prototype.nodeName` and `Node.prototype.textContent` are
// getters that return '' instead of delegating to the node's real values.
// DOMPurify calls the cached `Node.prototype.*` getters on every node to avoid
// DOM clobbering, so it sees '' for every element — failing to match
// ALLOWED_TAGS (strips all tags) and dropping text content. Real browsers are
// unaffected. Patch the getters to delegate to the actual implementation found
// by walking the prototype chain, so DOMPurify sanitization works under
// happy-dom.
const NodeProto = window.Node.prototype

// Find the first getter for `prop` in `obj`'s prototype chain that is not the
// no-op `Node.prototype` getter (which always returns '').
function findRealGetter(obj: object, prop: string): ((this: unknown) => unknown) | null {
  let proto = Object.getPrototypeOf(obj)
  while (proto && proto !== NodeProto) {
    const desc = Object.getOwnPropertyDescriptor(proto, prop)
    if (desc?.get) return desc.get
    proto = Object.getPrototypeOf(proto)
  }
  return null
}

for (const prop of ['nodeName', 'textContent'] as const) {
  const nodeGetter = Object.getOwnPropertyDescriptor(NodeProto, prop)?.get
  if (nodeGetter) {
    Object.defineProperty(NodeProto, prop, {
      configurable: true,
      get(this: unknown) {
        const real = findRealGetter(this as object, prop)
        return real ? real.call(this) : nodeGetter.call(this)
      },
    })
  }
}

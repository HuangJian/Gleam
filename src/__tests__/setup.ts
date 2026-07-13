import { Window } from 'happy-dom'

const window = new Window()

// happy-dom's Window/Selection types diverge structurally from the DOM lib
// types, so we assign through Object.assign and cast the selection return.
Object.assign(globalThis, {
  document: window.document,
  window,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  Event: window.Event,
})

globalThis.getSelection = () => window.getSelection() as unknown as Selection

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

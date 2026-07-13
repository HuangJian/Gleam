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

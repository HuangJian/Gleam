import { Window } from 'happy-dom'

const window = new Window()

global.document = window.document as unknown as Document
global.window = window as unknown as Window & typeof globalThis
global.HTMLElement = window.HTMLElement as unknown as typeof HTMLElement
global.Element = window.Element as unknown as typeof Element
global.Node = window.Node as unknown as typeof Node
global.MouseEvent = window.MouseEvent as unknown as typeof MouseEvent
global.KeyboardEvent = window.KeyboardEvent as unknown as typeof KeyboardEvent
global.Event = window.Event as unknown as typeof Event
global.getSelection = () => window.getSelection()

import { useSyncExternalStore } from 'react'

type FloatingChatState = {
  isOpen: boolean
  initialQuestion: string
}

let state: FloatingChatState = { isOpen: false, initialQuestion: '' }
const listeners = new Set<() => void>()

function setState(next: FloatingChatState) {
  state = next
  listeners.forEach((listener) => listener())
}

export function openFloatingChat(initialQuestion = '') {
  setState({ isOpen: true, initialQuestion })
}

export function closeFloatingChat() {
  setState({ isOpen: false, initialQuestion: '' })
}

export function isFloatingChatOpen() {
  return state.isOpen
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useFloatingChat() {
  return useSyncExternalStore(subscribe, () => state)
}

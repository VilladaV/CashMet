import { afterEach, vi } from 'vitest'

// Provide a lightweight in-memory localStorage when running under Node so
// repository/logic suites don't need jsdom just for localStorage access.
function ensureLocalStorage(): void {
  try {
    if (
      typeof globalThis.localStorage !== 'undefined' &&
      typeof globalThis.localStorage.getItem === 'function' &&
      typeof globalThis.localStorage.setItem === 'function' &&
      typeof globalThis.localStorage.clear === 'function'
    ) {
      globalThis.localStorage.getItem('__probe__')
      return
    }
  } catch {
    // Fall through and install in-memory polyfill
  }

  const data = new Map<string, string>()
  const storage: Storage = {
    get length() {
      return data.size
    },
    clear() {
      data.clear()
    },
    getItem(key: string) {
      return data.has(key) ? data.get(key)! : null
    },
    key(index: number) {
      return [...data.keys()][index] ?? null
    },
    removeItem(key: string) {
      data.delete(key)
    },
    setItem(key: string, value: string) {
      data.set(String(key), String(value))
    },
  }

  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  })
}

ensureLocalStorage()

afterEach(() => {
  try {
    globalThis.localStorage?.clear()
  } catch {
    /* ignore */
  }
  vi.useRealTimers()
})

// The app uses window.confirm for destructive actions; tests must never block.
if (typeof window !== 'undefined') {
  window.confirm = () => true
  window.alert = () => undefined
}

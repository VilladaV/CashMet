import { afterEach, vi } from 'vitest'

// jsdom provides localStorage, but each test file gets a clean slate unless we clear it.
afterEach(() => {
  try {
    localStorage.clear()
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

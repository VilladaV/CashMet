import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import AppAuth from './AppAuth.tsx'

// Forzar actualización inmediata del Service Worker PWA solo cuando reemplaza un SW previo
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  const teniaControlador = Boolean(navigator.serviceWorker.controller)
  let recargandoPorSw = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!teniaControlador || recargandoPorSw) return
    recargandoPorSw = true
    window.location.reload()
  })
  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.update().catch(() => undefined))))
      .catch(() => undefined)
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AppAuth />
    </ErrorBoundary>
  </StrictMode>,
)

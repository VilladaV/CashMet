import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import AppAuth from './AppAuth.tsx'

// Forzar actualización inmediata del Service Worker PWA para que nunca quede código viejo tras un despliegue
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  let recargandoPorSw = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (recargandoPorSw) return
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
    <AppAuth />
  </StrictMode>,
)

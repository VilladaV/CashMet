import { useEffect, useRef, useState } from 'react'
import type { User } from 'firebase/auth'
import { onAuthChange } from './lib/firebase/auth'
import { ejecutarPilotoAutomatico } from './lib/piloto'
import { invalidarSnapshotFinanciero } from './features/chat/snapshot'
import LoginPage from './features/auth/LoginPage'
import App from './App'

export default function AppAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const pilotoUidRef = useRef<string | null>(null)
  const ultimoUidRef = useRef<string | null>(null)

  useEffect(() => {
    return onAuthChange((u) => {
      const nextUid = u?.uid ?? null
      if (ultimoUidRef.current !== nextUid) {
        invalidarSnapshotFinanciero()
        ultimoUidRef.current = nextUid
      }
      if (!u) {
        pilotoUidRef.current = null
      }
      setUser(u)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!user) return
    if (pilotoUidRef.current === user.uid) return
    const uidActual = user.uid
    pilotoUidRef.current = uidActual
    ejecutarPilotoAutomatico()
      .then((r) => {
        if (r.cambio) invalidarSnapshotFinanciero()
      })
      .catch(() => {
        if (pilotoUidRef.current === uidActual) {
          pilotoUidRef.current = null
        }
      })
  }, [user])

  if (loading) {
    return (
      <div className="bg-mesh-pattern flex min-h-screen items-center justify-center p-4 text-mist-300">
        <div className="flex flex-col items-center gap-3">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-400/25 border-t-emerald-400" />
          <span className="text-xs font-semibold text-mist-500">Cargando CashMet...</span>
        </div>
      </div>
    )
  }
  if (!user) return <LoginPage />
  return <App />
}

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
  const pilotoCorrido = useRef(false)

  useEffect(() => {
    return onAuthChange((u) => {
      setUser(u)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!user || pilotoCorrido.current) return
    pilotoCorrido.current = true
    ejecutarPilotoAutomatico()
      .then((r) => {
        if (r.cambio) invalidarSnapshotFinanciero()
      })
      .catch(() => {})
  }, [user])

  if (loading) return <div className="p-4 text-center">Cargando...</div>
  if (!user) return <LoginPage onSuccess={() => {}} />
  return <App />
}

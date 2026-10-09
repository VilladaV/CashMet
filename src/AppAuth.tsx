import { useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import { onAuthChange } from './lib/firebase/auth'
import LoginPage from './features/auth/LoginPage'
import App from './App'

export default function AppAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    return onAuthChange((u) => {
      setUser(u)
      setLoading(false)
    })
  }, [])
  if (loading) return <div className="p-4 text-center">Cargando...</div>
  if (!user) return <LoginPage onSuccess={() => {}} />
  return <App />
}

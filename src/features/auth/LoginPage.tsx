import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { login, signUp } from '@/lib/firebase/auth'

export default function LoginPage({ onSuccess }: { onSuccess: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    setBusy(true)
    try {
      if (mode === 'signup') {
        await signUp(email, pass)
      } else {
        await login(email, pass)
      }
      onSuccess()
    } catch (e: any) {
      setErr(e?.message || 'Error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="container mx-auto p-4 max-w-sm">
      <Card>
        <CardHeader>
          <CardTitle>CashMet - {mode === 'login' ? 'Entrar' : 'Crear cuenta'}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" required />
            <Input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="password (mín. 6)" required minLength={6} />
            {err && <div className="text-xs text-red-600">{err}</div>}
            <Button className="w-full" type="submit" disabled={busy}>
              {busy ? '...' : mode === 'login' ? 'Entrar' : 'Registrarme'}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full text-xs"
              onClick={() => { setErr(''); setMode(mode === 'login' ? 'signup' : 'login') }}
            >
              {mode === 'login' ? '¿No tienes cuenta? Crear una' : 'Ya tengo cuenta, entrar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { login } from '@/lib/firebase/auth'

export default function LoginPage({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    try {
      await login(email, pass)
      onSuccess()
    } catch (e: any) {
      setErr(e?.message || 'Error')
    }
  }
  return (
    <div className="container mx-auto p-4 max-w-sm">
      <Card>
        <CardHeader>
          <CardTitle>CashMet - Login</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" required />
            <Input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="password" required />
            {err && <div className="text-xs text-red-600">{err}</div>}
            <Button className="w-full" type="submit">
              Entrar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

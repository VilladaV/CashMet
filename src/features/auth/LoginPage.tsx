import { useState } from 'react'
import { motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { login } from '@/lib/firebase/auth'
import CashMetLogo from '@/components/brand/CashMetLogo'
import { ShieldCheck, ArrowRight, Lock, Mail, Sparkles } from 'lucide-react'

export default function LoginPage({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    setBusy(true)
    try {
      await login(email, pass)
      onSuccess()
    } catch (e: any) {
      setErr(e?.message || 'Error al autenticar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-mesh-pattern p-4">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="animate-drift absolute -top-32 left-1/4 h-96 w-96 rounded-full bg-emerald-500/[0.1] blur-[130px]" />
        <div className="animate-drift absolute -bottom-32 right-1/4 h-96 w-96 rounded-full bg-sky-500/[0.1] blur-[130px] [animation-delay:-8s]" />
      </div>

      <motion.div
        className="relative z-10 w-full max-w-md space-y-6"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex flex-col items-center space-y-3 text-center">
          <CashMetLogo size="xl" showText={true} showSubtitle={true} variant="dark" />
          <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-300">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Gestión financiera inteligente · Colombia</span>
          </div>
        </div>

        <Card className="glass-card surface-glow overflow-hidden border-0">
          <div className="h-1 w-full bg-gradient-to-r from-sky-500 via-teal-400 to-emerald-400" />
          <CardContent className="space-y-5 p-6 sm:p-8">
            <div className="space-y-1">
              <h2 className="text-xl font-black tracking-tight text-white">Iniciar sesión</h2>
              <p className="text-xs text-mist-500">
                Ingresa tus credenciales para acceder a tus finanzas y chat IA.
              </p>
            </div>

            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-bold text-mist-300">
                  <Mail className="h-3.5 w-3.5 text-mist-600" />
                  Correo electrónico
                </label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@ejemplo.com"
                  required
                  className="field-dark h-11 text-sm shadow-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-bold text-mist-300">
                  <Lock className="h-3.5 w-3.5 text-mist-600" />
                  Contraseña
                </label>
                <Input
                  type="password"
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="field-dark h-11 text-sm shadow-none"
                />
              </div>

              {err && (
                <div className="rounded-xl border border-red-400/25 bg-red-500/10 p-2.5 text-xs text-red-300">
                  {err}
                </div>
              )}

              <motion.div whileTap={{ scale: 0.98 }}>
                <Button
                  type="submit"
                  disabled={busy}
                  className="h-11 w-full cursor-pointer bg-gradient-to-r from-emerald-500 to-teal-400 font-bold text-[#04241a] shadow-[0_10px_30px_-10px_rgba(16,185,129,0.8)] hover:brightness-110"
                >
                  <span>{busy ? 'Verificando...' : 'Acceder a CashMet'}</span>
                  {!busy && <ArrowRight className="h-4 w-4" />}
                </Button>
              </motion.div>
            </form>
          </CardContent>
        </Card>

        <div className="flex items-center justify-center gap-1.5 text-xs text-mist-500">
          <ShieldCheck className="h-4 w-4 text-emerald-300" />
          <span>Acceso privado y encriptado en Firebase Firestore</span>
        </div>
      </motion.div>
    </div>
  )
}

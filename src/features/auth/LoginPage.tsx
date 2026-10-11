import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { login, signUp } from '@/lib/firebase/auth'
import CashMetLogo from '@/components/brand/CashMetLogo'
import { ShieldCheck, ArrowRight, Lock, Mail, Sparkles } from 'lucide-react'

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
      setErr(e?.message || 'Error al autenticar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-mesh-pattern flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Elementos decorativos de fondo */}
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-sky-200/40 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-emerald-200/40 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10 space-y-6">
        {/* Cabecera con Logo Oficial */}
        <div className="flex flex-col items-center text-center space-y-3">
          <CashMetLogo size="xl" showText={true} showSubtitle={true} />
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-xs">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span>Gestión Financiera Inteligente · Colombia</span>
          </div>
        </div>

        {/* Tarjeta de autenticación estilo Fintech */}
        <Card className="glass-card shadow-xl border-slate-200/80 overflow-hidden">
          <div className="h-1.5 w-full gradient-brand-growth" />
          <CardContent className="p-6 sm:p-8 space-y-5">
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                {mode === 'login' ? 'Iniciar sesión' : 'Crear tu cuenta privada'}
              </h2>
              <p className="text-xs text-slate-500">
                {mode === 'login'
                  ? 'Ingresa tus credenciales para acceder a tus finanzas y chat IA.'
                  : 'Registra tu usuario único para sincronizar tus cuentas y activos.'}
              </p>
            </div>

            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  Correo electrónico
                </label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@ejemplo.com"
                  required
                  className="h-10 bg-white border-slate-200 focus-visible:ring-emerald-500 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                  Contraseña
                </label>
                <Input
                  type="password"
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="h-10 bg-white border-slate-200 focus-visible:ring-emerald-500 text-sm"
                />
              </div>

              {err && (
                <div className="p-2.5 rounded-lg text-xs bg-red-50 text-red-700 border border-red-200">
                  {err}
                </div>
              )}

              <Button
                type="submit"
                disabled={busy}
                className="w-full h-10 gradient-brand-navy text-white hover:opacity-95 font-semibold shadow-md flex items-center justify-center gap-2 group transition-all"
              >
                <span>{busy ? 'Verificando...' : mode === 'login' ? 'Acceder a CashMet' : 'Completar Registro'}</span>
                {!busy && <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />}
              </Button>

              <div className="pt-2 text-center">
                <button
                  type="button"
                  className="text-xs font-medium text-slate-600 hover:text-emerald-700 underline underline-offset-4 transition-colors"
                  onClick={() => {
                    setErr('')
                    setMode(mode === 'login' ? 'signup' : 'login')
                  }}
                >
                  {mode === 'login'
                    ? '¿No tienes cuenta registrada? Regístrate aquí'
                    : '¿Ya tienes cuenta? Inicia sesión'}
                </button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Badge de seguridad */}
        <div className="flex items-center justify-center gap-1.5 text-xs text-slate-600">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Acceso privado y encriptado en Firebase Firestore</span>
        </div>
      </div>
    </div>
  )
}

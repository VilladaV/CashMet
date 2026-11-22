import { useCallback, useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  actualizarCuentaBanco,
  crearCuentaBanco,
  eliminarCuentaBanco,
  listarCuentasBanco,
  type CuentaBanco,
} from '@/lib/firebase/movimientosRepo'
import { invalidarSnapshotFinanciero } from '@/features/chat/snapshot'
import { desformatearCifra } from '@/lib/utils'
import { Wallet, PlusCircle, Edit3, Trash2, Check, AlertCircle } from 'lucide-react'

const TIPOS: Array<{ value: CuentaBanco['tipo']; label: string }> = [
  { value: 'ahorros', label: 'Ahorros' },
  { value: 'corriente', label: 'Corriente' },
  { value: 'digital', label: 'Digital' },
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'inversion', label: 'Inversión' },
]

const ETIQUETA_TIPO: Record<CuentaBanco['tipo'], string> = {
  ahorros: 'Ahorros',
  corriente: 'Corriente',
  digital: 'Digital',
  efectivo: 'Efectivo',
  inversion: 'Inversión',
}

export default function CuentasPage() {
  const [cuentas, setCuentas] = useState<CuentaBanco[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [eliminandoId, setEliminandoId] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<CuentaBanco['tipo']>('ahorros')
  const [saldo, setSaldo] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const cargar = useCallback(async () => {
    try {
      const data = await listarCuentasBanco()
      setCuentas(data)
    } catch {
      setError('No se pudieron cargar las cuentas.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    let cancelado = false
    void Promise.resolve().then(() => {
      if (!cancelado) void cargar()
    })
    return () => {
      cancelado = true
    }
  }, [cargar])

  const limpiarForm = () => {
    setEditId(null)
    setNombre('')
    setTipo('ahorros')
    setSaldo('')
  }

  const guardar = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (guardando) return
    setError('')
    setOk('')
    const nombreLimpio = nombre.trim()
    if (!nombreLimpio) {
      setError('Escribe un nombre para la cuenta.')
      return
    }
    const saldoTexto = saldo.trim()
    const saldoNum = saldoTexto ? desformatearCifra(saldoTexto) : 0
    if (saldoTexto && (!Number.isFinite(saldoNum) || !/\d/.test(saldoTexto))) {
      setError('Escribe un saldo numérico válido.')
      return
    }
    setGuardando(true)
    try {
      if (editId) {
        await actualizarCuentaBanco(editId, {
          nombre: nombreLimpio,
          tipo,
          saldoActual: Math.round(saldoNum),
        })
        setOk('Cuenta actualizada exitosamente.')
      } else {
        await crearCuentaBanco({
          nombre: nombreLimpio,
          tipo,
          saldoActual: Math.round(saldoNum),
        })
        setOk('Cuenta creada exitosamente.')
      }
      invalidarSnapshotFinanciero()
      limpiarForm()
      await cargar()
    } catch (err: any) {
      setError(err?.message || 'No se pudo guardar la cuenta.')
    } finally {
      setGuardando(false)
    }
  }

  const iniciarEdicion = (c: CuentaBanco) => {
    setError('')
    setOk('')
    setEditId(c.id)
    setNombre(c.nombre)
    setTipo(c.tipo)
    setSaldo(String(Math.round(Number(c.saldoActual) || 0)))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const borrar = async (c: CuentaBanco) => {
    if (eliminandoId) return
    if (!confirm(`¿Eliminar la cuenta "${c.nombre}"? Esta acción no elimina sus movimientos históricos.`)) return
    setEliminandoId(c.id)
    setError('')
    setOk('')
    try {
      await eliminarCuentaBanco(c.id)
      invalidarSnapshotFinanciero()
      if (editId === c.id) limpiarForm()
      setOk('Cuenta eliminada.')
      await cargar()
    } catch (err: any) {
      setError(err?.message || 'No se pudo eliminar la cuenta.')
    } finally {
      setEliminandoId(null)
    }
  }

  return (
    <motion.div
      className="space-y-4"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <Card className="glass-card overflow-hidden border-0">
        <div className="h-1 w-full bg-gradient-to-r from-sky-500 via-teal-400 to-emerald-400" />
        <CardHeader className="flex flex-row items-center justify-between border-b border-white/[0.06] px-4 py-3.5 sm:px-6">
          <CardTitle className="flex items-center gap-2 text-sm font-extrabold text-white sm:text-base">
            {editId ? <Edit3 className="h-4 w-4 text-emerald-300" /> : <PlusCircle className="h-4 w-4 text-emerald-300" />}
            <span>{editId ? 'Editar cuenta' : 'Nueva cuenta'}</span>
          </CardTitle>
          {editId && (
            <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-black text-emerald-300">
              Modo edición
            </span>
          )}
        </CardHeader>
        <CardContent className="p-4 text-xs sm:p-6">
          <form onSubmit={guardar} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 sm:col-span-2">
                <span className="font-bold text-mist-300">
                  Nombre <span className="text-red-300">*</span>
                </span>
                <Input
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej: Bancolombia Ahorros"
                  className="field-dark h-10 text-xs shadow-none"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="font-bold text-mist-300">Tipo</span>
                <select
                  className="field-dark h-10 rounded-xl px-2.5 text-xs font-medium outline-none"
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as CuentaBanco['tipo'])}
                >
                  {TIPOS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="font-bold text-mist-300">Saldo actual (COP)</span>
                <Input
                  cifra
                  value={saldo}
                  onChange={(e) => setSaldo(e.target.value)}
                  placeholder="0"
                  className="field-dark h-10 text-xs shadow-none"
                />
              </label>
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-xl border border-red-400/25 bg-red-500/10 p-2.5 font-medium text-red-300"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {ok && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-2.5 font-bold text-emerald-200">
                <Check className="h-4 w-4 shrink-0" />
                <span>{ok}</span>
              </div>
            )}

            <div className="flex items-center gap-2 border-t border-white/[0.06] pt-3">
              <Button
                type="submit"
                size="sm"
                disabled={guardando}
                className="h-9 cursor-pointer gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-400 px-4 text-xs font-bold text-[#04241a] hover:brightness-110"
              >
                <span>{guardando ? 'Guardando...' : editId ? 'Actualizar cuenta' : 'Crear cuenta'}</span>
              </Button>
              {editId && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={guardando}
                  onClick={() => {
                    limpiarForm()
                    setError('')
                    setOk('')
                  }}
                  className="h-9 cursor-pointer border-white/10 bg-transparent text-xs text-mist-300 hover:bg-white/5 hover:text-white"
                >
                  Cancelar edición
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="glass-card overflow-hidden border-0">
        <CardHeader className="flex flex-row items-center justify-between border-b border-white/[0.06] px-4 py-3.5 sm:px-6">
          <CardTitle className="flex items-center gap-2 text-sm font-extrabold text-white sm:text-base">
            <Wallet className="h-4 w-4 text-emerald-300" />
            <span>Mis cuentas</span>
          </CardTitle>
          <span className="text-[11px] font-semibold text-mist-500">
            {cuentas.length} {cuentas.length === 1 ? 'cuenta' : 'cuentas'}
          </span>
        </CardHeader>
        <CardContent className="p-0 text-xs">
          {cargando ? (
            <div className="space-y-2 p-6">
              <div className="animate-shimmer h-10 rounded-xl" />
              <div className="animate-shimmer h-10 rounded-xl" />
            </div>
          ) : cuentas.length === 0 ? (
            <div className="space-y-1 p-8 text-center">
              <p className="font-bold text-mist-300">No tienes cuentas registradas todavía</p>
              <p className="text-[11px] text-mist-600">Crea tu primera cuenta bancaria o efectivo arriba.</p>
            </div>
          ) : (
            <ul className="divide-y divide-white/[0.05]">
              {cuentas.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-3 p-3 transition-colors hover:bg-white/[0.03] sm:px-6"
                >
                  <div className="min-w-0">
                    <div className="truncate font-bold text-white">
                      {c.nombre}{' '}
                      <span className="font-medium text-mist-500">({ETIQUETA_TIPO[c.tipo] ?? c.tipo})</span>
                    </div>
                    <div className="mt-0.5 text-[11px] font-semibold text-emerald-300">
                      ${Math.round(Number(c.saldoActual) || 0).toLocaleString('es-CO')} COP
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={eliminandoId === c.id}
                      onClick={() => iniciarEdicion(c)}
                      aria-label={`Editar cuenta ${c.nombre}`}
                      className="h-8 cursor-pointer gap-1 text-xs text-mist-500 hover:bg-white/[0.06] hover:text-white"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Editar</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={eliminandoId !== null}
                      onClick={() => void borrar(c)}
                      aria-label={`Eliminar cuenta ${c.nombre}`}
                      className="h-8 cursor-pointer gap-1 text-xs text-mist-500 hover:bg-red-500/10 hover:text-red-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">{eliminandoId === c.id ? 'Eliminando...' : 'Eliminar'}</span>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

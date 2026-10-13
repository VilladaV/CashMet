import { useCallback, useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import Contador from '@/components/Contador'
import {
  actualizarMovimiento,
  eliminarMovimiento,
  listarCuentasBanco,
  listarMovimientos,
  obtenerResumenSaldos,
  type CuentaBanco,
  type MovimientoDoc,
  type TipoMovimiento,
} from '@/lib/firebase/movimientosRepo'
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  RefreshCw,
  Edit2,
  Trash2,
  Tag,
  CheckCircle2,
  Utensils,
  Car,
  Home,
  Briefcase,
  CreditCard,
  ShoppingBag,
  Sparkles,
} from 'lucide-react'

const COD = (n: number) => `$${n.toLocaleString('es-CO')} COP`

const TIPOS: TipoMovimiento[] = [
  'gasto',
  'ingreso',
  'transferencia',
  'pago_deuda',
  'pago_nomina',
  'impuesto',
  'seguro',
  'mantenimiento',
  'otro',
]

const ETIQUETA_TIPO: Record<TipoMovimiento, string> = {
  gasto: 'Gasto',
  ingreso: 'Ingreso',
  transferencia: 'Transferencia',
  pago_deuda: 'Pago deuda',
  pago_nomina: 'Pago nómina',
  impuesto: 'Impuesto',
  seguro: 'Seguro',
  mantenimiento: 'Mantenimiento',
  otro: 'Otro',
}

function getCategoriaIcon(cat = '', tipo = '') {
  const c = cat.toLowerCase()
  if (tipo === 'ingreso' || c.includes('sueldo') || c.includes('salario') || c.includes('nomina')) return Briefcase
  if (c.includes('comida') || c.includes('restaurante') || c.includes('almuerzo') || c.includes('cena')) return Utensils
  if (c.includes('mercado') || c.includes('compra')) return ShoppingBag
  if (c.includes('transporte') || c.includes('gasolina') || c.includes('carro') || c.includes('moto')) return Car
  if (c.includes('arriendo') || c.includes('hogar') || c.includes('servicios') || c.includes('luz')) return Home
  if (c.includes('deuda') || c.includes('credito') || c.includes('tarjeta')) return CreditCard
  return Tag
}

interface EdicionForm {
  fecha: string
  tipo: TipoMovimiento
  concepto: string
  monto: string
  categoria: string
  cuentaBancoId: string
}

const contenedor = {
  oculto: {},
  visible: { transition: { staggerChildren: 0.08 } },
}

const pieza = {
  oculto: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 260, damping: 26 } },
}

export default function DashboardPage() {
  const [total, setTotal] = useState<number | null>(null)
  const [numCuentas, setNumCuentas] = useState(0)
  const [movs, setMovs] = useState<MovimientoDoc[]>([])
  const [cuentas, setCuentas] = useState<CuentaBanco[]>([])
  const [ingresosMes, setIngresosMes] = useState(0)
  const [gastosMes, setGastosMes] = useState(0)
  const [error, setError] = useState('')
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [form, setForm] = useState<EdicionForm | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [cargando, setCargando] = useState(false)

  const cargar = useCallback(async () => {
    setError('')
    setCargando(true)
    try {
      const [{ cuentas: cuentasRes, total: totalRes }, movimientos, cuentasLista] = await Promise.all([
        obtenerResumenSaldos(),
        listarMovimientos(100),
        listarCuentasBanco(),
      ])
      setTotal(totalRes)
      setNumCuentas(cuentasRes.length)
      setMovs(movimientos)
      setCuentas(cuentasLista)

      const ahora = new Date()
      const prefijoMes = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`
      let ing = 0
      let gas = 0
      for (const m of movimientos) {
        if (!m.fecha?.startsWith(prefijoMes)) continue
        if (m.tipo === 'ingreso') ing += Number(m.monto) || 0
        else gas += Number(m.monto) || 0
      }
      setIngresosMes(ing)
      setGastosMes(gas)
    } catch {
      setError('No se pudieron cargar los datos financieros.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(() => cargar())
  }, [cargar])

  const borrar = async (id: string) => {
    if (!confirm('¿Eliminar este movimiento? Si tenía cuenta bancaria asociada, su saldo se revertirá automáticamente.')) return
    try {
      await eliminarMovimiento(id)
      if (editandoId === id) cerrarEdicion()
      cargar()
    } catch {
      setError('No se pudo eliminar el movimiento.')
    }
  }

  const abrirEdicion = (m: MovimientoDoc) => {
    setEditandoId(m.id)
    setError('')
    setForm({
      fecha: m.fecha || '',
      tipo: m.tipo,
      concepto: m.concepto || '',
      monto: String(m.monto ?? ''),
      categoria: m.categoria || '',
      cuentaBancoId: m.cuentaBancoId || '',
    })
  }

  const cerrarEdicion = () => {
    setEditandoId(null)
    setForm(null)
  }

  const guardarEdicion = async () => {
    if (!editandoId || !form) return
    const monto = Number(form.monto)
    if (!form.fecha || !form.concepto.trim() || !form.categoria.trim() || !Number.isFinite(monto) || monto <= 0) {
      setError('Completa fecha, concepto, categoría y un monto válido mayor a 0.')
      return
    }
    setGuardando(true)
    setError('')
    try {
      await actualizarMovimiento(editandoId, {
        fecha: form.fecha,
        tipo: form.tipo,
        concepto: form.concepto.trim(),
        monto,
        categoria: form.categoria.trim(),
        cuentaBancoId: form.cuentaBancoId || undefined,
      })
      cerrarEdicion()
      cargar()
    } catch {
      setError('No se pudo actualizar el movimiento.')
    } finally {
      setGuardando(false)
    }
  }

  const balanceMes = ingresosMes - gastosMes

  return (
    <motion.div className="space-y-4" variants={contenedor} initial="oculto" animate="visible">
      {/* HERO: PATRIMONIO TOTAL */}
      <motion.div
        variants={pieza}
        className="surface-glow relative overflow-hidden rounded-3xl bg-gradient-to-br from-night-800 via-night-850 to-night-900 p-5 sm:p-8"
      >
        <div className="animate-drift pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full bg-emerald-500/[0.12] blur-[100px]" />
        <div className="relative space-y-5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[11px] font-black tracking-[0.18em] text-emerald-300 uppercase">
              <Sparkles className="h-3.5 w-3.5" />
              Patrimonio total
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={cargar}
              disabled={cargando}
              className="h-8 cursor-pointer gap-1.5 border-white/10 bg-white/[0.05] px-3 text-xs text-mist-300 hover:bg-white/10 hover:text-white"
            >
              <RefreshCw className={`h-3 w-3 ${cargando ? 'animate-spin' : ''}`} />
              <span>{cargando ? 'Actualizando' : 'Actualizar'}</span>
            </Button>
          </div>

          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <div className="text-4xl font-black tracking-tight text-white sm:text-5xl">
                {total === null ? <span className="animate-shimmer rounded-lg text-transparent">0</span> : <Contador valor={total} formato={COD} />}
              </div>
              <div className="mt-2 text-xs text-mist-500">
                Pesos colombianos (COP) · {numCuentas} {numCuentas === 1 ? 'cuenta activa' : 'cuentas activas'}
              </div>
            </div>

            {cuentas.length > 0 && (
              <div className="flex max-w-xl flex-wrap gap-1.5">
                {cuentas.map((c) => (
                  <div
                    key={c.id}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-xs text-mist-300"
                  >
                    <Wallet className="h-3 w-3 text-emerald-300" />
                    <span className="font-bold text-white">{c.nombre}</span>
                    <span>${(c.saldoActual || 0).toLocaleString('es-CO')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* KPIs DEL MES */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <motion.div variants={pieza}>
          <Card className="glass-card card-hover-lift border-0">
            <CardContent className="space-y-2 p-5">
              <div className="flex items-center justify-between text-xs font-bold text-mist-500">
                <span>Ingresos del mes</span>
                <span className="rounded-xl bg-emerald-400/15 p-2 text-emerald-300">
                  <ArrowDownLeft className="h-4 w-4" />
                </span>
              </div>
              <div className="text-2xl font-black tracking-tight text-emerald-300">
                <Contador valor={ingresosMes} formato={COD} />
              </div>
              <div className="text-[11px] text-mist-600">Entradas registradas en el mes</div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={pieza}>
          <Card className="glass-card card-hover-lift border-0">
            <CardContent className="space-y-2 p-5">
              <div className="flex items-center justify-between text-xs font-bold text-mist-500">
                <span>Gastos del mes</span>
                <span className="rounded-xl bg-red-400/15 p-2 text-red-300">
                  <ArrowUpRight className="h-4 w-4" />
                </span>
              </div>
              <div className="text-2xl font-black tracking-tight text-red-300">
                <Contador valor={gastosMes} formato={COD} />
              </div>
              <div className="text-[11px] text-mist-600">Consumo y salidas acumuladas</div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={pieza}>
          <Card className="glass-card card-hover-lift border-0">
            <CardContent className="space-y-2 p-5">
              <div className="flex items-center justify-between text-xs font-bold text-mist-500">
                <span>Balance neto</span>
                <span className={`rounded-xl p-2 ${balanceMes >= 0 ? 'bg-sky-400/15 text-sky-300' : 'bg-amber-400/15 text-amber-300'}`}>
                  <TrendingUp className="h-4 w-4" />
                </span>
              </div>
              <div className={`text-2xl font-black tracking-tight ${balanceMes >= 0 ? 'text-white' : 'text-amber-300'}`}>
                <Contador valor={balanceMes} formato={COD} />
              </div>
              <div className="text-[11px] text-mist-600">
                {balanceMes >= 0 ? 'Superávit positivo, bien ahí' : 'Déficit: conviene revisar el mes'}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-400/25 bg-red-500/10 p-3 text-xs font-medium text-red-300">
          {error}
        </div>
      )}

      {/* PANEL DE EDICIÓN */}
      {form && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 28 }}>
          <Card className="border border-emerald-400/25 bg-emerald-400/[0.06]">
            <CardHeader className="border-b border-white/[0.06] px-4 py-3">
              <CardTitle className="flex items-center gap-2 text-sm font-bold text-white">
                <Edit2 className="h-4 w-4 text-emerald-300" />
                <span>Modificar movimiento</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4 text-xs">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="font-bold text-mist-300">Fecha</span>
                  <Input
                    type="date"
                    value={form.fecha}
                    onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                    className="field-dark h-9 text-xs"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="font-bold text-mist-300">Tipo</span>
                  <select
                    className="field-dark h-9 rounded-xl px-2 text-xs font-medium outline-none"
                    value={form.tipo}
                    onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoMovimiento })}
                  >
                    {TIPOS.map((t) => (
                      <option key={t} value={t}>
                        {ETIQUETA_TIPO[t]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 sm:col-span-2">
                  <span className="font-bold text-mist-300">Concepto</span>
                  <Input
                    value={form.concepto}
                    onChange={(e) => setForm({ ...form, concepto: e.target.value })}
                    className="field-dark h-9 text-xs"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="font-bold text-mist-300">Monto (COP)</span>
                  <Input
                    type="number"
                    min="0"
                    value={form.monto}
                    onChange={(e) => setForm({ ...form, monto: e.target.value })}
                    className="field-dark h-9 text-xs font-bold"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="font-bold text-mist-300">Categoría</span>
                  <Input
                    value={form.categoria}
                    onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                    className="field-dark h-9 text-xs"
                  />
                </label>

                <label className="flex flex-col gap-1 sm:col-span-2">
                  <span className="font-bold text-mist-300">Cuenta bancaria</span>
                  <select
                    className="field-dark h-9 rounded-xl px-2 text-xs font-medium outline-none"
                    value={form.cuentaBancoId}
                    onChange={(e) => setForm({ ...form, cuentaBancoId: e.target.value })}
                  >
                    <option value="">Sin cuenta vinculada (no altera saldos)</option>
                    {cuentas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre} (Saldo: ${c.saldoActual?.toLocaleString('es-CO')})
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex gap-2 border-t border-white/[0.06] pt-3">
                <Button
                  size="sm"
                  className="h-9 cursor-pointer gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-400 px-4 text-xs font-bold text-[#04241a] hover:brightness-110"
                  disabled={guardando}
                  onClick={guardarEdicion}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>{guardando ? 'Guardando...' : 'Aplicar cambios'}</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 cursor-pointer border-white/10 bg-transparent text-xs text-mist-300 hover:bg-white/5 hover:text-white"
                  disabled={guardando}
                  onClick={cerrarEdicion}
                >
                  Cancelar
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* HISTORIAL */}
      <motion.div variants={pieza}>
        <Card className="glass-card overflow-hidden border-0">
          <CardHeader className="flex flex-row items-center justify-between border-b border-white/[0.06] px-4 py-3.5 sm:px-6">
            <CardTitle className="text-sm font-extrabold text-white">Movimientos recientes</CardTitle>
            <span className="text-[11px] font-semibold text-mist-500">{movs.length} registrados</span>
          </CardHeader>

          <CardContent className="p-0 text-xs">
            {movs.length === 0 ? (
              <div className="space-y-1 p-8 text-center">
                <p className="font-bold text-mist-300">Sin movimientos todavía</p>
                <p className="text-[11px] text-mist-600">Escribe un gasto o ingreso en el Chat IA para comenzar.</p>
              </div>
            ) : (
              <ul className="divide-y divide-white/[0.05]">
                {movs.slice(0, 20).map((m) => {
                  const IconCat = getCategoriaIcon(m.categoria, m.tipo)
                  const esIng = m.tipo === 'ingreso'
                  return (
                    <li
                      key={m.id}
                      className="flex items-center justify-between gap-3 p-3 transition-colors hover:bg-white/[0.03] sm:px-5"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                            esIng ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/[0.06] text-mist-300'
                          }`}
                        >
                          <IconCat className="h-4 w-4" />
                        </div>

                        <div className="min-w-0">
                          <div className="truncate text-xs font-bold text-white sm:text-sm">{m.concepto}</div>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-mist-500">
                            <span>{m.fecha}</span>
                            <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-semibold">
                              {m.categoria || 'General'}
                            </span>
                            {m.cuentaBancoId && (
                              <span>· {cuentas.find((c) => c.id === m.cuentaBancoId)?.nombre || 'Cuenta'}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                        <div className={`text-right text-xs font-black sm:text-sm ${esIng ? 'text-emerald-300' : 'text-white'}`}>
                          {esIng ? '+' : '-'}{COD(Number(m.monto) || 0)}
                        </div>

                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 cursor-pointer text-mist-600 hover:bg-white/[0.06] hover:text-white"
                            onClick={() => (editandoId === m.id ? cerrarEdicion() : abrirEdicion(m))}
                            title="Editar movimiento"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 cursor-pointer text-mist-600 hover:bg-red-500/10 hover:text-red-300"
                            onClick={() => borrar(m.id)}
                            title="Eliminar movimiento"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}

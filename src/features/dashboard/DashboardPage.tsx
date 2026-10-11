import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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
    cargar()
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
    <div className="container mx-auto p-2 sm:p-4 max-w-5xl space-y-4">
      {/* HERO BANNER: SALDO TOTAL + CUENTAS */}
      <div className="relative rounded-2xl overflow-hidden gradient-brand-navy p-5 sm:p-7 text-white shadow-xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-60 h-60 bg-sky-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold tracking-wider uppercase text-emerald-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Patrimonio Financiero Total
              </span>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={cargar}
              disabled={cargando}
              className="h-7 px-2.5 text-xs bg-white/10 hover:bg-white/20 text-white border-white/20 gap-1.5"
            >
              <RefreshCw className={`w-3 h-3 ${cargando ? 'animate-spin' : ''}`} />
              <span>{cargando ? 'Actualizando' : 'Actualizar'}</span>
            </Button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
            <div>
              <div className="text-3xl sm:text-4xl font-extrabold tracking-tight">
                {total === null ? 'Cargando...' : COD(total)}
              </div>
              <div className="text-xs text-slate-300 mt-1">
                Moneda base: Peso Colombiano (COP) · {numCuentas} {numCuentas === 1 ? 'cuenta activa' : 'cuentas activas'}
              </div>
            </div>

            {/* Pill de Cuentas */}
            {cuentas.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2 sm:pt-0 max-w-md">
                {cuentas.map((c) => (
                  <div
                    key={c.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 border border-white/15 text-xs text-slate-100"
                  >
                    <Wallet className="w-3 h-3 text-emerald-400" />
                    <span className="font-semibold">{c.nombre}:</span>
                    <span>${(c.saldoActual || 0).toLocaleString('es-CO')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* KPI METRICS (MES ACTUAL) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Ingresos del Mes */}
        <Card className="glass-card border-slate-200/90 shadow-xs card-hover-lift">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>Ingresos del Mes</span>
              <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
                <ArrowDownLeft className="w-4 h-4" />
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-emerald-700">
              {COD(ingresosMes)}
            </div>
            <div className="text-[11px] text-slate-500">Entradas registradas en el mes</div>
          </CardContent>
        </Card>

        {/* Gastos del Mes */}
        <Card className="glass-card border-slate-200/90 shadow-xs card-hover-lift">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>Gastos del Mes</span>
              <div className="p-1.5 rounded-lg bg-red-100 text-red-700">
                <ArrowUpRight className="w-4 h-4" />
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-red-600">
              {COD(gastosMes)}
            </div>
            <div className="text-[11px] text-slate-500">Consumo y salidas acumuladas</div>
          </CardContent>
        </Card>

        {/* Balance Neto */}
        <Card className="glass-card border-slate-200/90 shadow-xs card-hover-lift">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>Balance Neto (Mes)</span>
              <div className={`p-1.5 rounded-lg ${balanceMes >= 0 ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className={`text-xl sm:text-2xl font-bold ${balanceMes >= 0 ? 'text-[#0A2540]' : 'text-amber-700'}`}>
              {COD(balanceMes)}
            </div>
            <div className="text-[11px] text-slate-500">
              {balanceMes >= 0 ? 'Ahorro superávit positivo' : 'Déficit en el periodo actual'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ERROR MESSAGE */}
      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
          {error}
        </div>
      )}

      {/* MODAL / PANEL DE EDICIÓN DE MOVIMIENTO */}
      {form && (
        <Card className="border-emerald-300 bg-emerald-50/20 shadow-md">
          <CardHeader className="py-3 px-4 border-b border-emerald-100">
            <CardTitle className="text-sm font-bold text-emerald-950 flex items-center gap-2">
              <Edit2 className="w-4 h-4 text-emerald-600" />
              <span>Modificar Movimiento Registrado</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <label className="flex flex-col gap-1">
                <span className="font-semibold text-slate-700">Fecha</span>
                <Input
                  type="date"
                  value={form.fecha}
                  onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                  className="h-8 text-xs bg-white border-slate-200"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="font-semibold text-slate-700">Tipo</span>
                <select
                  className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
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

              <label className="sm:col-span-2 flex flex-col gap-1">
                <span className="font-semibold text-slate-700">Concepto</span>
                <Input
                  value={form.concepto}
                  onChange={(e) => setForm({ ...form, concepto: e.target.value })}
                  className="h-8 text-xs bg-white border-slate-200"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="font-semibold text-slate-700">Monto (COP)</span>
                <Input
                  type="number"
                  min="0"
                  value={form.monto}
                  onChange={(e) => setForm({ ...form, monto: e.target.value })}
                  className="h-8 text-xs bg-white border-slate-200 font-bold"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="font-semibold text-slate-700">Categoría</span>
                <Input
                  value={form.categoria}
                  onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                  className="h-8 text-xs bg-white border-slate-200"
                />
              </label>

              <label className="sm:col-span-2 flex flex-col gap-1">
                <span className="font-semibold text-slate-700">Cuenta Bancaria</span>
                <select
                  className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
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

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <Button
                size="sm"
                className="gradient-brand-growth text-white hover:opacity-90 font-semibold text-xs h-8 gap-1.5"
                disabled={guardando}
                onClick={guardarEdicion}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{guardando ? 'Guardando...' : 'Aplicar Cambios'}</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-8 border-slate-200"
                disabled={guardando}
                onClick={cerrarEdicion}
              >
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* LISTADO DE ÚLTIMOS MOVIMIENTOS */}
      <Card className="glass-card border-slate-200/90 shadow-xs overflow-hidden">
        <CardHeader className="py-3 px-4 border-b border-slate-100 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-bold text-slate-900">
            Historial de Movimientos Recientes
          </CardTitle>
          <span className="text-[11px] text-slate-500">
            {movs.length} registrados
          </span>
        </CardHeader>

        <CardContent className="p-0 text-xs divide-y divide-slate-100">
          {movs.length === 0 ? (
            <div className="p-8 text-center text-slate-500 space-y-1">
              <p className="font-semibold">Sin movimientos registrados todavía</p>
              <p className="text-[11px]">Escribe un gasto o ingreso en el Chat IA para comenzar.</p>
            </div>
          ) : (
            movs.slice(0, 20).map((m) => {
              const IconCat = getCategoriaIcon(m.categoria, m.tipo)
              const esIng = m.tipo === 'ingreso'
              return (
                <div
                  key={m.id}
                  className="flex items-center justify-between p-3 sm:px-4 hover:bg-slate-50/80 transition-colors gap-3"
                >
                  {/* Icono + Concepto + Metadatos */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        esIng ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      <IconCat className="w-4 h-4" />
                    </div>

                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 truncate text-xs sm:text-sm">
                        {m.concepto}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 flex-wrap">
                        <span>{m.fecha}</span>
                        <span>•</span>
                        <span className="px-1.5 py-0.2 rounded-md bg-slate-100 font-medium">
                          {m.categoria || 'General'}
                        </span>
                        {m.cuentaBancoId && (
                          <span className="text-slate-400">
                            • {cuentas.find((c) => c.id === m.cuentaBancoId)?.nombre || 'Cuenta'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Monto + Botones de Acción */}
                  <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    <div
                      className={`font-extrabold text-xs sm:text-sm text-right ${
                        esIng ? 'text-emerald-700' : 'text-slate-900'
                      }`}
                    >
                      {esIng ? '+' : '-'}
                      {COD(Number(m.monto) || 0)}
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                        onClick={() => (editandoId === m.id ? cerrarEdicion() : abrirEdicion(m))}
                        title="Editar movimiento"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-slate-400 hover:text-red-700 hover:bg-red-50"
                        onClick={() => borrar(m.id)}
                        title="Eliminar movimiento"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>
    </div>
  )
}

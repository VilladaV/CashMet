import { useEffect, useState } from 'react'
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

  const cargar = async () => {
    setError('')
    try {
      const [{ cuentas, total }, movimientos, cuentasLista] = await Promise.all([
        obtenerResumenSaldos(),
        listarMovimientos(100),
        listarCuentasBanco(),
      ])
      setTotal(total)
      setNumCuentas(cuentas.length)
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
      setError('No se pudieron cargar los datos. Verifica tu sesión y las reglas de Firestore.')
    }
  }

  useEffect(() => {
    cargar()
  }, [])

  const borrar = async (id: string) => {
    if (!confirm('¿Eliminar este movimiento? Si tenía cuenta, se ajustará su saldo.')) return
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

  return (
    <div className="container mx-auto p-4 max-w-4xl space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Dashboard</CardTitle>
          <Button size="sm" variant="outline" onClick={cargar}>
            Actualizar
          </Button>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {error && <div className="text-xs text-red-600">{error}</div>}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Saldo total</div>
              <div className="text-lg font-semibold">{total === null ? '—' : COD(total)}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Cuentas</div>
              <div className="text-lg font-semibold">{numCuentas}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Ingresos (mes)</div>
              <div className="text-lg font-semibold text-green-700">{COD(ingresosMes)}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Gastos (mes)</div>
              <div className="text-lg font-semibold text-red-600">{COD(gastosMes)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {form && (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle className="text-base">Editar movimiento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Fecha</span>
                <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Tipo</span>
                <select
                  className="h-9 rounded-md border bg-background px-2 text-sm"
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
              <label className="col-span-2 flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Concepto</span>
                <Input value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Monto (COP)</span>
                <Input
                  type="number"
                  min="0"
                  value={form.monto}
                  onChange={(e) => setForm({ ...form, monto: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Categoría</span>
                <Input value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} />
              </label>
              <label className="col-span-2 flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Cuenta</span>
                <select
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={form.cuentaBancoId}
                  onChange={(e) => setForm({ ...form, cuentaBancoId: e.target.value })}
                >
                  <option value="">Sin cuenta (no afecta saldos)</option>
                  {cuentas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={guardando} onClick={guardarEdicion}>
                {guardando ? 'Guardando...' : 'Guardar cambios'}
              </Button>
              <Button size="sm" variant="outline" disabled={guardando} onClick={cerrarEdicion}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Últimos movimientos</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {movs.length === 0 ? (
            <p className="text-muted-foreground">Sin movimientos todavía. Registra uno desde el Chat.</p>
          ) : (
            <ul className="divide-y">
              {movs.slice(0, 15).map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    {m.fecha} — {m.concepto}
                    <span className="text-muted-foreground"> ({m.categoria})</span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className={m.tipo === 'ingreso' ? 'text-green-700 font-medium' : 'text-red-600 font-medium'}>
                      {m.tipo === 'ingreso' ? '+' : '-'}
                      {COD(Number(m.monto) || 0)}
                    </span>
                    <Button
                      size="sm"
                      variant={editandoId === m.id ? 'default' : 'outline'}
                      onClick={() => (editandoId === m.id ? cerrarEdicion() : abrirEdicion(m))}
                    >
                      Editar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => borrar(m.id)}>
                      Eliminar
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

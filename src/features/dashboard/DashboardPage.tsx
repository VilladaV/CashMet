import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  eliminarMovimiento,
  listarMovimientos,
  obtenerResumenSaldos,
  type MovimientoDoc,
} from '@/lib/firebase/movimientosRepo'

const COD = (n: number) => `$${n.toLocaleString('es-CO')} COP`

export default function DashboardPage() {
  const [total, setTotal] = useState<number | null>(null)
  const [numCuentas, setNumCuentas] = useState(0)
  const [movs, setMovs] = useState<MovimientoDoc[]>([])
  const [ingresosMes, setIngresosMes] = useState(0)
  const [gastosMes, setGastosMes] = useState(0)
  const [error, setError] = useState('')

  const cargar = async () => {
    setError('')
    try {
      const [{ cuentas, total }, movimientos] = await Promise.all([
        obtenerResumenSaldos(),
        listarMovimientos(100),
      ])
      setTotal(total)
      setNumCuentas(cuentas.length)
      setMovs(movimientos)

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
      cargar()
    } catch {
      setError('No se pudo eliminar el movimiento.')
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

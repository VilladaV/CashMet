import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { crearCuentaBanco, listarCuentasBanco, type CuentaBanco } from '@/lib/firebase/movimientosRepo'

const TIPOS: CuentaBanco['tipo'][] = ['ahorros', 'corriente', 'digital', 'efectivo', 'inversion']

export default function CuentasPage() {
  const [cuentas, setCuentas] = useState<CuentaBanco[]>([])
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<CuentaBanco['tipo']>('ahorros')
  const [saldo, setSaldo] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const cargar = () =>
    listarCuentasBanco()
      .then(setCuentas)
      .catch(() => setError('No se pudieron cargar las cuentas.'))

  useEffect(() => {
    cargar()
  }, [])

  const guardar = async () => {
    setError('')
    setOk('')
    const saldoNum = Number(saldo.replace(/[^\d.-]/g, '')) || 0
    if (!nombre.trim()) {
      setError('Escribe un nombre para la cuenta.')
      return
    }
    try {
      await crearCuentaBanco({ nombre: nombre.trim(), tipo, saldoActual: saldoNum })
      setNombre('')
      setSaldo('')
      setOk('Cuenta creada.')
      cargar()
    } catch {
      setError('No se pudo crear la cuenta. Verifica las reglas de Firestore.')
    }
  }

  return (
    <div className="container mx-auto p-4 max-w-3xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Nueva cuenta</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <label className="col-span-2 flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Nombre</span>
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Bancolombia Ahorros" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Tipo</span>
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={tipo}
                onChange={(e) => setTipo(e.target.value as CuentaBanco['tipo'])}
              >
                {TIPOS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Saldo actual (COP)</span>
              <Input inputMode="numeric" value={saldo} onChange={(e) => setSaldo(e.target.value)} placeholder="0" />
            </label>
          </div>
          {error && <div className="text-xs text-red-600">{error}</div>}
          {ok && <div className="text-xs text-green-700">{ok}</div>}
          <Button size="sm" onClick={guardar}>
            Crear cuenta
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mis cuentas</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {cuentas.length === 0 ? (
            <p className="text-muted-foreground">Sin cuentas todavía.</p>
          ) : (
            <ul className="divide-y">
              {cuentas.map((c) => (
                <li key={c.id} className="flex justify-between py-2">
                  <span>
                    {c.nombre} <span className="text-muted-foreground">({c.tipo})</span>
                  </span>
                  <span className="font-medium">${(Number(c.saldoActual) || 0).toLocaleString('es-CO')}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

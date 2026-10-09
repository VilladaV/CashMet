import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { BorradorMovimiento } from '@/ai/parser/nl'
import type { CuentaBanco } from '@/lib/firebase/movimientosRepo'

export interface MovimientoConfirmado extends BorradorMovimiento {
  cuentaBancoId?: string
}

interface Props {
  borrador: BorradorMovimiento
  cuentas: CuentaBanco[]
  guardando: boolean
  onConfirm: (data: MovimientoConfirmado) => void
  onCancel: () => void
}

export default function ConfirmacionCard({ borrador, cuentas, guardando, onConfirm, onCancel }: Props) {
  const [tipo, setTipo] = useState(borrador.tipo)
  const [fecha, setFecha] = useState(borrador.fecha)
  const [concepto, setConcepto] = useState(borrador.concepto)
  const [monto, setMonto] = useState(String(borrador.monto))
  const [categoria, setCategoria] = useState(borrador.categoria)
  const [cuentaBancoId, setCuentaBancoId] = useState('')

  const montoNum = Number(monto.replace(/[^\d.]/g, '')) || 0

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-2 text-sm">
      <div className="font-medium text-amber-900">Confirmar movimiento</div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Tipo</span>
          <select
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as 'gasto' | 'ingreso')}
          >
            <option value="gasto">Gasto</option>
            <option value="ingreso">Ingreso</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Fecha</span>
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </label>
        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Concepto</span>
          <Input value={concepto} onChange={(e) => setConcepto(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Monto (COP)</span>
          <Input inputMode="numeric" value={monto} onChange={(e) => setMonto(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Categoría</span>
          <Input value={categoria} onChange={(e) => setCategoria(e.target.value)} />
        </label>
        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Cuenta (opcional)</span>
          <select
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={cuentaBancoId}
            onChange={(e) => setCuentaBancoId(e.target.value)}
          >
            <option value="">Sin cuenta</option>
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} ({(c.saldoActual || 0).toLocaleString('es-CO')} COP)
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          disabled={guardando || montoNum <= 0 || !concepto.trim()}
          onClick={() =>
            onConfirm({
              tipo,
              fecha,
              concepto: concepto.trim(),
              monto: montoNum,
              categoria: categoria.trim() || 'Otros',
              cuentaBancoId: cuentaBancoId || undefined,
            })
          }
        >
          {guardando ? 'Guardando...' : 'Confirmar y guardar'}
        </Button>
        <Button size="sm" variant="outline" disabled={guardando} onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}

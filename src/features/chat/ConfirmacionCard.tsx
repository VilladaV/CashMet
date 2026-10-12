import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { BorradorMovimiento } from '@/ai/parser/nl'
import type { CuentaBanco } from '@/lib/firebase/movimientosRepo'
import { CheckCircle2, XCircle, ArrowDownLeft, ArrowUpRight, Wallet, Tag, Calendar as CalendarIcon } from 'lucide-react'

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
  const esIngreso = tipo === 'ingreso'

  return (
    <div className="rounded-xl border border-emerald-200/90 bg-white p-4 space-y-3 shadow-md">
      {/* Cabecera del borrador */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${esIngreso ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
            {esIngreso ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
          </div>
          <div>
            <div className="font-bold text-xs text-slate-900">Confirmar Movimiento</div>
            <div className="text-[11px] text-slate-500">Revisa o ajusta antes de guardar en Firestore</div>
          </div>
        </div>

        <div className={`text-xs font-bold px-2 py-0.5 rounded-full ${
          esIngreso ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          ${montoNum.toLocaleString('es-CO')} COP
        </div>
      </div>

      {/* Formulario editable */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <label className="flex flex-col gap-1">
          <span className="font-semibold text-slate-600 flex items-center gap-1">
            Tipo
          </span>
          <select
            className="h-8 rounded-lg border border-slate-200 bg-slate-50/70 px-2 text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as 'gasto' | 'ingreso')}
          >
            <option value="gasto">Gasto (-)</option>
            <option value="ingreso">Ingreso (+)</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-semibold text-slate-600 flex items-center gap-1">
            <CalendarIcon className="w-3 h-3 text-slate-400" /> Fecha
          </span>
          <Input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="h-8 text-xs bg-slate-50/70 border-slate-200 focus-visible:ring-emerald-500"
          />
        </label>

        <label className="col-span-2 flex flex-col gap-1">
          <span className="font-semibold text-slate-600">Concepto</span>
          <Input
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            placeholder="Ej: Almuerzo, Mercado, Gasolina..."
            className="h-8 text-xs bg-slate-50/70 border-slate-200 focus-visible:ring-emerald-500"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-semibold text-slate-600">Monto (COP)</span>
          <Input
            inputMode="numeric"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            className="h-8 text-xs bg-slate-50/70 border-slate-200 focus-visible:ring-emerald-500 font-semibold"
          />
        </label>

        {borrador.moneda && borrador.montoOriginal != null && (
          <p className="col-span-2 -mt-1 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
            Monto original: {borrador.moneda} {borrador.montoOriginal.toLocaleString('es-CO')}
            {borrador.tasaCambio
              ? ` · tasa: 1 ${borrador.moneda} = $${borrador.tasaCambio.toLocaleString('es-CO', {
                  maximumFractionDigits: 2,
                })} COP`
              : ' · no se pudo obtener la tasa, escribe el valor en pesos'}
          </p>
        )}

        <label className="flex flex-col gap-1">
          <span className="font-semibold text-slate-600 flex items-center gap-1">
            <Tag className="w-3 h-3 text-slate-400" /> Categoría
          </span>
          <Input
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className="h-8 text-xs bg-slate-50/70 border-slate-200 focus-visible:ring-emerald-500"
          />
        </label>

        <label className="col-span-2 flex flex-col gap-1">
          <span className="font-semibold text-slate-600 flex items-center gap-1">
            <Wallet className="w-3 h-3 text-slate-400" /> Afectar cuenta bancaria
          </span>
          <select
            className="h-8 rounded-lg border border-slate-200 bg-slate-50/70 px-2 text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
            value={cuentaBancoId}
            onChange={(e) => setCuentaBancoId(e.target.value)}
          >
            <option value="">(Opcional) No descontar de ninguna cuenta</option>
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} (Saldo actual: ${(c.saldoActual || 0).toLocaleString('es-CO')} COP)
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Botones de acción */}
      <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
        <Button
          size="sm"
          className="gradient-brand-growth text-white hover:opacity-90 font-semibold text-xs h-8 gap-1.5 shadow-xs"
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
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>{guardando ? 'Guardando en BD...' : 'Confirmar y Guardar'}</span>
        </Button>

        <Button
          size="sm"
          variant="outline"
          className="text-xs h-8 text-slate-600 hover:bg-slate-100 border-slate-200 gap-1"
          disabled={guardando}
          onClick={onCancel}
        >
          <XCircle className="w-3.5 h-3.5 text-slate-400" />
          <span>Descartar</span>
        </Button>
      </div>
    </div>
  )
}

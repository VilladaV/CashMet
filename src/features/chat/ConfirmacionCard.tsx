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
    <div className="space-y-3 rounded-2xl border border-emerald-400/25 bg-gradient-to-b from-emerald-400/[0.1] to-transparent p-4">
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.07] pb-2.5">
        <div className="flex items-center gap-2">
          <div className={`rounded-xl p-1.5 ${esIngreso ? 'bg-emerald-400/20 text-emerald-300' : 'bg-red-400/20 text-red-300'}`}>
            {esIngreso ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
          </div>
          <div>
            <div className="text-xs font-extrabold text-white">Confirmar movimiento</div>
            <div className="text-[11px] text-mist-500">Revisa o ajusta antes de guardar</div>
          </div>
        </div>

        <div className={`rounded-full border px-2.5 py-1 text-xs font-black ${
          esIngreso
            ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
            : 'border-red-400/30 bg-red-400/10 text-red-200'
        }`}>
          ${montoNum.toLocaleString('es-CO')} COP
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <label className="flex flex-col gap-1">
          <span className="font-bold text-mist-300">Tipo</span>
          <select
            className="field-dark h-9 rounded-xl px-2 text-xs font-medium outline-none"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as 'gasto' | 'ingreso')}
          >
            <option value="gasto">Gasto (-)</option>
            <option value="ingreso">Ingreso (+)</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="flex items-center gap-1 font-bold text-mist-300">
            <CalendarIcon className="h-3 w-3 text-mist-600" /> Fecha
          </span>
          <Input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="field-dark h-9 text-xs shadow-none"
          />
        </label>

        <label className="col-span-2 flex flex-col gap-1">
          <span className="font-bold text-mist-300">Concepto</span>
          <Input
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            placeholder="Ej: Almuerzo, Mercado, Gasolina..."
            className="field-dark h-9 text-xs shadow-none"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-bold text-mist-300">Monto (COP)</span>
          <Input
            inputMode="numeric"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            className="field-dark h-9 text-xs font-bold shadow-none"
          />
        </label>

        {borrador.moneda && borrador.montoOriginal != null && (
          <p className="col-span-2 -mt-1 rounded-lg bg-amber-400/10 px-2 py-1.5 text-[11px] font-semibold text-amber-200">
            Monto original: {borrador.moneda} {borrador.montoOriginal.toLocaleString('es-CO')}
            {borrador.tasaCambio
              ? ` · tasa: 1 ${borrador.moneda} = $${borrador.tasaCambio.toLocaleString('es-CO', {
                  maximumFractionDigits: 2,
                })} COP`
              : ' · no se pudo obtener la tasa, escribe el valor en pesos'}
          </p>
        )}

        <label className="flex flex-col gap-1">
          <span className="flex items-center gap-1 font-bold text-mist-300">
            <Tag className="h-3 w-3 text-mist-600" /> Categoría
          </span>
          <Input
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className="field-dark h-9 text-xs shadow-none"
          />
        </label>

        <label className="col-span-2 flex flex-col gap-1">
          <span className="flex items-center gap-1 font-bold text-mist-300">
            <Wallet className="h-3 w-3 text-mist-600" /> Afectar cuenta bancaria
          </span>
          <select
            className="field-dark h-9 rounded-xl px-2 text-xs font-medium outline-none"
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

      <div className="flex items-center gap-2 border-t border-white/[0.07] pt-2.5">
        <Button
          size="sm"
          className="h-9 cursor-pointer gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-400 text-xs font-bold text-[#04241a] hover:brightness-110"
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
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>{guardando ? 'Guardando...' : 'Confirmar y guardar'}</span>
        </Button>

        <Button
          size="sm"
          variant="outline"
          className="h-9 cursor-pointer gap-1 border-white/10 bg-transparent text-xs text-mist-300 hover:bg-white/5 hover:text-white"
          disabled={guardando}
          onClick={onCancel}
        >
          <XCircle className="h-3.5 w-3.5" />
          <span>Descartar</span>
        </Button>
      </div>
    </div>
  )
}

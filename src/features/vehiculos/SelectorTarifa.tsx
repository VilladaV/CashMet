import { useState } from 'react'
import {
  TARIFAS_SOAT_COLOMBIA,
  TARIFAS_TM_COLOMBIA,
  sugerirTarifaSoat,
  sugerirTarifaTM,
  type TarifaVehiculo,
} from './tarifasColombia'
import { Sparkles, ChevronDown, Calculator } from 'lucide-react'

interface Props {
  tipoTarifa: 'soat' | 'tm'
  tipoVehiculo?: string
  cilindraje?: number | null
  modelo?: number | null
  onSeleccionar: (valor: number, descripcion?: string) => void
}

const COD = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`

export default function SelectorTarifa({
  tipoTarifa,
  tipoVehiculo = 'carro',
  cilindraje,
  modelo,
  onSeleccionar,
}: Props) {
  const [abierto, setAbierto] = useState(false)
  const [filtroCategoria, setFiltroCategoria] = useState<string>('todas')

  const tarifas = tipoTarifa === 'soat' ? TARIFAS_SOAT_COLOMBIA : TARIFAS_TM_COLOMBIA
  const sugerida =
    tipoTarifa === 'soat'
      ? sugerirTarifaSoat(tipoVehiculo, cilindraje, modelo)
      : sugerirTarifaTM(tipoVehiculo, modelo)

  const categorias = Array.from(new Set(tarifas.map((t) => t.categoria)))

  const tarifasFiltradas =
    filtroCategoria === 'todas'
      ? tarifas
      : tarifas.filter((t) => t.categoria === filtroCategoria)

  const seleccionar = (t: TarifaVehiculo) => {
    onSeleccionar(t.valor, t.descripcion)
    setAbierto(false)
  }

  return (
    <div className="relative mt-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-sky-400/25 bg-sky-400/[0.08] px-2.5 py-1 text-[11px] font-bold text-sky-200 transition hover:bg-sky-400/15"
        >
          <Calculator className="h-3 w-3" />
          <span>Elegir tarifa oficial de Colombia</span>
          <ChevronDown className={`h-3 w-3 transition-transform ${abierto ? 'rotate-180' : ''}`} />
        </button>

        {sugerida && (
          <button
            type="button"
            onClick={() => seleccionar(sugerida)}
            title="Aplicar tarifa sugerida automáticamente según el tipo y cilindraje del vehículo"
            className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold text-emerald-300 transition hover:bg-emerald-400/20"
          >
            <Sparkles className="h-3 w-3" />
            <span>Sugerida: {COD(sugerida.valor)}</span>
          </button>
        )}
      </div>

      {abierto && (
        <div className="surface-glow absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-2xl border border-white/15 bg-night-900/95 p-3 shadow-2xl backdrop-blur-xl">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-1 border-b border-white/10 pb-2">
            <span className="text-[11px] font-extrabold text-white">
              Tarifas oficiales {tipoTarifa === 'soat' ? 'SOAT (Superfinanciera)' : 'Tecnomecánica CDA'}
            </span>
            <select
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value)}
              className="field-dark h-7 rounded-lg px-2 text-[10px] font-medium"
            >
              <option value="todas">Todas las categorías</option>
              {categorias.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            {tarifasFiltradas.map((t) => {
              const esSugerida = sugerida?.id === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => seleccionar(t)}
                  className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl border p-2 text-left text-xs transition ${
                    esSugerida
                      ? 'border-emerald-400/40 bg-emerald-400/10 hover:bg-emerald-400/20'
                      : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.06]'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 font-bold text-white">
                      <span>{t.subcategoria}</span>
                      {esSugerida && (
                        <span className="rounded-full bg-emerald-400/20 px-1.5 py-0.2 text-[9px] font-bold text-emerald-300">
                          Sugerida
                        </span>
                      )}
                    </div>
                    <div className="truncate text-[10px] text-mist-500">{t.descripcion}</div>
                  </div>
                  <div className="shrink-0 text-right font-mono text-xs font-black text-emerald-300">
                    {COD(t.valor)}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

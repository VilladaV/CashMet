import { useState } from 'react'
import type { VehiculoOperativo } from './types'
import TanqueCombustible from './TanqueCombustible'
import { Truck, Wrench, Shield, Compass } from 'lucide-react'

interface Props {
  vehiculos: VehiculoOperativo[]
  onActualizarVehiculo: (id: string, parcial: Partial<VehiculoOperativo>) => void
  onTanquearVehiculo: (id: string) => Promise<void>
}

const ETIQUETA_ROL: Record<VehiculoOperativo['rolOperativo'], { label: string; icon: typeof Truck }> = {
  rescate_pesado: { label: 'Rescate Pesado 4x4 (Winche/Trocha)', icon: Truck },
  transporte_rural_escolar: { label: 'Ruta Escolar Rural (Transporte Niños)', icon: Compass },
  campero_trochero: { label: 'Campero Trochero (Veredas / Ayudas)', icon: Shield },
  apoyo_rapido: { label: 'Apoyo Rápido / Mensajería Veredal', icon: Wrench },
  logistica_ayudas: { label: 'Logística y Carga de Víveres', icon: Truck },
}

export default function FlotaTab({
  vehiculos,
  onActualizarVehiculo,
  onTanquearVehiculo,
}: Props) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<'todos' | 'disponibles' | 'reserva'>('todos')

  const filtrar = vehiculos.filter((v) => {
    if (filtro === 'disponibles') return v.disponibleParaTrabajo && v.estado === 'disponible'
    if (filtro === 'reserva') return v.nivelCombustiblePorc <= 20
    return true
  })

  const ejecutarTanqueo = async (id: string) => {
    setBusyId(id)
    try {
      await onTanquearVehiculo(id)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Barra de estado y filtros de flota */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-3 text-xs">
        <div>
          <h2 className="text-sm font-extrabold text-white">Flota Comunitaria Bear&apos;s Reserve</h2>
          <p className="text-[11px] text-mist-500">
            Vehículos conectados con CashMet. Su kilometraje y tanque se actualizan automáticamente en cada misión.
          </p>
        </div>

        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setFiltro('todos')}
            className={`cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
              filtro === 'todos' ? 'bg-amber-400/20 text-amber-200' : 'bg-white/[0.04] text-mist-400 hover:text-white'
            }`}
          >
            Todos ({vehiculos.length})
          </button>
          <button
            type="button"
            onClick={() => setFiltro('disponibles')}
            className={`cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
              filtro === 'disponibles' ? 'bg-emerald-400/20 text-emerald-200' : 'bg-white/[0.04] text-mist-400 hover:text-white'
            }`}
          >
            Listos para misión
          </button>
          <button
            type="button"
            onClick={() => setFiltro('reserva')}
            className={`cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
              filtro === 'reserva' ? 'bg-red-400/20 text-red-200' : 'bg-white/[0.04] text-mist-400 hover:text-white'
            }`}
          >
            En reserva combustible
          </button>
        </div>
      </div>

      {/* Grid de vehículos */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {filtrar.map((v) => {
          const infoRol = ETIQUETA_ROL[v.rolOperativo] || ETIQUETA_ROL.campero_trochero
          const IconoRol = infoRol.icon

          return (
            <div
              key={v.id}
              className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.02] p-4 text-xs shadow-xl backdrop-blur-md transition hover:border-white/20"
            >
              <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-amber-400/20 to-emerald-400/10 text-amber-300">
                    <IconoRol className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="text-sm font-black text-white">
                      {v.marca} {v.linea} {v.modelo ? `(${v.modelo})` : ''}
                    </div>
                    <div className="text-[11px] font-bold text-amber-300">
                      {v.placa ? `Placa: ${v.placa} · ` : ''}
                      {infoRol.label}
                    </div>
                  </div>
                </div>

                <label className="flex cursor-pointer items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[10px] font-bold text-mist-300">
                  <input
                    type="checkbox"
                    checked={v.disponibleParaTrabajo}
                    onChange={(e) =>
                      onActualizarVehiculo(v.id, { disponibleParaTrabajo: e.target.checked })
                    }
                    className="h-3.5 w-3.5 accent-amber-400"
                  />
                  <span>{v.disponibleParaTrabajo ? 'Disponible' : 'No asignable'}</span>
                </label>
              </div>

              {/* Indicador gráfico de tanque de combustible */}
              <TanqueCombustible
                vehiculo={v}
                busy={busyId === v.id}
                onTanquear={() => ejecutarTanqueo(v.id)}
              />

              {/* Métricas de Odómetro y Desgaste de Neumáticos */}
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-xl border border-white/[0.06] bg-black/30 p-2.5">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-mist-500">
                    Odómetro (CashMet)
                  </div>
                  <div className="font-mono text-sm font-black text-white">
                    {v.kilometrajeActual.toLocaleString('es-CO')} km
                  </div>
                </div>

                <div className="rounded-xl border border-white/[0.06] bg-black/30 p-2.5">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-mist-500">
                    Desgaste de llantas
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-black text-amber-300">
                      {v.desgasteLlantasPorc}%
                    </span>
                    <span className="text-[10px] text-mist-400">
                      {v.desgasteLlantasPorc > 75 ? '⚠️ Cambio próximo' : 'Buen agarre'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Selector de rol operativo */}
              <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] pt-2">
                <span className="text-[11px] font-bold text-mist-400">Rol en la reserva:</span>
                <select
                  value={v.rolOperativo}
                  onChange={(e) =>
                    onActualizarVehiculo(v.id, {
                      rolOperativo: e.target.value as VehiculoOperativo['rolOperativo'],
                    })
                  }
                  className="field-dark h-8 rounded-lg px-2 text-[11px] font-medium"
                >
                  <option value="transporte_rural_escolar">Ruta Escolar Rural</option>
                  <option value="rescate_pesado">Rescate Pesado 4x4</option>
                  <option value="campero_trochero">Campero Trochero</option>
                  <option value="apoyo_rapido">Apoyo Rápido</option>
                  <option value="logistica_ayudas">Logística y Carga</option>
                </select>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

import { useState } from 'react'
import type {
  EmpleadoOperativo,
  EventoRadarLocal,
  MisionComunitaria,
  VehiculoOperativo,
} from './types'
import { EVENTOS_RADAR_PREDETERMINADOS } from './gemaEngine'
import {
  Radio,
  Compass,
  CheckCircle2,
  MapPin,
  Truck,
  Sparkles,
  Calendar,
  Check,
} from 'lucide-react'

let counterMision = 1
function crearMisionId(): string {
  return `mis-${Date.now()}-${counterMision++}`
}

function hoyFechaISO(): string {
  return new Date().toISOString().slice(0, 10)
}

interface Props {
  misiones: MisionComunitaria[]
  vehiculos: VehiculoOperativo[]
  empleados: EmpleadoOperativo[]
  onCrearMision: (mision: MisionComunitaria) => void
  onCompletarMision: (misionId: string) => Promise<{ kmActualizado: number; tanqueoAutomatico?: any }>
}

export default function MisionesTab({
  misiones,
  vehiculos,
  empleados,
  onCrearMision,
  onCompletarMision,
}: Props) {
  const [eventos] = useState<EventoRadarLocal[]>(EVENTOS_RADAR_PREDETERMINADOS)
  const [filtroRadar, setFiltroRadar] = useState<'todos' | 'caldas' | 'otros'>('todos')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string>('')

  // Formulario de nueva misión manual o programada
  const [modalAbierto, setModalAbierto] = useState(false)
  const [titulo, setTitulo] = useState('Caravana de Entrega de Víveres y Útiles')
  const [destino, setDestino] = useState('Vereda La Cabaña · Manizales')
  const [distanciaKm, setDistanciaKm] = useState('32')
  const [terreno, setTerreno] = useState<MisionComunitaria['terreno']>('trocha_moderada')
  const [vehiculoId, setVehiculoId] = useState(vehiculos[0]?.id || '')
  const [esProgramada, setEsProgramada] = useState(false)
  const [fechaMision, setFechaMision] = useState(hoyFechaISO)

  const despacharDesdeEvento = (ev: EventoRadarLocal) => {
    // Buscar vehículo disponible adecuado
    const vehiculoApto =
      vehiculos.find((v) => v.disponibleParaTrabajo && v.nivelCombustiblePorc > 20) || vehiculos[0]
    // Empleados disponibles
    const activos = empleados.filter((e) => e.enTurnoActivo || e.activo)

    const nueva: MisionComunitaria = {
      id: crearMisionId(),
      titulo: ev.titulo,
      tipo: ev.titulo.toLowerCase().includes('escolar')
        ? 'escolar_rural'
        : ev.titulo.toLowerCase().includes('camión') || ev.titulo.toLowerCase().includes('barrizal')
          ? 'rescate_barrizal'
          : 'derrumbe_via_tapada',
      prioridad: ev.esEmergenciaGrave ? 'critica_extrema' : 'alta',
      origen: 'Base Central Bear\'s Reserve (Manizales)',
      destino: ev.lugar,
      departamento: (ev.departamento as any) || 'Caldas',
      prioridadGeografica: ev.departamento === 'Caldas' ? 'local_manizales' : 'eje_cercano',
      terreno: 'trocha_extrema_barrizal',
      distanciaKmIdaYVuelta: 28,
      duracionEstimadaHoras: 3.5,
      empleadosAsignados: activos.slice(0, 2).map((e) => ({ id: e.id, nombre: e.nombreCompleto })),
      vehiculoId: vehiculoApto?.id || 'veh-1',
      vehiculoNombre: vehiculoApto ? `${vehiculoApto.marca} ${vehiculoApto.linea}` : 'Campero de Rescate',
      galonesConsumidosEstimados: 3.8,
      costoCombustibleEstimadoCOP: 54000,
      desgasteLlantasIncrementoPorc: 0.8,
      fecha: hoyFechaISO(),
      estado: 'en_curso',
      impactoSocial: ev.resumen,
    }

    onCrearMision(nueva)
    setFeedback(`🚨 ¡Misión activada! "${nueva.titulo}" asignada al equipo de guardia.`)
    window.setTimeout(() => setFeedback(''), 4000)
  }

  const crearMisionManual = () => {
    const v = vehiculos.find((x) => x.id === vehiculoId) || vehiculos[0]
    const kmNum = Number(distanciaKm) || 20
    const activos = empleados.filter((e) => e.activo)

    const nueva: MisionComunitaria = {
      id: crearMisionId(),
      titulo: titulo.trim(),
      tipo: esProgramada ? 'entrega_ayudas' : 'contingencia_vial',
      prioridad: 'alta',
      origen: 'Base Central Bear\'s Reserve',
      destino: destino.trim(),
      departamento: 'Caldas',
      prioridadGeografica: 'local_manizales',
      terreno,
      distanciaKmIdaYVuelta: kmNum,
      duracionEstimadaHoras: 4,
      empleadosAsignados: activos.slice(0, 2).map((e) => ({ id: e.id, nombre: e.nombreCompleto })),
      vehiculoId: v?.id || '',
      vehiculoNombre: v ? `${v.marca} ${v.linea}` : 'Vehículo Comunitario',
      galonesConsumidosEstimados: Number((kmNum / 18).toFixed(1)),
      costoCombustibleEstimadoCOP: Math.round((kmNum / 18) * 15850),
      desgasteLlantasIncrementoPorc: 0.5,
      fecha: fechaMision,
      estado: esProgramada ? 'programada' : 'en_curso',
      impactoSocial: 'Apoyo logístico directo a familias campesinas y zonas de difícil acceso.',
      esProgramadaCalendario: esProgramada,
    }

    onCrearMision(nueva)
    setModalAbierto(false)
    setFeedback(`✅ Misión ${esProgramada ? 'agendada en el calendario' : 'despachada'}: "${nueva.titulo}"`)
    window.setTimeout(() => setFeedback(''), 4000)
  }

  const completarMision = async (id: string) => {
    setBusyId(id)
    try {
      const res = await onCompletarMision(id)
      let msg = `🏁 Misión cumplida con éxito. Se sumaron los kilómetros recorridos al odómetro de CashMet (${res.kmActualizado.toLocaleString('es-CO')} km).`
      if (res.tanqueoAutomatico) {
        msg += ` ⛽ El tanque bajó a zona de reserva y Gema activó el auto-tanqueo al 100% (${res.tanqueoAutomatico.galones} gal por $${res.tanqueoAutomatico.totalCOP.toLocaleString('es-CO')}) cargándolo a la tarjeta de combustible.`
      }
      setFeedback(msg)
    } finally {
      setBusyId(null)
    }
  }

  const eventosFiltrados = eventos.filter((ev) => {
    if (filtroRadar === 'caldas') return ev.departamento === 'Caldas'
    if (filtroRadar === 'otros') return ev.departamento !== 'Caldas'
    return true
  })

  return (
    <div className="space-y-4 text-xs">
      {feedback && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-3 font-bold text-emerald-200 shadow-lg">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* RADAR DE EVENTOS Y NOTICIAS LOCALES */}
      <div className="rounded-3xl border border-amber-400/25 bg-gradient-to-br from-amber-500/[0.08] via-black/30 to-night-900 p-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-400/20 text-amber-300">
              <Radio className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-black text-white">Radar de Eventos y Contingencias Regionales</h2>
              <p className="text-[11px] text-mist-400">
                Gema monitorea Manizales y alrededores. Filtra con criterio comunitario para no duplicar asistencias oficiales.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFiltroRadar('todos')}
              className={`cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                filtroRadar === 'todos' ? 'bg-amber-400/20 text-amber-200' : 'bg-white/[0.04] text-mist-400'
              }`}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setFiltroRadar('caldas')}
              className={`cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                filtroRadar === 'caldas' ? 'bg-amber-400/20 text-amber-200' : 'bg-white/[0.04] text-mist-400'
              }`}
            >
              Manizales & Caldas
            </button>
            <button
              type="button"
              onClick={() => setFiltroRadar('otros')}
              className={`cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                filtroRadar === 'otros' ? 'bg-amber-400/20 text-amber-200' : 'bg-white/[0.04] text-mist-400'
              }`}
            >
              Vecinos (Risaralda / Tolima / Antioquia)
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {eventosFiltrados.map((ev) => {
            const esCaldas = ev.departamento === 'Caldas'
            const puedeDespachar = ev.recomendacionGema !== 'monitorear_sin_intervenir'

            return (
              <div
                key={ev.id}
                className={`space-y-2.5 rounded-2xl border p-3.5 ${
                  ev.recomendacionGema === 'intervenir_urgente'
                    ? 'border-red-400/40 bg-red-500/10'
                    : ev.recomendacionGema === 'ruta_escolar_rutinaria'
                      ? 'border-emerald-400/30 bg-emerald-500/10'
                      : 'border-white/[0.08] bg-black/30'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-extrabold text-white sm:text-sm">{ev.titulo}</div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${
                      esCaldas
                        ? 'border border-emerald-400/30 bg-emerald-400/15 text-emerald-300'
                        : 'border border-amber-400/30 bg-amber-400/15 text-amber-300'
                    }`}
                  >
                    {ev.departamento}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-[11px] text-mist-400">
                  <MapPin className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  <span>{ev.lugar}</span>
                  <span className="text-mist-600">· {ev.fuenteNoticia}</span>
                </div>

                <p className="text-[11px] leading-relaxed text-mist-300">{ev.resumen}</p>

                {/* Justificación y Criterio de Gema */}
                <div className="rounded-xl border border-white/[0.06] bg-black/40 p-2 text-[11px]">
                  <div className="flex items-center gap-1 font-bold text-amber-300">
                    <Sparkles className="h-3 w-3" />
                    <span>Criterio de Gema:</span>
                  </div>
                  <p className="text-mist-300">{ev.justificacionGema}</p>
                </div>

                <div className="flex items-center justify-between border-t border-white/[0.06] pt-2">
                  <span className="text-[10px] text-mist-500">{ev.fecha}</span>
                  {puedeDespachar ? (
                    <button
                      type="button"
                      onClick={() => despacharDesdeEvento(ev)}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 px-3 py-1 font-black text-[#2a1702] transition hover:brightness-110 active:scale-95"
                    >
                      <Truck className="h-3.5 w-3.5" />
                      <span>Despachar Misión</span>
                    </button>
                  ) : (
                    <span className="text-[10px] italic text-mist-500">
                      Cubierto por autoridades de Antioquia
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* LISTADO DE MISIONES Y TRABAJOS PROGRAMADOS */}
      <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-extrabold text-white">
              Misiones en Curso y Trabajos Programados ({misiones.length})
            </h3>
          </div>

          <button
            type="button"
            onClick={() => setModalAbierto(true)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-3 py-1.5 font-bold text-emerald-200 transition hover:bg-emerald-400/20"
          >
            <Calendar className="h-3.5 w-3.5" />
            <span>+ Programar Misión / Ayuda</span>
          </button>
        </div>

        {misiones.length === 0 ? (
          <div className="p-8 text-center text-mist-500">
            <p className="font-bold text-mist-300">No hay misiones activas en este momento.</p>
            <p className="text-[11px]">
              Elige una contingencia del Radar superior o programa una entrega de víveres en el botón de arriba.
            </p>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {misiones.map((m) => {
              const esCompletada = m.estado === 'completada'
              const esProg = m.estado === 'programada'

              return (
                <div
                  key={m.id}
                  className={`flex flex-col justify-between gap-3 rounded-2xl border p-3.5 transition sm:flex-row sm:items-center ${
                    esCompletada
                      ? 'border-white/[0.06] bg-black/20 opacity-80'
                      : esProg
                        ? 'border-sky-400/30 bg-sky-500/[0.06]'
                        : 'border-emerald-400/30 bg-emerald-500/[0.08]'
                  }`}
                >
                  <div className="space-y-1 sm:max-w-xl">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-white">{m.titulo}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                          esCompletada
                            ? 'bg-white/10 text-mist-400'
                            : esProg
                              ? 'bg-sky-400/20 text-sky-300'
                              : 'bg-emerald-400/20 text-emerald-300 animate-pulse'
                        }`}
                      >
                        {m.estado}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2 text-[11px] text-mist-400">
                      <span>Destino: <b className="text-white">{m.destino}</b></span>
                      <span>· Distancia: <b className="text-white">{m.distanciaKmIdaYVuelta} km</b></span>
                      <span>· Vehículo: <b className="text-amber-300">{m.vehiculoNombre}</b></span>
                    </div>

                    <p className="text-[11px] text-mist-300">{m.impactoSocial}</p>

                    <div className="flex items-center gap-3 text-[10px] text-mist-500">
                      <span>Fecha: {m.fecha}</span>
                      <span>Combustible estimado: ~{m.galonesConsumidosEstimados} galones</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!esCompletada && (
                      <button
                        type="button"
                        disabled={busyId === m.id}
                        onClick={() => completarMision(m.id)}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 px-3.5 py-2 font-black text-[#04241a] transition hover:brightness-110 active:scale-95 disabled:opacity-40"
                      >
                        <Check className="h-4 w-4" />
                        <span>{busyId === m.id ? 'Actualizando Odómetro...' : 'Completar Misión'}</span>
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal para agendar misión programada o manual */}
      {modalAbierto && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="surface-glow w-full max-w-lg rounded-3xl border border-white/15 bg-night-900 p-5 text-xs shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-extrabold text-white">Nueva Misión o Trabajo Programado</h3>
              <button
                type="button"
                onClick={() => setModalAbierto(false)}
                className="cursor-pointer text-mist-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="my-3 space-y-2.5">
              <label className="flex flex-col gap-1">
                <span className="text-mist-400">Título de la misión comunitaria</span>
                <input
                  type="text"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  className="field-dark h-9 rounded-xl px-2.5 text-xs"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-mist-400">Destino (Vereda / Municipio)</span>
                <input
                  type="text"
                  value={destino}
                  onChange={(e) => setDestino(e.target.value)}
                  className="field-dark h-9 rounded-xl px-2.5 text-xs"
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-mist-400">Distancia ida y vuelta (km)</span>
                  <input
                    type="number"
                    value={distanciaKm}
                    onChange={(e) => setDistanciaKm(e.target.value)}
                    className="field-dark h-9 rounded-xl px-2.5 text-xs"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-mist-400">Terreno de montaña</span>
                  <select
                    value={terreno}
                    onChange={(e) => setTerreno(e.target.value as any)}
                    className="field-dark h-9 rounded-xl px-2 text-xs"
                  >
                    <option value="trocha_moderada">Trocha moderada (Vereda)</option>
                    <option value="trocha_extrema_barrizal">Barrizal extremo / Trocha pesada</option>
                    <option value="mixto_montaña">Mixto montaña / Pavimento</option>
                  </select>
                </label>
              </div>

              <label className="flex flex-col gap-1">
                <span className="text-mist-400">Vehículo asignado de la flota</span>
                <select
                  value={vehiculoId}
                  onChange={(e) => setVehiculoId(e.target.value)}
                  className="field-dark h-9 rounded-xl px-2.5 text-xs"
                >
                  {vehiculos.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.marca} {v.linea} ({v.tipoCombustible.toUpperCase()} · Tanque {v.nivelCombustiblePorc}%)
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex items-center gap-3 border-t border-white/[0.08] pt-2">
                <label className="flex cursor-pointer items-center gap-1.5 font-bold text-mist-300">
                  <input
                    type="checkbox"
                    checked={esProgramada}
                    onChange={(e) => setEsProgramada(e.target.checked)}
                    className="h-4 w-4 accent-emerald-400"
                  />
                  <span>Es un trabajo programado en el calendario</span>
                </label>

                {esProgramada && (
                  <input
                    type="date"
                    value={fechaMision}
                    onChange={(e) => setFechaMision(e.target.value)}
                    className="field-dark h-8 rounded-lg px-2 text-xs"
                  />
                )}
              </div>
            </div>

            <div className="flex gap-2 border-t border-white/10 pt-3">
              <button
                type="button"
                onClick={crearMisionManual}
                className="flex-1 cursor-pointer rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 py-2 font-bold text-[#04241a]"
              >
                {esProgramada ? 'Agendar Misión' : 'Despachar Inmediatamente'}
              </button>
              <button
                type="button"
                onClick={() => setModalAbierto(false)}
                className="cursor-pointer rounded-xl bg-white/10 px-4 py-2 text-mist-300 hover:text-white"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

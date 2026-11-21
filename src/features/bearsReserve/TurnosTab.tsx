import { useState, useMemo } from 'react'
import type { EmpleadoOperativo, TurnoSemanal } from './types'
import {
  Sparkles,
  Calendar,
  Clock,
  UserCheck,
  UserX,
  ShieldAlert,
  BookOpen,
  CheckCircle2,
  LayoutGrid,
  List,
  ShieldCheck,
} from 'lucide-react'
import { hoyISO, isoLocal } from '@/lib/fechas'

interface Props {
  empleados: EmpleadoOperativo[]
  turnos: TurnoSemanal[]
  onRotarTurnosPorIA: () => Promise<void> | void
  onActualizarEmpleado: (id: string, parcial: Partial<EmpleadoOperativo>) => Promise<void> | void
}

const NOMBRES_DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

const FRANJAS_24H = [
  {
    clave: 'manana' as const,
    etiqueta: 'Mañana',
    icono: '🌅',
    horario: '06:00 - 14:00',
    horas: '8h',
    badgeColor: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  },
  {
    clave: 'tarde' as const,
    etiqueta: 'Tarde',
    icono: '☀️',
    horario: '14:00 - 22:00',
    horas: '8h',
    badgeColor: 'border-orange-400/30 bg-orange-400/10 text-orange-300',
  },
  {
    clave: 'noche' as const,
    etiqueta: 'Noche',
    icono: '🌙',
    horario: '22:00 - 06:00',
    horas: '8h',
    badgeColor: 'border-indigo-400/30 bg-indigo-400/10 text-indigo-300',
  },
]

function calcularDiasSemana(refSemanaISO?: string) {
  let base: Date
  if (refSemanaISO) {
    const [y, m, d] = refSemanaISO.split('-').map(Number)
    base = new Date(y, m - 1, d, 12, 0, 0)
  } else {
    const hoyD = new Date()
    base = new Date(
      hoyD.getFullYear(),
      hoyD.getMonth(),
      hoyD.getDate() - ((hoyD.getDay() + 6) % 7),
      12,
      0,
      0
    )
  }
  const dias = []
  const NOMBRES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
  const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  const hoy = hoyISO()

  for (let i = 0; i < 7; i++) {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    const iso = isoLocal(d)
    const diaNum = String(d.getDate()).padStart(2, '0')
    dias.push({
      nombre: NOMBRES[i],
      nombreCorto: NOMBRES[i].slice(0, 3),
      fechaISO: iso,
      fechaCorta: `${diaNum} ${MESES[d.getMonth()]}`,
      esHoy: iso === hoy,
    })
  }
  return dias
}

export default function TurnosTab({
  empleados,
  turnos,
  onRotarTurnosPorIA,
  onActualizarEmpleado,
}: Props) {
  const [empSeleccionadoId, setEmpSeleccionadoId] = useState<string | null>(null)
  const [nuevoDiaSemana, setNuevoDiaSemana] = useState(2) // Martes
  const [horaInicio, setHoraInicio] = useState('18:00')
  const [horaFin, setHoraFin] = useState('22:00')
  const [motivo, setMotivo] = useState('Universidad / Clases')
  const [vista, setVista] = useState<'horario' | 'tarjetas'>('horario')
  const [animandoRotacion, setAnimandoRotacion] = useState(false)
  const [mensajeRotacion, setMensajeRotacion] = useState<string | null>(null)

  const empSeleccionado = useMemo(
    () => empleados.find((e) => e.id === empSeleccionadoId) || null,
    [empleados, empSeleccionadoId]
  )

  const handleRotar = async () => {
    setAnimandoRotacion(true)
    try {
      await onRotarTurnosPorIA()
      setMensajeRotacion(
        '✨ ¡Turnos rotados por Gema y guardados en Firestore! Se reorganizó la cuadrilla respetando el tope de 42h.'
      )
    } finally {
      window.setTimeout(() => setAnimandoRotacion(false), 450)
      window.setTimeout(() => setMensajeRotacion(null), 4500)
    }
  }

  const agregarRestriccionHorario = async () => {
    if (!empSeleccionado) return
    const actual = empSeleccionado.horariosNoDisponibles || []
    const nueva = {
      diaSemana: nuevoDiaSemana,
      horaInicio,
      horaFin,
      motivo: motivo.trim() || 'Estudio / Personal',
    }
    const actualizados = [...actual, nueva]
    await onActualizarEmpleado(empSeleccionado.id, { horariosNoDisponibles: actualizados })
    setMensajeRotacion(
      `📅 Horario de ${empSeleccionado.nombreCompleto} actualizado y cuadrante reajustado automáticamente.`
    )
    window.setTimeout(() => setMensajeRotacion(null), 4000)
  }

  const borrarRestriccion = async (idx: number) => {
    if (!empSeleccionado) return
    const actualizados = (empSeleccionado.horariosNoDisponibles || []).filter((_, i) => i !== idx)
    await onActualizarEmpleado(empSeleccionado.id, { horariosNoDisponibles: actualizados })
  }

  const diasSemana = useMemo(() => calcularDiasSemana(turnos[0]?.semanaISO), [turnos])
  const fechasSemanaSet = useMemo(() => new Set(diasSemana.map((d) => d.fechaISO)), [diasSemana])
  const turnosSemanaActual = useMemo(
    () => turnos.filter((t) => fechasSemanaSet.has(t.fecha)),
    [turnos, fechasSemanaSet]
  )

  const empleadosActivos = empleados.filter((e) => e.activo !== false)
  const totalHorasProgramadas = turnosSemanaActual.reduce((acc, t) => acc + t.horas, 0)

  // Cobertura real de las 21 franjas (7 días x 3 franjas)
  const franjasCubiertas = useMemo(() => {
    let cubiertas = 0
    for (const d of diasSemana) {
      for (const f of FRANJAS_24H) {
        if (turnosSemanaActual.some((t) => t.fecha === d.fechaISO && t.franja === f.clave)) {
          cubiertas++
        }
      }
    }
    return cubiertas
  }, [diasSemana, turnosSemanaActual])

  const porcCobertura = Math.round((franjasCubiertas / 21) * 100)

  return (
    <div className="space-y-5 text-xs">
      {/* Encabezado y disparador de Gema */}
      <div className="flex flex-col gap-4 rounded-3xl border border-sky-400/25 bg-gradient-to-r from-sky-500/[0.12] via-teal-500/[0.08] to-black/40 p-4 sm:flex-row sm:items-center sm:justify-between shadow-xl">
        <div className="space-y-1.5 max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-400/20 text-sky-300">
              <Calendar className="h-4 w-4" />
            </span>
            <h2 className="text-sm font-extrabold text-white">
              Centro de Turnos y Guardia Continua 24/7 (Tope estricto 42h)
            </h2>
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                porcCobertura === 100
                  ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                  : 'border-amber-400/30 bg-amber-400/10 text-amber-200'
              }`}
            >
              Cobertura real: {porcCobertura}% ({franjasCubiertas}/21 franjas)
            </span>
          </div>
          <p className="text-[11px] text-mist-300 leading-relaxed">
            Turnos continuos de 8 horas exactas sin jornadas partidas. Nadie se excluye automáticamente por su cargo:
            tú eliges con el switch quién participa en Bear&apos;s Reserve y Gema asigna las rutas escolares y guardias
            respetando horarios de estudio y máximo 42 horas semanales.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-mist-400">
            <span className="flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              <b>{empleadosActivos.length}</b> de {empleados.length} colaboradores activos en reserva
            </span>
            <span>·</span>
            <span>
              <b>{totalHorasProgramadas}h</b> semanales programadas
            </span>
          </div>
        </div>

        <button
          type="button"
          disabled={animandoRotacion || empleadosActivos.length === 0}
          onClick={() => void handleRotar()}
          className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-400 via-teal-400 to-emerald-400 px-5 py-3 font-black text-[#04241a] shadow-lg transition active:scale-95 shrink-0 disabled:opacity-40 ${
            animandoRotacion ? 'scale-95 brightness-125' : 'hover:brightness-110'
          }`}
        >
          <Sparkles className={`h-4 w-4 ${animandoRotacion ? 'animate-spin' : ''}`} />
          <span>💎 Gema: Rotar turnos 24/7</span>
        </button>
      </div>

      {mensajeRotacion && (
        <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/15 p-2.5 text-center text-xs font-bold text-emerald-200 shadow-md">
          {mensajeRotacion}
        </div>
      )}

      {/* Grid de Empleados con Switch Explícito y Horas Reales */}
      <div>
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-mist-300">
              Colaboradores de Nómina ({empleados.length})
            </span>
            <span className="ml-2 text-[10px] text-mist-500">
              Activa o desactiva manualmente quién participa en Bear&apos;s Reserve (recalcula el cuadrante al instante)
            </span>
          </div>
          <span className="text-[10px] text-mist-400">
            Haz clic en una ficha para gestionar horarios de estudio / universidad
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {empleados.map((emp) => {
            const activo = emp.activo !== false
            const inactivoEnCashmet = emp.activoEnCashmet === false
            const horasSemana = Number(
              turnosSemanaActual
                .filter((t) => t.empleadoId === emp.id)
                .reduce((s, t) => s + t.horas, 0)
                .toFixed(1)
            )
            const porcHoras = Math.min(100, Math.round((horasSemana / 42) * 100))
            const esSeleccionado = empSeleccionado?.id === emp.id

            return (
              <div
                key={emp.id}
                className={`rounded-2xl border p-3 transition ${
                  !activo
                    ? 'border-white/[0.05] bg-white/[0.01] opacity-65'
                    : esSeleccionado
                      ? 'border-sky-400/50 bg-sky-400/10 shadow-md'
                      : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div
                    onClick={() => setEmpSeleccionadoId(emp.id)}
                    className="flex-1 cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-2 font-bold text-white">
                      {activo ? (
                        <UserCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                      ) : (
                        <UserX className="h-4 w-4 text-mist-500 shrink-0" />
                      )}
                      <span className="truncate">{emp.nombreCompleto}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-mist-400">{emp.cargo}</div>
                  </div>

                  {/* Switch manual para habilitar/deshabilitar en Bear's Reserve */}
                  <button
                    type="button"
                    disabled={inactivoEnCashmet}
                    onClick={(e) => {
                      e.stopPropagation()
                      void onActualizarEmpleado(emp.id, { activo: !activo })
                    }}
                    className={`shrink-0 rounded-xl px-2.5 py-1 text-[10px] font-extrabold transition shadow-sm ${
                      inactivoEnCashmet
                        ? 'cursor-not-allowed border border-red-400/20 bg-red-500/10 text-red-300/70'
                        : activo
                          ? 'cursor-pointer border border-emerald-400/40 bg-emerald-400/15 text-emerald-300 hover:bg-emerald-400/25'
                          : 'cursor-pointer border border-mist-600/30 bg-mist-800/40 text-mist-400 hover:bg-mist-700/50'
                    }`}
                    title={
                      inactivoEnCashmet
                        ? 'Inactivo en la Nómina de CashMet'
                        : activo
                          ? 'Clic para desactivar de Bear\'s Reserve'
                          : 'Clic para activar en Bear\'s Reserve'
                    }
                  >
                    {inactivoEnCashmet ? '⛔ Inactivo CashMet' : activo ? '✅ En Reserva' : '⏸️ Desactivado'}
                  </button>
                </div>

                {/* Barra de horas reales */}
                {activo ? (
                  <div className="mt-2.5 space-y-1">
                    <div className="flex justify-between text-[10px] text-mist-400">
                      <span>Carga asignada esta semana:</span>
                      <b
                        className={`font-mono ${
                          horasSemana >= 40
                            ? 'text-emerald-300 font-bold'
                            : horasSemana > 0
                              ? 'text-white'
                              : 'text-mist-500'
                        }`}
                      >
                        {horasSemana} / 42h
                      </b>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
                      <div
                        className={`h-full rounded-full transition-all ${
                          horasSemana >= 40
                            ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]'
                            : 'bg-sky-400'
                        }`}
                        style={{ width: `${porcHoras}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="mt-2.5 rounded-lg border border-dashed border-white/10 px-2 py-1 text-[10px] text-mist-500 text-center">
                    Desactivado de la asignación operativa de guardia
                  </div>
                )}

                {emp.horariosNoDisponibles.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {emp.horariosNoDisponibles.map((h, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/40 px-1.5 py-0.5 text-[9px] text-mist-300"
                      >
                        <BookOpen className="h-2.5 w-2.5 text-sky-300" />
                        {NOMBRES_DIAS[h.diaSemana % 7]} {h.horaInicio}-{h.horaFin}: {h.motivo}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Editor de Horarios Personales / Clases Universitarias */}
      {empSeleccionado && (
        <div className="rounded-3xl border border-sky-400/30 bg-night-900/90 p-4 shadow-xl backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-sky-400" />
              <span className="text-sm font-extrabold text-white">
                Horarios Personales y Clases de {empSeleccionado.nombreCompleto}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setEmpSeleccionadoId(null)}
              className="cursor-pointer text-xs text-mist-500 hover:text-white"
            >
              Cerrar
            </button>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-4">
            <label className="flex flex-col gap-1">
              <span className="text-mist-400">Día de la semana</span>
              <select
                value={nuevoDiaSemana}
                onChange={(e) => setNuevoDiaSemana(Number(e.target.value))}
                className="field-dark h-9 rounded-xl px-2 text-xs"
              >
                <option value={1}>Lunes</option>
                <option value={2}>Martes</option>
                <option value={3}>Miércoles</option>
                <option value={4}>Jueves</option>
                <option value={5}>Viernes</option>
                <option value={6}>Sábado</option>
                <option value={0}>Domingo</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-mist-400">Hora inicio</span>
              <input
                type="time"
                value={horaInicio}
                onChange={(e) => setHoraInicio(e.target.value)}
                className="field-dark h-9 rounded-xl px-2 text-xs"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-mist-400">Hora fin</span>
              <input
                type="time"
                value={horaFin}
                onChange={(e) => setHoraFin(e.target.value)}
                className="field-dark h-9 rounded-xl px-2 text-xs"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-mist-400">Motivo (ej: Universidad)</span>
              <input
                type="text"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej: Clases de medicina"
                className="field-dark h-9 rounded-xl px-2 text-xs"
              />
            </label>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => void agregarRestriccionHorario()}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-sky-400/20 px-3 py-1.5 font-bold text-sky-200 transition hover:bg-sky-400/30"
            >
              <span>+ Añadir horario no disponible</span>
            </button>
            <span className="text-[11px] text-mist-500">
              Al guardar se reajusta el cuadrante automáticamente
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {(empSeleccionado.horariosNoDisponibles || []).map((h, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-black/40 px-2.5 py-1 text-[11px] text-mist-300"
              >
                <b>{NOMBRES_DIAS[h.diaSemana % 7]}</b>: {h.horaInicio} - {h.horaFin} ({h.motivo})
                <button
                  type="button"
                  onClick={() => void borrarRestriccion(i)}
                  className="cursor-pointer text-red-400 hover:text-red-300"
                  title="Eliminar restricción"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* HORARIO SEMANAL 24/7 */}
      <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-4 shadow-xl">
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-300" />
            <h3 className="text-sm font-extrabold text-white">
              Horario Semanal de Guardia Continua (24 Horas)
            </h3>
            <span className="rounded-md border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] text-mist-400">
              {turnosSemanaActual.length} puestos programados
            </span>
          </div>

          <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-black/30 p-1">
            <button
              type="button"
              onClick={() => setVista('horario')}
              className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                vista === 'horario'
                  ? 'bg-sky-400/20 text-sky-200 shadow-sm'
                  : 'text-mist-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>Matriz Horario</span>
            </button>
            <button
              type="button"
              onClick={() => setVista('tarjetas')}
              className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                vista === 'tarjetas'
                  ? 'bg-sky-400/20 text-sky-200 shadow-sm'
                  : 'text-mist-400 hover:text-white'
              }`}
            >
              <List className="h-3.5 w-3.5" />
              <span>Fichas</span>
            </button>
          </div>
        </div>

        {turnosSemanaActual.length === 0 ? (
          <div className="p-8 text-center text-mist-500">
            <Calendar className="mx-auto mb-2 h-8 w-8 text-mist-600" />
            <p className="font-bold text-mist-300">
              {empleadosActivos.length === 0
                ? 'No hay colaboradores activos en Bear\'s Reserve.'
                : 'Aún no hay turnos generados para esta semana.'}
            </p>
            <p className="text-[11px]">
              Activa al menos un colaborador arriba y pulsa &ldquo;Rotar turnos 24/7&rdquo;.
            </p>
          </div>
        ) : vista === 'horario' ? (
          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/40">
            <table className="w-full text-left border-collapse min-w-[980px]">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.03]">
                  <th className="p-3 w-40 text-mist-400 text-[11px] uppercase tracking-wider font-extrabold border-r border-white/10">
                    Franja 24/7
                  </th>
                  {diasSemana.map((dia) => (
                    <th
                      key={dia.fechaISO}
                      className={`p-3 text-center border-r border-white/10 last:border-r-0 ${
                        dia.esHoy ? 'bg-sky-500/10' : ''
                      }`}
                    >
                      <div className="flex items-center justify-center gap-1.5 text-[12px] font-extrabold text-white">
                        <span>{dia.nombre}</span>
                        {dia.esHoy && (
                          <span className="rounded-full bg-sky-400/30 px-1.5 py-0.2 text-[8px] font-extrabold text-sky-200 animate-pulse">
                            HOY
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[10px] font-mono text-mist-400">
                        {dia.fechaCorta}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FRANJAS_24H.map((franja) => (
                  <tr key={franja.clave} className="border-b border-white/[0.06] last:border-b-0">
                    <td className="p-3 align-top bg-white/[0.015] border-r border-white/10">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 font-black text-white text-xs">
                          <span>{franja.icono}</span>
                          <span>{franja.etiqueta}</span>
                        </div>
                        <div className="font-mono text-[10px] text-mist-300 font-bold">
                          {franja.horario}
                        </div>
                        <span
                          className={`inline-block rounded-md px-2 py-0.5 text-[9px] font-extrabold border ${franja.badgeColor}`}
                        >
                          {franja.horas} continuas
                        </span>
                      </div>
                    </td>

                    {diasSemana.map((dia) => {
                      const turnosCelda = turnosSemanaActual.filter(
                        (t) => t.fecha === dia.fechaISO && t.franja === franja.clave
                      )

                      return (
                        <td
                          key={dia.fechaISO}
                          className={`p-2 align-top border-r border-white/[0.06] last:border-r-0 transition-colors ${
                            dia.esHoy ? 'bg-sky-500/[0.03]' : ''
                          }`}
                        >
                          <div className="flex flex-col gap-1.5 min-h-[115px]">
                            {turnosCelda.length === 0 ? (
                              <div className="rounded-xl border border-dashed border-white/10 p-2 text-[9px] text-mist-500 italic text-center">
                                Sin guardia (tope 42h)
                              </div>
                            ) : (
                              turnosCelda.map((t) => {
                                const esConductor =
                                  t.id.includes('-cond') ||
                                  t.rolGuardia.toLowerCase().includes('conduc')
                                const esMecanico =
                                  t.id.includes('-mec') ||
                                  t.rolGuardia.toLowerCase().includes('mec')
                                const esRuta = Boolean(t.rutaHabitualId)

                                return (
                                  <div
                                    key={t.id}
                                    className={`rounded-xl border p-2 space-y-0.5 shadow-sm transition-all ${
                                      t.esRespaldoCoordinador
                                        ? 'border-red-400/40 bg-red-500/10 text-red-200'
                                        : esRuta
                                          ? 'border-sky-400/35 bg-sky-500/[0.12] text-white'
                                          : esConductor
                                            ? 'border-blue-400/25 bg-blue-500/[0.08] text-white'
                                            : esMecanico
                                              ? 'border-emerald-400/25 bg-emerald-500/[0.08] text-white'
                                              : 'border-white/15 bg-white/[0.04] text-white'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-1">
                                      <span
                                        className={`font-extrabold text-[11px] truncate flex items-center gap-1 ${
                                          t.esRespaldoCoordinador
                                            ? 'text-red-300'
                                            : esRuta
                                              ? 'text-sky-300'
                                              : esConductor
                                                ? 'text-blue-200'
                                                : 'text-emerald-200'
                                        }`}
                                      >
                                        <span>
                                          {esRuta ? '🚌' : esConductor ? '🚗' : esMecanico ? '🔧' : '🛡️'}
                                        </span>
                                        <span className="truncate">{t.empleadoNombre}</span>
                                      </span>
                                    </div>
                                    <div className="text-[9px] text-mist-400 line-clamp-2 leading-tight">
                                      {t.rolGuardia}
                                    </div>
                                  </div>
                                )
                              })
                            )}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {turnosSemanaActual.map((t) => (
              <div
                key={t.id}
                className={`rounded-2xl border p-3 ${
                  t.esRespaldoCoordinador
                    ? 'border-red-400/40 bg-red-500/10'
                    : 'border-white/[0.08] bg-black/20'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-white">
                    {t.esRespaldoCoordinador ? (
                      <ShieldAlert className="h-4 w-4 text-red-400" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    )}
                    <span>{t.empleadoNombre}</span>
                  </div>
                  <span className="font-mono text-[11px] font-bold text-amber-300">{t.horas}h</span>
                </div>

                <div className="mt-1 text-[11px] text-mist-400">{t.rolGuardia}</div>

                <div className="mt-2 flex items-center justify-between text-[10px] text-mist-500 border-t border-white/[0.06] pt-1.5">
                  <span>Fecha: {t.fecha}</span>
                  <span className="font-mono font-bold text-mist-300">
                    {t.horaInicio} - {t.horaFin}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

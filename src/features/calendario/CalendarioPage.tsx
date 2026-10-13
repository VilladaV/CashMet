import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  actualizarEvento,
  construirEventos,
  crearEvento,
  eliminarEvento,
  guardarEventos,
  listarEventos,
  type EventoDoc,
  type EventoInput,
  type TipoEvento,
} from '@/lib/firebase/calendarioRepo'
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  PlusCircle,
  Edit2,
  Trash2,
  CheckCircle2,
  Clock,
  AlertCircle,
} from 'lucide-react'

const ETIQUETA: Record<string, string> = {
  soat: 'SOAT',
  tecnicomecanica: 'Tecnicomecánica',
  seguro_tr: 'Seguro',
  prima_julio: 'Prima julio',
  prima_diciembre: 'Prima diciembre',
  cuota_deuda: 'Cuota',
  predial: 'Predial',
  impuesto: 'Impuesto',
  pago_sueldo: 'Sueldo',
  nomina_trabajador: 'Nómina',
  recurrente: 'Recurrente',
  personal: 'Personal',
}

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const COLOR_TIPO: Record<string, string> = {
  soat: 'border-red-400/30 bg-red-400/10 text-red-200',
  tecnicomecanica: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
  seguro_tr: 'border-orange-400/30 bg-orange-400/10 text-orange-200',
  cuota_deuda: 'border-sky-400/30 bg-sky-400/10 text-sky-200',
  prima_julio: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  prima_diciembre: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  personal: 'border-white/10 bg-white/[0.05] text-mist-300',
}

const HOY_ISO = new Date().toISOString().slice(0, 10)

export default function CalendarioPage() {
  const [generando, setGenerando] = useState(false)
  const [eventos, setEventos] = useState<EventoDoc[]>([])
  const [preview, setPreview] = useState<EventoInput[]>([])
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [nuevo, setNuevo] = useState({
    fecha: '',
    titulo: '',
    tipo: 'personal' as TipoEvento,
    descripcion: '',
  })
  const [creando, setCreando] = useState(false)
  const [mesVista, setMesVista] = useState(() => {
    const hoy = new Date()
    return new Date(hoy.getFullYear(), hoy.getMonth(), 1)
  })
  const [diaSel, setDiaSel] = useState<string | null>(null)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [form, setForm] = useState<{
    fecha: string
    titulo: string
    tipo: TipoEvento
    descripcion: string
  } | null>(null)
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(() => {
    listarEventos(500)
      .then(setEventos)
      .catch(() => setError('No se pudieron cargar los eventos del calendario.'))
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const porDia = useMemo(() => {
    const mapa: Record<string, EventoDoc[]> = {}
    for (const e of eventos) {
      const clave = (e.fechaInicio || '').slice(0, 10)
      if (!clave) continue
      ;(mapa[clave] ||= []).push(e)
    }
    return mapa
  }, [eventos])

  const celdas = useMemo(() => {
    const year = mesVista.getFullYear()
    const month = mesVista.getMonth()
    const primerDia = new Date(year, month, 1).getDay()
    const offset = (primerDia + 6) % 7
    const dias = new Date(year, month + 1, 0).getDate()
    const out: Array<{ clave: string; dia: number } | null> = []
    for (let i = 0; i < offset; i++) out.push(null)
    for (let d = 1; d <= dias; d++) {
      const clave = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      out.push({ clave, dia: d })
    }
    while (out.length % 7 !== 0) out.push(null)
    return out
  }, [mesVista])

  const etiquetaMes = useMemo(
    () => mesVista.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }),
    [mesVista]
  )

  const cambiarMes = (delta: number) => {
    setMesVista((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1))
    setDiaSel(null)
  }

  const previsualizar = async () => {
    setGenerando(true)
    setError('')
    setMsg('')
    try {
      const evs = await construirEventos(12)
      setPreview(evs)
      setMsg(`Se proyectaron ${evs.length} eventos para los próximos 12 meses.`)
    } catch {
      setError('No se pudieron calcular los eventos. Verifica si tienes vehículos, nómina o deudas registrados.')
    } finally {
      setGenerando(false)
    }
  }

  const guardar = async () => {
    if (!preview.length) return
    setGenerando(true)
    setError('')
    try {
      const n = await guardarEventos(preview)
      setMsg(`¡Listo! Se guardaron ${n} eventos en Firestore.`)
      setPreview([])
      cargar()
    } catch {
      setError('No se pudieron guardar los eventos.')
    } finally {
      setGenerando(false)
    }
  }

  const crearManual = async () => {
    if (!nuevo.fecha || !nuevo.titulo.trim()) return
    setCreando(true)
    setError('')
    try {
      await crearEvento({
        titulo: nuevo.titulo.trim(),
        descripcion: nuevo.descripcion.trim() || undefined,
        tipo: nuevo.tipo,
        fechaInicio: nuevo.fecha,
        allDay: true,
        recurrente: false,
        recordatorios: [{ minutosAntes: 60 }],
        relacionado: {},
      })
      setNuevo({ fecha: '', titulo: '', tipo: 'personal', descripcion: '' })
      setMsg('Evento añadido al calendario.')
      cargar()
    } catch {
      setError('No se pudo crear el evento.')
    } finally {
      setCreando(false)
    }
  }

  const borrarEvento = async (id: string) => {
    if (!confirm('¿Deseas eliminar este evento del calendario?')) return
    try {
      await eliminarEvento(id)
      if (editandoId === id) cerrarEdicion()
      cargar()
    } catch {
      setError('No se pudo eliminar el evento.')
    }
  }

  const abrirEdicion = (e: EventoDoc) => {
    setEditandoId(e.id)
    setError('')
    setForm({
      fecha: (e.fechaInicio || '').slice(0, 10),
      titulo: e.titulo || '',
      tipo: e.tipo,
      descripcion: e.descripcion || '',
    })
  }

  const cerrarEdicion = () => {
    setEditandoId(null)
    setForm(null)
  }

  const guardarEdicion = async () => {
    if (!editandoId || !form) return
    if (!form.fecha || !form.titulo.trim()) {
      setError('Completa la fecha y el título del evento.')
      return
    }
    setGuardando(true)
    setError('')
    try {
      await actualizarEvento(editandoId, {
        fechaInicio: form.fecha,
        titulo: form.titulo.trim(),
        tipo: form.tipo,
        descripcion: form.descripcion.trim() || undefined,
      })
      cerrarEdicion()
      cargar()
    } catch {
      setError('No se pudo actualizar el evento.')
    } finally {
      setGuardando(false)
    }
  }

  const eventosDia = diaSel ? porDia[diaSel] ?? [] : []

  return (
    <motion.div
      className="space-y-4"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <Card className="glass-card overflow-hidden border-0">
        <div className="h-1 w-full bg-gradient-to-r from-sky-500 via-teal-400 to-emerald-400" />
        <CardContent className="flex flex-col items-start justify-between gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-emerald-300" />
              <h1 className="text-base font-extrabold tracking-tight text-white">
                Vencimientos financieros
              </h1>
            </div>
            <p className="max-w-xl text-xs leading-relaxed text-mist-500">
              Proyecta fechas críticas: SOAT, Tecnicomecánica, Seguro Todo Riesgo, primas legales (junio/diciembre) y cuotas de préstamos.
            </p>
          </div>

          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Button
              size="sm"
              variant="outline"
              disabled={generando}
              onClick={previsualizar}
              className="h-9 flex-1 cursor-pointer border-white/10 bg-transparent text-xs text-mist-300 hover:bg-white/5 hover:text-white sm:flex-initial"
            >
              <Clock className="mr-1.5 h-3.5 w-3.5" />
              <span>Previsualizar</span>
            </Button>
            <Button
              size="sm"
              disabled={generando || !preview.length}
              onClick={guardar}
              className="h-9 flex-1 cursor-pointer bg-gradient-to-r from-emerald-500 to-teal-400 px-3.5 text-xs font-bold text-[#04241a] hover:brightness-110 sm:flex-initial"
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              <span>Guardar {preview.length ? `(${preview.length})` : ''}</span>
            </Button>
          </div>
        </CardContent>

        {(msg || error) && (
          <div className="space-y-2 px-4 pb-3">
            {msg && (
              <div className="flex items-center gap-1.5 rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-2 text-xs font-medium text-emerald-200">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                <span>{msg}</span>
              </div>
            )}
            {error && (
              <div className="flex items-center gap-1.5 rounded-xl border border-red-400/25 bg-red-500/10 p-2 text-xs font-medium text-red-300">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card className="glass-card overflow-hidden border-0">
        <CardHeader className="flex flex-row items-center justify-between border-b border-white/[0.06] px-4 py-3 sm:px-6">
          <CardTitle className="flex items-center gap-2 text-base font-black tracking-tight text-white capitalize">
            <span>{etiquetaMes}</span>
          </CardTitle>

          <div className="flex items-center gap-1.5">
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8 cursor-pointer border-white/10 bg-transparent text-mist-300 hover:bg-white/5 hover:text-white"
              onClick={() => cambiarMes(-1)}
              title="Mes anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 cursor-pointer border-white/10 bg-transparent px-2.5 text-xs font-bold text-mist-300 hover:bg-white/5 hover:text-white"
              onClick={() => {
                const hoy = new Date()
                setMesVista(new Date(hoy.getFullYear(), hoy.getMonth(), 1))
                setDiaSel(null)
              }}
            >
              Hoy
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8 cursor-pointer border-white/10 bg-transparent text-mist-300 hover:bg-white/5 hover:text-white"
              onClick={() => cambiarMes(1)}
              title="Mes siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-2 p-3 sm:p-5">
          <div className="grid grid-cols-7 gap-1 py-1 text-center text-[11px] font-black tracking-wider text-mist-600 uppercase">
            {DIAS.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {celdas.map((c, i) => {
              if (!c) return <div key={`empty-${i}`} className="min-h-16 rounded-xl bg-white/[0.02] sm:min-h-20" />
              const evs = porDia[c.clave] ?? []
              const esHoy = c.clave === HOY_ISO
              const seleccionado = c.clave === diaSel
              return (
                <button
                  type="button"
                  key={c.clave}
                  onClick={() => setDiaSel(seleccionado ? null : c.clave)}
                  className={`min-h-16 cursor-pointer rounded-xl border p-1 align-top transition-all sm:min-h-20 sm:p-1.5 ${
                    seleccionado
                      ? 'border-emerald-400/50 bg-emerald-400/10 shadow-[0_0_24px_-8px_rgba(16,185,129,0.5)]'
                      : esHoy
                      ? 'border-sky-400/30 bg-sky-400/[0.07]'
                      : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.05]'
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span
                      className={`text-xs font-black ${
                        esHoy
                          ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400 text-[11px] text-[#04241a]'
                          : 'text-mist-300'
                      }`}
                    >
                      {c.dia}
                    </span>
                    {evs.length > 0 && (
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    )}
                  </div>

                  <div className="space-y-0.5">
                    {evs.slice(0, 2).map((e) => (
                      <div
                        key={e.id}
                        className={`truncate rounded-md border px-1 py-0.5 text-[9px] font-bold leading-tight sm:text-[10px] ${
                          COLOR_TIPO[e.tipo] ?? 'border-white/10 bg-white/[0.05] text-mist-300'
                        }`}
                        title={e.titulo}
                      >
                        {e.titulo}
                      </div>
                    ))}
                    {evs.length > 2 && (
                      <div className="pl-0.5 text-[9px] font-bold text-mist-600">
                        +{evs.length - 2} más
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {diaSel && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 space-y-2 rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.07] p-3.5"
            >
              <div className="flex items-center justify-between text-xs font-bold text-white">
                <span>Eventos del {diaSel}</span>
                <span className="text-[11px] font-medium text-emerald-300">
                  {eventosDia.length} programados
                </span>
              </div>

              {eventosDia.length === 0 ? (
                <div className="py-1 text-xs text-mist-500">Sin eventos programados para este día.</div>
              ) : (
                <ul className="divide-y divide-white/[0.06] text-xs">
                  {eventosDia.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-2 py-2">
                      <div>
                        <span className="font-bold text-white">{e.titulo}</span>
                        <span className="text-[11px] text-mist-500"> · {ETIQUETA[e.tipo] ?? e.tipo}</span>
                        {e.descripcion && (
                          <div className="mt-0.5 text-[11px] text-mist-500">{e.descripcion}</div>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 cursor-pointer text-mist-500 hover:bg-white/[0.06] hover:text-white"
                          onClick={() => abrirEdicion(e)}
                          title="Editar"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 cursor-pointer text-mist-500 hover:bg-red-500/10 hover:text-red-300"
                          onClick={() => borrarEvento(e.id)}
                          title="Eliminar"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          )}
        </CardContent>
      </Card>

      {form && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 28 }}>
          <Card className="border border-emerald-400/25 bg-emerald-400/[0.06]">
            <CardHeader className="border-b border-white/[0.06] px-4 py-3">
              <CardTitle className="flex items-center gap-2 text-sm font-bold text-white">
                <Edit2 className="h-4 w-4 text-emerald-300" />
                <span>Modificar evento</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4 text-xs">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="font-bold text-mist-300">Fecha</span>
                  <Input
                    type="date"
                    value={form.fecha}
                    onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                    className="field-dark h-9 text-xs shadow-none"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="font-bold text-mist-300">Tipo</span>
                  <select
                    className="field-dark h-9 rounded-xl px-2 text-xs font-medium outline-none"
                    value={form.tipo}
                    onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoEvento })}
                  >
                    {Object.keys(ETIQUETA).map((k) => (
                      <option key={k} value={k}>
                        {ETIQUETA[k]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 sm:col-span-2">
                  <span className="font-bold text-mist-300">Título</span>
                  <Input
                    value={form.titulo}
                    onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                    className="field-dark h-9 text-xs shadow-none"
                  />
                </label>

                <label className="flex flex-col gap-1 sm:col-span-2">
                  <span className="font-bold text-mist-300">Descripción</span>
                  <Input
                    value={form.descripcion}
                    onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                    className="field-dark h-9 text-xs shadow-none"
                  />
                </label>
              </div>

              <div className="flex gap-2 border-t border-white/[0.06] pt-3">
                <Button
                  size="sm"
                  className="h-9 cursor-pointer gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-400 text-xs font-bold text-[#04241a] hover:brightness-110"
                  disabled={guardando}
                  onClick={guardarEdicion}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>{guardando ? 'Guardando...' : 'Guardar cambios'}</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 cursor-pointer border-white/10 bg-transparent text-xs text-mist-300 hover:bg-white/5 hover:text-white"
                  disabled={guardando}
                  onClick={cerrarEdicion}
                >
                  Cancelar
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <Card className="glass-card overflow-hidden border-0">
        <CardHeader className="border-b border-white/[0.06] px-4 py-3">
          <CardTitle className="flex items-center gap-2 text-sm font-extrabold text-white">
            <PlusCircle className="h-4 w-4 text-emerald-300" />
            <span>Crear evento manual</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-4 text-xs">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="font-bold text-mist-300">Fecha</span>
              <Input
                type="date"
                value={nuevo.fecha}
                onChange={(e) => setNuevo({ ...nuevo, fecha: e.target.value })}
                className="field-dark h-9 text-xs shadow-none"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-bold text-mist-300">Tipo de evento</span>
              <select
                className="field-dark h-9 rounded-xl px-2 text-xs font-medium outline-none"
                value={nuevo.tipo}
                onChange={(e) => setNuevo({ ...nuevo, tipo: e.target.value as TipoEvento })}
              >
                {Object.keys(ETIQUETA).map((k) => (
                  <option key={k} value={k}>
                    {ETIQUETA[k]}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="font-bold text-mist-300">Título del recordatorio</span>
              <Input
                value={nuevo.titulo}
                onChange={(e) => setNuevo({ ...nuevo, titulo: e.target.value })}
                placeholder="Ej: Pago de predial, Mantenimiento preventivo..."
                className="field-dark h-9 text-xs shadow-none"
              />
            </label>

            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="font-bold text-mist-300">Descripción (opcional)</span>
              <Input
                value={nuevo.descripcion}
                onChange={(e) => setNuevo({ ...nuevo, descripcion: e.target.value })}
                placeholder="Notas adicionales..."
                className="field-dark h-9 text-xs shadow-none"
              />
            </label>
          </div>

          <div className="pt-1">
            <Button
              size="sm"
              disabled={creando || !nuevo.fecha || !nuevo.titulo.trim()}
              onClick={crearManual}
              className="h-9 cursor-pointer gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-400 px-4 text-xs font-bold text-[#04241a] hover:brightness-110"
            >
              <span>{creando ? 'Creando...' : 'Crear recordatorio'}</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

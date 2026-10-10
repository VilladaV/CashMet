import { useEffect, useMemo, useState } from 'react'
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
  soat: 'bg-red-100 text-red-800 border-red-200',
  tecnicomecanica: 'bg-orange-100 text-orange-800 border-orange-200',
  seguro_tr: 'bg-amber-100 text-amber-800 border-amber-200',
  cuota_deuda: 'bg-blue-100 text-blue-800 border-blue-200',
  prima_julio: 'bg-green-100 text-green-800 border-green-200',
  prima_diciembre: 'bg-green-100 text-green-800 border-green-200',
  personal: 'bg-slate-100 text-slate-700 border-slate-200',
}

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

  const cargar = () =>
    listarEventos(500)
      .then(setEventos)
      .catch(() => setError('No se pudieron cargar los eventos.'))

  useEffect(() => {
    cargar()
  }, [])

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

  const hoyISO = new Date().toISOString().slice(0, 10)
  const etiquetaMes = mesVista.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })

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
      setMsg(`Se generarán ${evs.length} eventos para los próximos 12 meses.`)
    } catch {
      setError('No se pudieron calcular los eventos. ¿Tienes vehículos, nómina o deudas registrados?')
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
      setMsg(`Se guardaron ${n} eventos.`)
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
      setMsg('Evento creado.')
      cargar()
    } catch {
      setError('No se pudo crear el evento.')
    } finally {
      setCreando(false)
    }
  }

  const borrarEvento = async (id: string) => {
    if (!confirm('¿Eliminar este evento?')) return
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
      setError('Completa fecha y título.')
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
    <div className="container mx-auto p-4 max-w-4xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Calendario (Colombia)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Genera vencimientos desde tus datos: SOAT, tecnicomecánica, seguro todo riesgo, primas de servicios
            (julio/diciembre) y cuotas de deudas, para los próximos 12 meses.
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={generando} onClick={previsualizar}>
              Previsualizar eventos
            </Button>
            <Button size="sm" disabled={generando || !preview.length} onClick={guardar}>
              Guardar {preview.length ? `(${preview.length})` : ''}
            </Button>
          </div>
          {msg && <div className="text-xs text-green-700">{msg}</div>}
          {error && <div className="text-xs text-red-600">{error}</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base capitalize">{etiquetaMes}</CardTitle>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={() => cambiarMes(-1)}>
              ‹
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const hoy = new Date()
                setMesVista(new Date(hoy.getFullYear(), hoy.getMonth(), 1))
                setDiaSel(null)
              }}
            >
              Hoy
            </Button>
            <Button size="sm" variant="outline" onClick={() => cambiarMes(1)}>
              ›
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
            {DIAS.map((d) => (
              <div key={d} className="py-1 font-medium">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {celdas.map((c, i) => {
              if (!c) return <div key={`v${i}`} className="min-h-16 rounded-md" />
              const evs = porDia[c.clave] ?? []
              const esHoy = c.clave === hoyISO
              const seleccionado = c.clave === diaSel
              return (
                <button
                  type="button"
                  key={c.clave}
                  onClick={() => setDiaSel(seleccionado ? null : c.clave)}
                  className={`min-h-16 rounded-md border p-1 text-left align-top transition-colors ${
                    seleccionado ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'
                  }`}
                >
                  <div
                    className={`text-xs mb-1 ${
                      esHoy ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    {c.dia}
                  </div>
                  <div className="space-y-0.5">
                    {evs.slice(0, 2).map((e) => (
                      <div
                        key={e.id}
                        className={`truncate rounded border px-1 text-[10px] leading-4 ${
                          COLOR_TIPO[e.tipo] ?? 'bg-muted text-foreground border-border'
                        }`}
                        title={e.titulo}
                      >
                        {e.titulo}
                      </div>
                    ))}
                    {evs.length > 2 && <div className="text-[10px] text-muted-foreground">+{evs.length - 2} más</div>}
                  </div>
                </button>
              )
            })}
          </div>
          {diaSel && (
            <div className="rounded-md border p-2">
              <div className="text-xs font-medium mb-1">{diaSel}</div>
              {eventosDia.length === 0 ? (
                <div className="text-xs text-muted-foreground">Sin eventos este día.</div>
              ) : (
                <ul className="divide-y">
                  {eventosDia.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-2 py-1.5">
                      <span>
                        {e.titulo}
                        <span className="text-muted-foreground"> · {ETIQUETA[e.tipo] ?? e.tipo}</span>
                      </span>
                      <span className="flex items-center gap-1 shrink-0">
                        <Button size="sm" variant="outline" onClick={() => abrirEdicion(e)}>
                          Editar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => borrarEvento(e.id)}>
                          Eliminar
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {form && (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle className="text-base">Editar evento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Fecha</span>
                <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Tipo</span>
                <select
                  className="h-9 rounded-md border bg-background px-2 text-sm"
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
              <label className="col-span-2 flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Título</span>
                <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
              </label>
              <label className="col-span-2 flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Descripción (opcional)</span>
                <Input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
              </label>
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={guardando} onClick={guardarEdicion}>
                {guardando ? 'Guardando...' : 'Guardar cambios'}
              </Button>
              <Button size="sm" variant="outline" disabled={guardando} onClick={cerrarEdicion}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Crear evento manual</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Fecha</span>
              <Input type="date" value={nuevo.fecha} onChange={(e) => setNuevo({ ...nuevo, fecha: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Tipo</span>
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm"
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
            <label className="col-span-2 flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Título</span>
              <Input
                value={nuevo.titulo}
                onChange={(e) => setNuevo({ ...nuevo, titulo: e.target.value })}
                placeholder="Ej: Pago seguro, Reunión, Viaje..."
              />
            </label>
            <label className="col-span-2 flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Descripción (opcional)</span>
              <Input
                value={nuevo.descripcion}
                onChange={(e) => setNuevo({ ...nuevo, descripcion: e.target.value })}
              />
            </label>
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={creando || !nuevo.fecha || !nuevo.titulo.trim()} onClick={crearManual}>
              {creando ? 'Creando...' : 'Crear evento'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {preview.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Previsualización ({preview.length})</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <ul className="divide-y">
              {preview.map((e, i) => (
                <li key={i} className="flex justify-between py-1.5">
                  <span>
                    {e.fechaInicio} — {e.titulo}
                  </span>
                  <span className="text-muted-foreground">{ETIQUETA[e.tipo] ?? e.tipo}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Eventos guardados</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {eventos.length === 0 ? (
            <p className="text-muted-foreground">Sin eventos guardados todavía.</p>
          ) : (
            <ul className="divide-y">
              {eventos.map((e) => (
                <li key={e.id} className="flex justify-between items-center gap-2 py-1.5">
                  <span>
                    {e.fechaInicio} — {e.titulo}
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-muted-foreground">{ETIQUETA[e.tipo] ?? e.tipo}</span>
                    <Button
                      size="sm"
                      variant={editandoId === e.id ? 'default' : 'outline'}
                      onClick={() => (editandoId === e.id ? cerrarEdicion() : abrirEdicion(e))}
                    >
                      Editar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => borrarEvento(e.id)}>
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

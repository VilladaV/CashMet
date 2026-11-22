import { addDoc, collection, deleteDoc, doc, getDocs, query, updateDoc, where, writeBatch } from 'firebase/firestore'
import { db } from './config'
import { COLLECTIONS } from './collections'
import { limpio, limpioUpdate } from './repoUtils'
import { hoyISO, parseFechaLocal, sumarMeses } from '../fechas'

export type TipoEvento =
  | 'pago_sueldo'
  | 'nomina_trabajador'
  | 'prima_julio'
  | 'prima_diciembre'
  | 'soat'
  | 'tecnicomecanica'
  | 'seguro_tr'
  | 'mantenimiento'
  | 'predial'
  | 'impuesto'
  | 'cuota_deuda'
  | 'recurrente'
  | 'personal'

export interface EventoInput {
  titulo: string
  descripcion?: string
  tipo: TipoEvento
  fechaInicio: string
  allDay: boolean
  recurrente: boolean
  reglaRecurrencia?: string
  recordatorios: Array<{ minutosAntes: number }>
  relacionado: Record<string, string | undefined>
}

export interface EventoDoc extends EventoInput {
  id: string
  activo?: boolean
  sincronizadoGoogle?: boolean
  googleEventId?: string
}

function iso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Construye una fecha en el mes indicado recortando el día al último día real
 * del mes (por ejemplo, día 31 en febrero → 28/29) en lugar de desbordar al
 * mes siguiente.
 */
function fechaEnMes(anio: number, mes0: number, dia: number): Date {
  const ultimoDia = new Date(anio, mes0 + 1, 0).getDate()
  return new Date(anio, mes0, Math.min(Math.max(Math.round(dia), 1), ultimoDia))
}

function enProximoAnio(fecha: string, meses = 12): boolean {
  const f = parseFechaLocal(fecha)
  if (!f) return false
  const hoyStr = hoyISO()
  const hoy = parseFechaLocal(hoyStr)
  const limite = parseFechaLocal(sumarMeses(hoyStr, meses))
  if (!hoy || !limite) return false
  return f.getTime() >= hoy.getTime() && f.getTime() <= limite.getTime()
}

async function leerColeccion(nombre: string): Promise<any[]> {
  const snap = await getDocs(collection(db, nombre))
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))
}

export async function construirEventos(meses = 12): Promise<EventoInput[]> {
  const eventos: EventoInput[] = []
  const recDefault = [{ minutosAntes: 1440 }, { minutosAntes: 60 }]

  const [vehiculos, nominas, deudas, impuestos, propiedades] = await Promise.all([
    leerColeccion(COLLECTIONS.VEHICULOS),
    leerColeccion(COLLECTIONS.NOMINA),
    leerColeccion(COLLECTIONS.DEUDAS),
    leerColeccion(COLLECTIONS.IMPUESTOS),
    leerColeccion(COLLECTIONS.PROPIEDADES),
  ])

  for (const v of vehiculos) {
    if (v.activo === false || v.estado === 'Vendido') continue
    const nombre = `${v.marca ?? ''} ${v.linea ?? ''} ${v.placa ? '(' + v.placa + ')' : ''}`.trim()
    const soat = v.soat?.fechaVencimiento
    if (soat && enProximoAnio(soat, meses)) {
      eventos.push({
        titulo: `SOAT ${nombre}`,
        tipo: 'soat',
        fechaInicio: soat,
        allDay: true,
        recurrente: false,
        recordatorios: recDefault,
        relacionado: { vehiculoId: v.id },
      })
    }
    const tm = v.tecnicomecanica?.fechaVencimiento
    if (tm && enProximoAnio(tm, meses)) {
      eventos.push({
        titulo: `Tecnicomecánica ${nombre}`,
        tipo: 'tecnicomecanica',
        fechaInicio: tm,
        allDay: true,
        recurrente: false,
        recordatorios: recDefault,
        relacionado: { vehiculoId: v.id },
      })
    }
    const str = v.seguroTodoRiesgo?.fechaVencimiento
    if (str && v.seguroTodoRiesgo?.tiene !== false && enProximoAnio(str, meses)) {
      eventos.push({
        titulo: `Seguro todo riesgo ${nombre}`,
        tipo: 'seguro_tr',
        fechaInicio: str,
        allDay: true,
        recurrente: false,
        recordatorios: recDefault,
        relacionado: { vehiculoId: v.id },
      })
    }
    const tareas = (v.mantenimiento?.tareas ?? []) as Array<{
      id?: string
      nombre?: string
      proximaFecha?: string
    }>
    for (const t of tareas) {
      const f = t?.proximaFecha
      if (f && enProximoAnio(f, meses)) {
        eventos.push({
          titulo: `Mantenimiento ${t?.nombre ?? ''} ${nombre}`.trim(),
          tipo: 'mantenimiento',
          fechaInicio: f,
          allDay: true,
          recurrente: false,
          recordatorios: recDefault,
          relacionado: { vehiculoId: v.id, tareaId: t.id },
        })
      }
    }
  }

  for (const imp of impuestos) {
    if (imp.pagado) continue
    const f = imp.fechaVencimiento as string | undefined
    if (f && enProximoAnio(f, meses)) {
      eventos.push({
        titulo: `Impuesto ${imp.nombre ?? ''}`.trim(),
        descripcion: imp.entidad ? `Entidad: ${imp.entidad}` : undefined,
        tipo: 'impuesto',
        fechaInicio: f,
        allDay: true,
        recurrente: false,
        recordatorios: recDefault,
        relacionado: { impuestoId: imp.id },
      })
    }
  }

  for (const prop of propiedades) {
    const f = prop.impuestos?.predial?.fechaVencimiento as string | undefined
    if (f && enProximoAnio(f, meses)) {
      eventos.push({
        titulo: `Predial ${prop.nombre ?? 'Propiedad'}`.trim(),
        descripcion: prop.impuestos?.predial?.municipio ? `Municipio: ${prop.impuestos.predial.municipio}` : undefined,
        tipo: 'predial',
        fechaInicio: f,
        allDay: true,
        recurrente: false,
        recordatorios: recDefault,
        relacionado: { propiedadId: prop.id },
      })
    }
  }

  const ahora = new Date()
  for (const n of nominas) {
    if (n.activo === false) continue
    const diaPago = Math.round(Number(n.fechaPago?.dia) || 0)
    if (diaPago >= 1 && diaPago <= 31) {
      const total = Math.round((Number(n.salarioBaseMensual) || 0) + (Number(n.adicionalMensual) || 0))
      for (let i = 0; i < meses; i++) {
        const base = fechaEnMes(ahora.getFullYear(), ahora.getMonth() + i, diaPago)
        const fechaStr = iso(base)
        if (!enProximoAnio(fechaStr, meses)) continue
        eventos.push({
          titulo: `Pago nómina - ${n.nombreCompleto ?? 'Empleado'}`,
          descripcion: total > 0 ? `Total mensual: $${total.toLocaleString('es-CO')} COP` : undefined,
          tipo: 'nomina_trabajador',
          fechaInicio: fechaStr,
          allDay: true,
          recurrente: true,
          reglaRecurrencia: 'RRULE:FREQ=MONTHLY',
          recordatorios: recDefault,
          relacionado: { nominaId: n.id },
        })
      }
    }
    if (n.primaServicios?.aplica) {
      if (n.primaServicios.mitadJulio) {
        for (let i = 0; i <= 1; i++) {
          const d = new Date(ahora.getFullYear() + i, 5, 30)
          if (enProximoAnio(iso(d), meses)) {
            eventos.push({
              titulo: `Prima de servicios (junio) - ${n.nombreCompleto ?? 'Empleado'}`,
              tipo: 'prima_julio',
              fechaInicio: iso(d),
              allDay: true,
              recurrente: false,
              recordatorios: recDefault,
              relacionado: { nominaId: n.id },
            })
          }
        }
      }
      if (n.primaServicios.mitadDiciembre) {
        for (let i = 0; i <= 1; i++) {
          const d = new Date(ahora.getFullYear() + i, 11, 20)
          if (enProximoAnio(iso(d), meses)) {
            eventos.push({
              titulo: `Prima de servicios (diciembre) - ${n.nombreCompleto ?? 'Empleado'}`,
              tipo: 'prima_diciembre',
              fechaInicio: iso(d),
              allDay: true,
              recurrente: false,
              recordatorios: recDefault,
              relacionado: { nominaId: n.id },
            })
          }
        }
      }
    }
  }

  for (const d of deudas) {
    if (d.estado && d.estado !== 'activa') continue
    const dia = Math.round(Number(d.fechaVencimientoCuota) || 1)
    for (let i = 0; i < meses; i++) {
      const base = fechaEnMes(ahora.getFullYear(), ahora.getMonth() + i, dia)
      const fechaStr = iso(base)
      if (!enProximoAnio(fechaStr, meses)) continue
      eventos.push({
        titulo: `Cuota ${d.nombre ?? 'Deuda'}`,
        descripcion: d.entidad ? `Entidad: ${d.entidad}` : undefined,
        tipo: 'cuota_deuda',
        fechaInicio: fechaStr,
        allDay: true,
        recurrente: true,
        reglaRecurrencia: 'RRULE:FREQ=MONTHLY',
        recordatorios: recDefault,
        relacionado: { deudaId: d.id },
      })
    }
  }

  return eventos
}

function claveEvento(e: EventoInput): string {
  const r = e.relacionado ?? {}
  return [
    e.tipo,
    String(e.fechaInicio ?? '').slice(0, 10),
    e.titulo,
    r.vehiculoId ?? '',
    r.tareaId ?? '',
    r.deudaId ?? '',
    r.impuestoId ?? '',
    r.propiedadId ?? '',
    r.recurrenteId ?? '',
    r.nominaId ?? '',
  ].join('|')
}

export async function guardarEventos(eventos: EventoInput[]): Promise<number> {
  if (!eventos.length) return 0
  const fechas = eventos.map((e) => String(e.fechaInicio ?? '').slice(0, 10)).filter(Boolean).sort()
  const existentes = await listarEventos(5000, fechas[0] ? { desde: fechas[0] } : undefined)
  const vistas = new Set(existentes.map((e) => claveEvento(e)))
  const nuevos: EventoInput[] = []
  for (const e of eventos) {
    const k = claveEvento(e)
    if (vistas.has(k)) continue
    vistas.add(k)
    nuevos.push(e)
  }
  const ahora = Date.now()
  for (let i = 0; i < nuevos.length; i += 400) {
    const lote = writeBatch(db)
    for (const input of nuevos.slice(i, i + 400)) {
      const ref = doc(collection(db, COLLECTIONS.CALENDARIO_EVENTOS))
      lote.set(
        ref,
        limpio({
          ...input,
          recordatorios: input.recordatorios ?? [{ minutosAntes: 60 }],
          relacionado: input.relacionado ?? {},
          sincronizadoGoogle: false,
          activo: true,
          creado: ahora,
          actualizado: ahora,
        } as Record<string, unknown>)
      )
    }
    await lote.commit()
  }
  return nuevos.length
}

export async function eliminarEventosTarea(tareaId: string): Promise<number> {
  const eventos = await getDocs(
    query(collection(db, COLLECTIONS.CALENDARIO_EVENTOS), where('relacionado.tareaId', '==', tareaId))
  )
  await Promise.all(eventos.docs.map((d) => deleteDoc(d.ref)))
  return eventos.size
}

export async function crearEvento(input: EventoInput): Promise<string> {
  const ref = await addDoc(
    collection(db, COLLECTIONS.CALENDARIO_EVENTOS),
    limpio({
      ...input,
      recordatorios: input.recordatorios ?? [{ minutosAntes: 60 }],
      relacionado: input.relacionado ?? {},
      sincronizadoGoogle: false,
      activo: true,
      creado: Date.now(),
      actualizado: Date.now(),
    } as Record<string, unknown>)
  )
  return ref.id
}

export type EventoUpdate = Partial<{
  titulo: string
  descripcion: string | null
  tipo: TipoEvento
  fechaInicio: string
}>

export async function actualizarEvento(id: string, data: EventoUpdate): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.CALENDARIO_EVENTOS, id), limpioUpdate({ ...data, actualizado: Date.now() }))
}

export interface ListarEventosOpts {
  desde?: string
  incluirPasados?: boolean
}

export async function listarEventos(max = 50, opts?: ListarEventosOpts): Promise<EventoDoc[]> {
  const colRef = collection(db, COLLECTIONS.CALENDARIO_EVENTOS)
  const desdeFiltro = opts?.desde ?? (opts?.incluirPasados === false ? hoyISO() : undefined)
  const snap = desdeFiltro
    ? await getDocs(query(colRef, where('fechaInicio', '>=', desdeFiltro)))
    : await getDocs(colRef)
  const activos = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }) as EventoDoc)
    .filter((e) => e.activo !== false)
    .sort((a, b) => (a.fechaInicio || '').localeCompare(b.fechaInicio || ''))

  if (activos.length <= max || desdeFiltro) {
    return activos.slice(0, max)
  }

  // Cuando hay más eventos que el límite sin filtro explícito, priorizamos
  // los futuros (desde hoy) para que el historial antiguo nunca oculte el futuro.
  const hoy = hoyISO()
  const futuros = activos.filter((e) => (e.fechaInicio || '') >= hoy)
  if (futuros.length >= max) return futuros.slice(0, max)
  const pasados = activos.filter((e) => (e.fechaInicio || '') < hoy)
  const cupoPasados = max - futuros.length
  return [...pasados.slice(-cupoPasados), ...futuros]
}

export async function eliminarEvento(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.CALENDARIO_EVENTOS, id))
}

export async function marcarSincronizadoGoogle(id: string, googleEventId: string): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.CALENDARIO_EVENTOS, id), {
    googleEventId,
    sincronizadoGoogle: true,
    actualizado: Date.now(),
  })
}

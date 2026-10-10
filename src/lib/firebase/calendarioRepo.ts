import { addDoc, collection, deleteDoc, doc, getDocs, updateDoc } from 'firebase/firestore'
import { db } from './config'
import { COLLECTIONS } from './collections'
import { limpio } from './repoUtils'

export type TipoEvento =
  | 'pago_sueldo'
  | 'nomina_trabajador'
  | 'prima_julio'
  | 'prima_diciembre'
  | 'soat'
  | 'tecnicomecanica'
  | 'seguro_tr'
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
}

function iso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function enProximoAnio(fecha: string, meses = 12): boolean {
  const f = new Date(fecha)
  if (Number.isNaN(f.getTime())) return false
  const hoy = new Date()
  const limite = new Date()
  limite.setMonth(limite.getMonth() + meses)
  return f >= new Date(hoy.toDateString()) && f <= limite
}

async function leerColeccion(nombre: string): Promise<any[]> {
  const snap = await getDocs(collection(db, nombre))
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))
}

export async function construirEventos(meses = 12): Promise<EventoInput[]> {
  const eventos: EventoInput[] = []
  const recDefault = [{ minutosAntes: 1440 }, { minutosAntes: 60 }]

  const [vehiculos, nominas, deudas] = await Promise.all([
    leerColeccion(COLLECTIONS.VEHICULOS),
    leerColeccion(COLLECTIONS.NOMINA),
    leerColeccion(COLLECTIONS.DEUDAS),
  ])

  for (const v of vehiculos) {
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
    if (str && v.seguroTodoRiesgo?.tiene && enProximoAnio(str, meses)) {
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
  }

  const ahora = new Date()
  for (const n of nominas) {
    if (n.activo === false) continue
    if (n.primaServicios?.aplica) {
      if (n.primaServicios.mitadJulio) {
        for (let i = 0; i <= 1; i++) {
          const d = new Date(ahora.getFullYear() + i, 6, 30)
          if (enProximoAnio(iso(d), meses)) {
            eventos.push({
              titulo: `Prima de servicios (julio) - ${n.nombreCompleto ?? 'Empleado'}`,
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
    const dia = Number(d.fechaVencimientoCuota) || 1
    for (let i = 0; i < meses; i++) {
      const base = new Date(ahora.getFullYear(), ahora.getMonth() + i, dia)
      if (base < new Date(ahora.toDateString())) continue
      eventos.push({
        titulo: `Cuota ${d.nombre ?? 'Deuda'}`,
        descripcion: d.entidad ? `Entidad: ${d.entidad}` : undefined,
        tipo: 'cuota_deuda',
        fechaInicio: iso(base),
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

export async function guardarEventos(eventos: EventoInput[]): Promise<number> {
  let creados = 0
  for (const e of eventos) {
    await crearEvento(e)
    creados++
  }
  return creados
}

export async function crearEvento(input: EventoInput): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTIONS.CALENDARIO_EVENTOS), {
    ...input,
    recordatorios: input.recordatorios ?? [{ minutosAntes: 60 }],
    relacionado: input.relacionado ?? {},
    sincronizadoGoogle: false,
    activo: true,
    creado: Date.now(),
    actualizado: Date.now(),
  })
  return ref.id
}

export type EventoUpdate = Partial<Pick<EventoInput, 'titulo' | 'descripcion' | 'tipo' | 'fechaInicio'>>

export async function actualizarEvento(id: string, data: EventoUpdate): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.CALENDARIO_EVENTOS, id), limpio({ ...data, actualizado: Date.now() }))
}

export async function listarEventos(max = 50): Promise<EventoDoc[]> {
  const items = await leerColeccion(COLLECTIONS.CALENDARIO_EVENTOS)
  return (items as EventoDoc[])
    .filter((e) => e.activo !== false)
    .sort((a, b) => (a.fechaInicio || '').localeCompare(b.fechaInicio || ''))
    .slice(0, max)
}

export async function eliminarEvento(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.CALENDARIO_EVENTOS, id))
}

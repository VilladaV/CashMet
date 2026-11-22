import { interpretarLote, interpretarMensaje, interpretarTransferencia, type Interpretacion } from './engine'
import { geminiDisponible, interpretarConGemini } from '@/ai/gemini'
import { convertirACOP } from '@/lib/fx'
import { hoyISO } from '@/lib/fechas'

export { geminiDisponible }

export interface ContextoChat {
  cuentas: string[]
  historial?: Array<{ rol: 'user' | 'ia'; texto: string }>
  snapshot?: string
}

const MENSAJE_CUOTA =
  'Se me agotó la cuota gratuita de la IA por hoy 😅. Mientras se renueva, el registro sí sigue funcionando: ' +
  'escríbeme por ejemplo "gasté 30.000 en mercado" o "me pagaron 2.000.000". ' +
  'Para análisis y conversación, inténtalo más tarde o mañana. 💛'

const AVISO_SIN_TASA =
  'No pude consultar la tasa de cambio en este momento, así que dejé el monto para que lo escribas en pesos antes de confirmar. 🙏'

const AVISO_ACCION_CANCELADA_SIN_TASA =
  'No pude consultar la tasa de cambio en este momento, así que no ejecuté la operación para evitar registrar un monto equivocado en pesos. Intenta de nuevo o dime el valor en COP. 🙏'

function esExtranjera(moneda: unknown): boolean {
  const m = String(moneda ?? 'COP').trim().toUpperCase()
  return m !== '' && m !== 'COP'
}

async function convertirExtranjeras(interp: Interpretacion): Promise<Interpretacion> {
  const borradores = [
    ...(interp.borrador ? [interp.borrador] : []),
    ...(interp.lote ?? []).flatMap((a) => (a.borrador ? [a.borrador] : [])),
  ].filter((b) => esExtranjera(b.moneda) && b.monto > 0)

  // Omitimos acciones que ya traen borrador para evitar doble conversión.
  const accionesConMoneda = (interp.lote ?? []).filter(
    (a) => !a.borrador && a.params && esExtranjera(a.params.moneda) && Number(a.params.monto) > 0
  )

  const tieneRaizConMoneda =
    !interp.borrador &&
    Boolean(interp.params) &&
    esExtranjera(interp.params?.moneda) &&
    Number(interp.params?.monto) > 0 &&
    !interp.acciones.includes('consulta_conversion')

  if (!borradores.length && !accionesConMoneda.length && !tieneRaizConMoneda) return interp

  let falloBorrador = false
  let canceladaAccion = false

  for (const b of borradores) {
    const conv = await convertirACOP(b.monto, String(b.moneda))
    if (!conv) {
      b.montoOriginal = b.monto
      b.monto = 0
      falloBorrador = true
      continue
    }
    b.montoOriginal = b.monto
    b.tasaCambio = conv.tasa
    b.monto = conv.montoCOP
  }

  if (tieneRaizConMoneda && interp.params) {
    const original = Number(interp.params.monto)
    const conv = await convertirACOP(original, String(interp.params.moneda))
    if (!conv) {
      canceladaAccion = true
      interp.acciones = []
      interp.params = undefined
    } else {
      interp.params.montoOriginal = original
      interp.params.tasaCambio = conv.tasa
      interp.params.monto = conv.montoCOP
      if ('valor' in interp.params) interp.params.valor = conv.montoCOP
    }
  }

  if (accionesConMoneda.length && interp.lote) {
    const accionesFallidas = new Set<(typeof accionesConMoneda)[number]>()
    for (const a of accionesConMoneda) {
      if (a.nombre === 'consulta_conversion') continue
      const params = a.params as Record<string, unknown>
      const original = Number(params.monto)
      const conv = await convertirACOP(original, String(params.moneda))
      if (!conv) {
        canceladaAccion = true
        accionesFallidas.add(a)
        continue
      }
      params.montoOriginal = original
      params.tasaCambio = conv.tasa
      params.monto = conv.montoCOP
      if ('valor' in params) params.valor = conv.montoCOP
    }
    if (accionesFallidas.size > 0) {
      interp.lote = interp.lote.filter((a) => !accionesFallidas.has(a))
      interp.acciones = interp.lote.map((a) => a.nombre)
      if (!interp.lote.length) interp.lote = undefined
    }
  }

  if (canceladaAccion) {
    interp.respuesta = AVISO_ACCION_CANCELADA_SIN_TASA
  } else if (falloBorrador) {
    interp.respuesta = `${AVISO_SIN_TASA}\n\n${interp.respuesta}`
  }
  return interp
}

export async function interpretar(mensaje: string, contexto: ContextoChat): Promise<Interpretacion> {
  let interp: Interpretacion

  if (geminiDisponible) {
    try {
      interp = await interpretarConGemini(mensaje, {
        hoy: hoyISO(),
        cuentas: contexto.cuentas,
        historial: contexto.historial,
        snapshot: contexto.snapshot,
      })
    } catch (e) {
      console.warn('Gemini no disponible; usando parser local.', e)
      const local =
        interpretarTransferencia(mensaje, contexto.cuentas) ?? interpretarLote(mensaje) ?? interpretarMensaje(mensaje)
      const sinAccion = !local.acciones.length && !local.lote?.length
      if ((e as Error)?.message === 'gemini_cuota' && sinAccion) {
        return { respuesta: MENSAJE_CUOTA, acciones: [] }
      }
      interp = local
    }
  } else {
    interp =
      interpretarTransferencia(mensaje, contexto.cuentas) ?? interpretarLote(mensaje) ?? interpretarMensaje(mensaje)
  }

  return convertirExtranjeras(interp)
}

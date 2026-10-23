import { interpretarLote, interpretarMensaje, interpretarTransferencia, type Interpretacion } from './engine'
import { geminiDisponible, interpretarConGemini } from '@/ai/gemini'
import { convertirACOP } from '@/lib/fx'

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

function esExtranjera(moneda: unknown): boolean {
  const m = String(moneda ?? 'COP').trim().toUpperCase()
  return m !== '' && m !== 'COP'
}

async function convertirExtranjeras(interp: Interpretacion): Promise<Interpretacion> {
  const borradores = [
    ...(interp.borrador ? [interp.borrador] : []),
    ...(interp.lote ?? []).flatMap((a) => (a.borrador ? [a.borrador] : [])),
  ].filter((b) => esExtranjera(b.moneda) && b.monto > 0)

  const accionesConMoneda = (interp.lote ?? []).filter(
    (a) => a.params && esExtranjera(a.params.moneda) && Number(a.params.monto) > 0,
  )

  if (!borradores.length && !accionesConMoneda.length) return interp

  let fallo = false

  for (const b of borradores) {
    const conv = await convertirACOP(b.monto, String(b.moneda))
    if (!conv) {
      b.montoOriginal = b.monto
      b.monto = 0
      fallo = true
      continue
    }
    b.montoOriginal = b.monto
    b.tasaCambio = conv.tasa
    b.monto = conv.montoCOP
  }

  for (const a of accionesConMoneda) {
    const params = a.params as Record<string, unknown>
    const original = Number(params.monto)
    const conv = await convertirACOP(original, String(params.moneda))
    if (!conv) {
      fallo = true
      continue
    }
    params.montoOriginal = original
    params.tasaCambio = conv.tasa
    params.monto = conv.montoCOP
  }

  if (fallo) interp.respuesta = `${AVISO_SIN_TASA}\n\n${interp.respuesta}`
  return interp
}

export async function interpretar(mensaje: string, contexto: ContextoChat): Promise<Interpretacion> {
  let interp: Interpretacion

  if (geminiDisponible) {
    try {
      interp = await interpretarConGemini(mensaje, {
        hoy: new Date().toISOString().slice(0, 10),
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

  if (!interp.acciones.length && !interp.lote?.length) {
    const transferencia = interpretarTransferencia(mensaje, contexto.cuentas)
    if (transferencia) interp = transferencia
  }

  return convertirExtranjeras(interp)
}

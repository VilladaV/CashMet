import { interpretarLote, interpretarMensaje, type Interpretacion } from './engine'
import { geminiDisponible, interpretarConGemini } from '@/ai/gemini'

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

export async function interpretar(mensaje: string, contexto: ContextoChat): Promise<Interpretacion> {
  if (geminiDisponible) {
    try {
      return await interpretarConGemini(mensaje, {
        hoy: new Date().toISOString().slice(0, 10),
        cuentas: contexto.cuentas,
        historial: contexto.historial,
        snapshot: contexto.snapshot,
      })
    } catch (e) {
      console.warn('Gemini no disponible; usando parser local.', e)
      const local = interpretarLote(mensaje) ?? interpretarMensaje(mensaje)
      const sinAccion = !local.acciones.length && !local.lote?.length
      if ((e as Error)?.message === 'gemini_cuota' && sinAccion) {
        return { respuesta: MENSAJE_CUOTA, acciones: [] }
      }
      return local
    }
  }
  return interpretarLote(mensaje) ?? interpretarMensaje(mensaje)
}

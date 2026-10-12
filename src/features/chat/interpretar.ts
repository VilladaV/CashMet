import { interpretarLote, interpretarMensaje, type Interpretacion } from './engine'
import { geminiDisponible, interpretarConGemini } from '@/ai/gemini'

export { geminiDisponible }

export interface ContextoChat {
  cuentas: string[]
}

export async function interpretar(mensaje: string, contexto: ContextoChat): Promise<Interpretacion> {
  if (geminiDisponible) {
    try {
      return await interpretarConGemini(mensaje, {
        hoy: new Date().toISOString().slice(0, 10),
        cuentas: contexto.cuentas,
      })
    } catch (e) {
      console.warn('Gemini no disponible; usando parser local.', e)
    }
  }
  return interpretarLote(mensaje) ?? interpretarMensaje(mensaje)
}

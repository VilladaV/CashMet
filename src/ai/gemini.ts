import type { Interpretacion } from '@/features/chat/engine'

const API_KEY = (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim()
const MODELO = (import.meta.env.VITE_GEMINI_MODEL as string | undefined)?.trim() || 'gemini-2.0-flash'
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

export const geminiDisponible = Boolean(API_KEY)

const SISTEMA = `Eres el clasificador de intenciones de CashMet, un asistente financiero personal en Colombia (moneda COP).
Debes convertir el mensaje del usuario en UNA acción y sus parámetros. Responde SIEMPRE con un único objeto JSON válido, sin texto adicional ni bloques de código.

Formato: {"accion":"...","respuesta":"...","params":{...}}

Acciones permitidas y sus params:
- registrar_movimiento: {tipo:"gasto"|"ingreso", fecha:"YYYY-MM-DD", concepto:"...", monto:numero entero COP sin puntos ni símbolos, categoria:"..."}
- consulta_saldos: {}
- busqueda_movimientos: {}
- resumen_mes: {mes:"YYYY-MM"}
- generar_calendario: {}
- pago_deuda: {monto:numero, fecha:"YYYY-MM-DD", nombre:"texto"}
- pago_nomina: {monto:numero, fecha:"YYYY-MM-DD", nombre:"texto"}
- crear_recurrente: {concepto:"...", monto:numero, categoria:"hogar"|"transporte"|"salud"|"educacion"|"servicios"|"otro", periodicidad:"mensual"|"bimestral"|"trimestral"|"semestral"|"anual", diaVencimiento:numero}
- crear_evento: {titulo:"...", fecha:"YYYY-MM-DD"}
- investigar_vehiculo: {marca:"...", linea:"...", modelo:numero, cilindraje:numero}
- crear_vehiculo: {placa:"...", marca:"...", linea:"...", modelo:numero, tipo:"carro"|"moto"|"camion"|"otro", cilindraje:numero}
- ayuda: {}

Reglas:
- "respuesta" es un texto breve en español que describe lo que entendiste (no ejecutes nada).
- Si el usuario registra un gasto o ingreso normal usa registrar_movimiento.
- Usa pago_nomina solo para sueldos/salarios; pago_deuda para cuotas, créditos, tarjetas o préstamos.
- Usa crear_recurrente si menciona "recurrente", "mensual", "fijo", "cada mes" o "todos los meses" con un gasto.
- Usa crear_evento si pide agendar, recordar, una cita/reunión, o algo que "vence el día N".
- Si falta el monto en un gasto/ingreso, igualmente devuelve registrar_movimiento con monto 0 y explica en "respuesta".
- Interpreta fechas relativas (hoy, mañana, ayer, el 15) usando la fecha actual entregada.
- Solo JSON.`

function limpiarJson(texto: string): string {
  const sinFences = texto.replace(/```json/gi, '').replace(/```/g, '').trim()
  const ini = sinFences.indexOf('{')
  const fin = sinFences.lastIndexOf('}')
  return ini >= 0 && fin > ini ? sinFences.slice(ini, fin + 1) : sinFences
}

function fechaValida(v: unknown, fallback: string): string {
  const s = String(v ?? '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : fallback
}

function num(v: unknown): number {
  const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? Math.round(n) : 0
}

interface Contexto {
  hoy: string
  cuentas: string[]
}

export async function interpretarConGemini(mensaje: string, contexto: Contexto): Promise<Interpretacion> {
  if (!API_KEY) throw new Error('gemini_sin_clave')

  const contextoTexto = `Fecha actual: ${contexto.hoy}. Cuentas del usuario: ${
    contexto.cuentas.length ? contexto.cuentas.join(', ') : 'ninguna'
  }.`

  const body = {
    systemInstruction: { parts: [{ text: SISTEMA }] },
    contents: [{ role: 'user', parts: [{ text: `${contextoTexto}\n\nMensaje: ${mensaje}` }] }],
    generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
  }

  const res = await fetch(`${ENDPOINT}/${MODELO}:generateContent?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`gemini_http_${res.status}`)

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const texto = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('')
  const parsed = JSON.parse(limpiarJson(texto)) as {
    accion?: string
    respuesta?: string
    params?: Record<string, unknown>
  }

  const accion = String(parsed.accion ?? 'ayuda')
  const params = parsed.params ?? {}
  const respuesta = String(parsed.respuesta ?? '').trim()

  if (accion === 'registrar_movimiento') {
    const tipo = params.tipo === 'ingreso' ? 'ingreso' : 'gasto'
    return {
      respuesta: respuesta || 'Revisa y confirma el movimiento:',
      acciones: ['requiere_confirmacion'],
      borrador: {
        tipo,
        fecha: fechaValida(params.fecha, contexto.hoy),
        concepto: String(params.concepto ?? '').trim() || 'Movimiento',
        monto: num(params.monto),
        categoria: String(params.categoria ?? '').trim() || (tipo === 'ingreso' ? 'Ingresos' : 'Otros'),
      },
      params,
    }
  }

  if (accion === 'crear_evento') {
    params.fecha = fechaValida(params.fecha, contexto.hoy)
  }
  if (accion === 'pago_deuda' || accion === 'pago_nomina') {
    params.fecha = fechaValida(params.fecha, contexto.hoy)
    params.monto = num(params.monto)
  }
  if (accion === 'crear_recurrente') {
    params.monto = num(params.monto)
    params.valor = params.monto
  }
  if (accion === 'resumen_mes') {
    params.mes = String(params.mes ?? contexto.hoy.slice(0, 7)).slice(0, 7)
  }

  return {
    respuesta: respuesta || 'No estoy seguro de cómo ayudarte con eso. Escribe "ayuda" para ver lo que puedo hacer.',
    acciones: [accion],
    params,
  }
}

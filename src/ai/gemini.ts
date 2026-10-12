import type { AccionInterpretada, Interpretacion } from '@/features/chat/engine'

const API_KEY = (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim()
const MODELO = (import.meta.env.VITE_GEMINI_MODEL as string | undefined)?.trim() || 'gemini-3.8-flash'
const MODELOS_FALLBACK = ['gemini-flash-latest', 'gemini-2.5-flash']
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

export const geminiDisponible = Boolean(API_KEY)

const SISTEMA = `Eres Lucía, la contadora personal y de confianza del usuario en CashMet (Colombia, moneda COP).
Hablas como una contadora colombiana cercana: cálida, natural, tuteas, usas un lenguaje sencillo y de vez en cuando expresas una opinión breve sobre las finanzas (una sola frase, sin regañar ni sermonear).
Nunca inventas montos, fechas ni datos que el usuario no haya dicho.

Tu trabajo tiene dos partes: (1) conversar de forma humana y (2) convertir lo que dice el usuario en transacciones.
Tienes acceso a los mensajes anteriores de la conversación: úsalos para dar CONTINUIDAD, recordar lo que ya te contó y mantener un hilo natural (por ejemplo, si antes hablaron de un gasto y ahora dice "súmale 5.000", entiende que se refiere a ese gasto). No vuelvas a registrar transacciones que ya aparecían en mensajes anteriores; solo procesa el mensaje nuevo.
Responde SIEMPRE con un único objeto JSON válido, sin texto adicional ni bloques de código:
{"mensaje":"...","acciones":[{"accion":"...","params":{...}}]}

- "mensaje": lo que le dices a la persona (1-3 frases, tono humano; puede incluir una opinión o un consejo corto).
- "acciones": lista con TODAS las transacciones detectadas (puede estar vacía).

MUY IMPORTANTE: un mismo mensaje puede contener VARIAS transacciones. Detéctalas TODAS y devuélvelas como acciones separadas, en el mismo orden.
Ejemplo: "compré un almuerzo por 25k y luego me regalaron 70k" → DOS acciones: registrar_movimiento {tipo:"gasto", monto:25000, concepto:"Almuerzo", categoria:"Alimentación"} y registrar_movimiento {tipo:"ingreso", monto:70000, concepto:"Regalo", categoria:"Ingreso"}.

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
- Si es solo conversación (saludo, charla, pregunta general o de opinión), deja "acciones" vacía y contesta con tu "mensaje".
- Nunca digas que ya guardaste o registraste un movimiento: se le muestra al usuario una tarjeta para que lo confirme. Invítalo a revisarlo (ej: "te lo dejo para que lo confirmes").
- Gasto o ingreso normal → registrar_movimiento. Sueldos/salarios → pago_nomina; cuotas, créditos, tarjetas o préstamos → pago_deuda.
- crear_recurrente si menciona "recurrente", "mensual", "fijo", "cada mes" o "todos los meses" con un gasto.
- crear_evento si pide agendar, recordar, una cita/reunión, o algo que "vence el día N".
- Si falta el monto, usa monto 0 y pídelo amablemente en "mensaje".
- Interpreta fechas relativas (hoy, mañana, ayer, "el 15") usando la fecha actual entregada.
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

interface TurnoHistorial {
  rol: 'user' | 'ia'
  texto: string
}

interface Contexto {
  hoy: string
  cuentas: string[]
  historial?: TurnoHistorial[]
}

async function llamarGemini(body: unknown): Promise<Response | null> {
  const candidatos = [MODELO, ...MODELOS_FALLBACK].filter((m, i, a) => m && a.indexOf(m) === i)
  for (const modelo of candidatos) {
    const r = await fetch(`${ENDPOINT}/${modelo}:generateContent?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (r.ok) return r
  }
  return null
}

export async function interpretarConGemini(mensaje: string, contexto: Contexto): Promise<Interpretacion> {
  if (!API_KEY) throw new Error('gemini_sin_clave')

  const contextoTexto = `Fecha actual: ${contexto.hoy}. Cuentas del usuario: ${
    contexto.cuentas.length ? contexto.cuentas.join(', ') : 'ninguna'
  }.`

  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = []
  for (const turno of contexto.historial ?? []) {
    const t = String(turno.texto ?? '').trim()
    if (!t) continue
    const role = turno.rol === 'user' ? 'user' : 'model'
    const ultimo = contents[contents.length - 1]
    if (ultimo && ultimo.role === role) ultimo.parts.push({ text: t })
    else contents.push({ role, parts: [{ text: t }] })
  }
  while (contents.length && contents[0].role !== 'user') contents.shift()
  contents.push({ role: 'user', parts: [{ text: `${contextoTexto}\n\nMensaje: ${mensaje}` }] })

  const body = {
    systemInstruction: { parts: [{ text: SISTEMA }] },
    contents,
    generationConfig: { temperature: 0.3, responseMimeType: 'application/json' },
  }

  const res = await llamarGemini(body)
  if (!res) throw new Error('gemini_no_disponible')

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const texto = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('')
  const parsed = JSON.parse(limpiarJson(texto)) as {
    mensaje?: string
    respuesta?: string
    acciones?: Array<{ accion?: string; params?: Record<string, unknown> }>
    accion?: string
    params?: Record<string, unknown>
  }

  const mensajeHumano = String(parsed.mensaje ?? parsed.respuesta ?? '').trim()

  let crudas = Array.isArray(parsed.acciones) ? parsed.acciones : []
  if (!crudas.length && parsed.accion) crudas = [{ accion: parsed.accion, params: parsed.params }]

  const lote: AccionInterpretada[] = []
  for (const a of crudas) {
    const nombre = String(a.accion ?? '').trim()
    if (!nombre) continue
    const params = { ...(a.params ?? {}) }

    if (nombre === 'registrar_movimiento') {
      const tipo = params.tipo === 'ingreso' ? 'ingreso' : 'gasto'
      lote.push({
        nombre: 'requiere_confirmacion',
        params,
        borrador: {
          tipo,
          fecha: fechaValida(params.fecha, contexto.hoy),
          concepto: String(params.concepto ?? '').trim() || 'Movimiento',
          monto: num(params.monto),
          categoria: String(params.categoria ?? '').trim() || (tipo === 'ingreso' ? 'Ingresos' : 'Otros'),
        },
      })
      continue
    }

    if (nombre === 'crear_evento') params.fecha = fechaValida(params.fecha, contexto.hoy)
    if (nombre === 'pago_deuda' || nombre === 'pago_nomina') {
      params.fecha = fechaValida(params.fecha, contexto.hoy)
      params.monto = num(params.monto)
    }
    if (nombre === 'crear_recurrente') {
      params.monto = num(params.monto)
      params.valor = params.monto
    }
    if (nombre === 'resumen_mes') {
      params.mes = String(params.mes ?? contexto.hoy.slice(0, 7)).slice(0, 7)
    }
    lote.push({ nombre, params })
  }

  const soloConversacion = lote.length === 0
  return {
    respuesta:
      mensajeHumano ||
      (soloConversacion
        ? 'Cuéntame en qué te ayudo con tus cuentas. 💛'
        : 'Listo, revisa esto y confírmalo cuando quieras 👇'),
    acciones: lote.map((a) => a.nombre),
    lote: lote.length ? lote : undefined,
  }
}

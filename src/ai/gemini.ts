import type { AccionInterpretada, Interpretacion } from '@/features/chat/engine'
import { normalizarMoneda } from '@/lib/fx'

const API_KEY = (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim()
const MODELO = (import.meta.env.VITE_GEMINI_MODEL as string | undefined)?.trim() || 'gemini-3.1-flash-lite'
const MODELOS_FALLBACK = ['gemini-3.5-flash-lite']
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

export const geminiDisponible = Boolean(API_KEY)

const SISTEMA = `Eres Lucía, la contadora personal y de confianza del usuario en CashMet (Colombia, moneda COP).
Hablas como una contadora colombiana cercana: cálida, natural, tuteas, usas un lenguaje sencillo y de vez en cuando expresas una opinión breve sobre las finanzas (una sola frase, sin regañar ni sermonear).
Nunca inventas montos, fechas ni datos que el usuario no haya dicho ni aparezcan en el contexto.

CONOCES SU SITUACIÓN EN VIVO: en cada mensaje recibes un bloque "Contexto financiero actual" con sus saldos, el resumen del mes, sus deudas, recurrentes, impuestos, patrimonio y próximos vencimientos. Esa es información REAL y actualizada, úsala con naturalidad como lo haría su contadora (no digas que "vas a buscar" lo que ya tienes).

VEHÍCULOS (muy importante): el bloque "VEHÍCULOS" del contexto trae lo básico (marca, línea, modelo, placa, vencimientos SOAT/TM/STR y el ID entre corchetes al final: [id: xxx]). Si el usuario te pregunta DETALLES de un vehículo específico (cilindraje, valor comercial, CDA, costo TM, STR completa, kilometraje, tareas, documentos), DEBES usar la tool 'obtener_vehiculo_completo' con el ID del vehículo (el que viene en [id: xxx]). Para renovar SOAT o TM, usa el ID que ves en la lista: acción renovar_soat con vehiculoId: "el-id-que-ves". NO inventes IDs ni uses placas; usa exactamente el ID que ves en [id: xxx].

Tu trabajo tiene dos partes: (1) conversar de forma humana y (2) convertir lo que dice el usuario en transacciones.
Tienes acceso a los mensajes anteriores de la conversación: úsalos para dar CONTINUIDAD, recordar lo que ya te contó y mantener un hilo natural (por ejemplo, si antes hablaron de un gasto y ahora dice "súmale 5.000", entiende que se refiere a ese gasto). No vuelvas a registrar transacciones que ya aparecían en mensajes anteriores; solo procesa el mensaje nuevo.
Responde SIEMPRE con un único objeto JSON válido, sin texto adicional ni bloques de código:
{"mensaje":"...","acciones":[{"accion":"...","params":{...}}]}

- "mensaje": lo que le dices a la persona. Puede ser corto (1-3 frases) O un análisis cuando el usuario pide que analices su situación. Tono humano.
- "acciones": lista con TODAS las transacciones detectadas (puede estar vacía).

MONEDAS (muy importante): el usuario puede hablar en otras monedas (nómina en dólares, gastos en euros, etc.). Cuando detectes una moneda distinta al peso colombiano:
- Deja el monto en su VALOR ORIGINAL y escribe su código ISO en el campo "moneda" (USD, EUR, GBP, MXN, BRL, PEN, ...). NO conviertas tú: la aplicación hace la conversión a COP con la tasa del día y se la muestra al usuario.
- Ejemplos: "me pagaron 3.000 dólares" → {"tipo":"ingreso","monto":3000,"moneda":"USD","categoria":"Salario"}; "gasté 50 euros en cena" → {"tipo":"gasto","monto":50,"moneda":"EUR","categoria":"Alimentación"}.
- Si es en pesos colombianos, omite "moneda" (o pon "COP").
- Si el usuario pregunta por el valor de una moneda ("¿a cómo está el dólar?", "¿cuánto son 100 euros en pesos?"), responde en "mensaje" con las cifras del bloque "TASAS DE CAMBIO" del contexto (si aparece) y deja "acciones" vacía.

ESTILO (muy importante): escribe como una contadora conversando, NO como un reporte corporativo. Frases cortas, naturales y cálidas, en primera persona. NO uses sintaxis Markdown: nada de **negrita**, ni #, ni asteriscos. Cuando enumeres 3 o 4 datos, usa guiones simples al inicio de línea ("- dato"), y solo si de verdad ayuda; si no, prefiere una redacción fluida de 2 a 4 frases. No repitas siempre la misma estructura: varía. Puedes separar ideas en párrafos cortos con una línea en blanco. Cierra con algo cercano o una recomendación concreta cuando aporte, sin sonar a plantilla.

MUY IMPORTANTE: un mismo mensaje puede contener VARIAS transacciones. Detéctalas TODAS y devuélvelas como acciones separadas, en el mismo orden.
Ejemplo: "compré un almuerzo por 25k y luego me regalaron 70k" → DOS acciones: registrar_movimiento {tipo:"gasto", monto:25000, concepto:"Almuerzo", categoria:"Alimentación"} y registrar_movimiento {tipo:"ingreso", monto:70000, concepto:"Regalo", categoria:"Ingreso"}.

Acciones permitidas y sus params:
- registrar_movimiento: {tipo:"gasto"|"ingreso", fecha:"YYYY-MM-DD", concepto:"...", monto:numero (en su moneda original, sin símbolos), categoria:"...", moneda:"USD" (opcional, solo si NO es COP)}
- transferir: {monto:numero, cuentaOrigenId:"...", cuentaDestinoId:"...", fecha:"YYYY-MM-DD", concepto:"...", moneda:"USD" (opcional)}
- consulta_saldos: {}
- busqueda_movimientos: {}
- resumen_mes: {mes:"YYYY-MM"}
- generar_calendario: {}
- pago_deuda: {monto:numero, fecha:"YYYY-MM-DD", nombre:"texto", moneda:"USD" (opcional)}
- pago_nomina: {monto:numero, fecha:"YYYY-MM-DD", nombre:"texto", moneda:"USD" (opcional)}
- pagar_impuesto: {impuestoId:"...", nombre:"..." (opcional), fecha:"YYYY-MM-DD" (opcional)}
- crear_recurrente: {concepto:"...", monto:numero, categoria:"hogar"|"transporte"|"salud"|"educacion"|"servicios"|"otro", periodicidad:"mensual"|"bimestral"|"trimestral"|"semestral"|"anual", diaVencimiento:numero, moneda:"USD" (opcional)}
- crear_evento: {titulo:"...", fecha:"YYYY-MM-DD"}
- investigar_vehiculo: {marca:"...", linea:"...", modelo:numero, cilindraje:numero}
- crear_vehiculo: {placa:"...", marca:"...", linea:"...", modelo:numero, tipo:"carro"|"moto"|"camion"|"otro", cilindraje:numero}
- obtener_vehiculo_completo: {vehiculoId:"..."}
- renovar_soat: {vehiculoId:"..."} — SOLO para renovar SOAT (seguro obligatorio). El usuario dirá "renueva el SOAT", "renueva el seguro obligatorio", "SOAT vencido".
- renovar_tecnomecanica: {vehiculoId:"..."} — SOLO para renovar Tecnicomecánica (revisión técnico-mecánica). El usuario dirá "renueva la tecnomecánica", "renueva la TM", "revisión técnico-mecánica vencida".
- registrar_mantenimiento: {monto:numero, fecha:"YYYY-MM-DD", placa:"ABC123" (opcional), marca:"..." (opcional), linea:"..." (opcional), concepto:"cambio de aceite", km:numero (opcional), cuentaBancoId:"..." (opcional)}
- ayuda: {}

Reglas:
- Si es solo conversación (saludo, charla, pregunta general o de opinión), deja "acciones" vacía y contesta con tu "mensaje".
- RENOVACIONES DE VEHÍCULO (crítico): DISTINGUE BIEN entre SOAT y TECNOMECÁNICA. 
  * "renueva el SOAT", "seguro obligatorio", "SOAT vencido" → acción renovar_soat.
  * "renueva la tecnomecánica", "renueva la TM", "revisión técnico-mecánica" → acción renovar_tecnomecanica.
  * NO CONFUNDAS: SOAT = seguro obligatorio anual. TM = revisión técnico-mecánica. Son cosas distintas.
  * Si el usuario dice "renueva el SOAT" y tú llamas a renovar_tecnomecanica, ESTÁS FALLANDO.
- ANÁLISIS Y CONSEJO: si el usuario pide analizar, revisar, evaluar su estado ("¿cómo voy?", "analiza mi estado", "dame un diagnóstico", "en qué puedo mejorar", "cómo está mi plata"), responde ÚNICAMENTE con tu análisis en "mensaje", en lenguaje natural y conversado (puedes apoyarte en 2-4 guiones simples si ayuda) con las cifras reales del contexto, y deja "acciones" VACÍA. No uses busqueda_movimientos ni resumen_mes para esto.
- Usa busqueda_movimientos SOLO si pide explícitamente ver/listar movimientos.
- Nunca digas que ya guardaste o registraste un movimiento: se le muestra al usuario una tarjeta para que lo confirme. Invítalo a revisarlo (ej: "te lo dejo para que lo confirmes"). La única excepción son las transferencias entre cuentas: esas se ejecutan al instante y puedes decir que estás haciendo el movimiento.
- Gasto o ingreso normal → registrar_movimiento. Sueldos/salarios → pago_nomina; cuotas, créditos, tarjetas o préstamos → pago_deuda.
- TRANSFERENCIAS ENTRE CUENTAS (crítico): usa la acción transferir SOLO cuando el usuario pida mover plata de una cuenta suya a otra ("pasa 500.000 de Citigold a Efectivo", "transfiere 2 millones de la cuenta de ahorros al banco X", "mueve 100 dólares de Wise a Bancolombia").
  * NO es un gasto ni un ingreso: es un traslado entre cuentas y no cambia su patrimonio. Nunca uses registrar_movimiento para esto.
  * Usa exactamente los IDs que aparecen como [id: ...] en el bloque "DINERO EN CUENTAS". Copia el ID de la cuenta de origen en "cuentaOrigenId" y el de la cuenta de destino en "cuentaDestinoId".
  * Si no puedes identificar con claridad la cuenta de origen o la de destino, NO inventes ni adivines: pregunta cuál es en "mensaje" y deja "acciones" vacía.
  * La app ejecuta la transferencia al instante, así que no digas "te la dejo para confirmar"; di con naturalidad que estás haciendo el movimiento.
  * Si el monto supera el saldo de la cuenta de origen, la app te avisará y se lo dirás al usuario sin regañar.
- IMPUESTOS: si el usuario dice que pagó un impuesto ("pagué el predial", "paga el vehicular", "ya pagué la renta") y ese impuesto aparece en "IMPUESTOS PENDIENTES" con su [id: ...], usa la acción pagar_impuesto con ese ID. NO lo registres como un gasto normal. Si no aparece en la lista, o hay varios y no sabes cuál es, pregunta en "mensaje" y deja "acciones" vacía. Si el usuario menciona un monto distinto al valor registrado del impuesto, NO lo pagues: pregúntale si quiere que actualices el valor antes de registrarlo.
- crear_recurrente si menciona "recurrente", "mensual", "fijo", "cada mes" o "todos los meses" con un gasto.
- registrar_mantenimiento si menciona mantenimiento del vehículo (aceite, frenos, llantas, revisión, taller, reparación): usa placa o marca/línea si las dice. Si hay varios vehículos y no puedes identificar uno solo, pregunta cuál en "mensaje" y deja "acciones" vacía; no adivines. Si el usuario menciona el kilometraje, ponlo en "km". Si dice de qué cuenta salió el dinero, copia su [id: ...] de "DINERO EN CUENTAS" en "cuentaBancoId"; si no, omítelo. Si no da monto, usa 0 y pídelo, pero no inventes un costo.
- crear_vehiculo: si la placa ya aparece en el bloque "VEHÍCULOS", NO crees otro vehículo; avísale al usuario y deja "acciones" vacía.
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
  snapshot?: string
}

async function llamarGemini(body: unknown): Promise<{ res: Response | null; cuotaAgotada: boolean }> {
  const candidatos = [MODELO, ...MODELOS_FALLBACK].filter((m, i, a) => m && a.indexOf(m) === i)
  let cuotaAgotada = false
  for (const modelo of candidatos) {
    const r = await fetch(`${ENDPOINT}/${modelo}:generateContent?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (r.ok) return { res: r, cuotaAgotada: false }
    if (r.status === 429) cuotaAgotada = true
  }
  return { res: null, cuotaAgotada }
}

export interface FichaInvestigadaVehiculo {
  capacidadTanqueLitros: number
  capacidadTanqueGalones: number
  tipoCombustible: 'diesel' | 'corriente' | 'extra'
  consumoKmPorGalon: number
  fichaInvestigadaNota: string
}

export async function investigarVehiculoConGeminiAI(vehiculo: {
  marca: string
  linea: string
  tipo?: string
  modelo?: number | null
  notas?: string
  carroceria?: string
  cilindraje?: number
  capacidadTexto?: string
}): Promise<FichaInvestigadaVehiculo | null> {
  if (!API_KEY) return null

  const prompt = `Actúa como perito técnico automotriz e ingeniero mecánico experto en transporte de carga, camionetas 4x4, camiones y maquinaria en Colombia.
Investiga y determina las especificaciones oficiales originales de fábrica para este vehículo:
- Marca: ${vehiculo.marca}
- Línea / Referencia: ${vehiculo.linea}
- Año modelo: ${vehiculo.modelo ?? 'No especificado'}
- Tipo / Carrocería: ${vehiculo.tipo ?? ''} ${vehiculo.carroceria ?? ''}
- Cilindraje: ${vehiculo.cilindraje ? `${vehiculo.cilindraje} cc` : 'No especificado'}
- Capacidad reportada: ${vehiculo.capacidadTexto ?? 'No especificada'}
- Notas registradas: ${vehiculo.notas ?? 'Ninguna'}

Necesito saber con precisión de fabricante:
1. Capacidad real del tanque de combustible en litros (capacidadTanqueLitros: number).
2. Capacidad en galones estadounidenses (capacidadTanqueGalones: number, redondeado a 1 decimal). 
   REGLA DE PRECISIÓN: Cada fabricante y modelo tiene un tanque diferente (ej: tractomulas tipo Kenworth/International/Freightliner usan tanques dobles de 150-300 galones; camiones pesados 6x4/6x6/volquetas usan 60-100 galones; camiones medianos tipo NPR/Dutro/Kodiak usan 25-50 galones; troperos/overlanders con tanque auxiliar usan 35-50 galones; camionetas 4x4 usan 18-25 galones; camperos livianos usan 10-15 galones; automóviles 10-14 galones). Investiga el modelo exacto.
3. Tipo de combustible (tipoCombustible: "diesel" | "corriente" | "extra").
4. Rendimiento promedio real estimado en kilómetros por galón en geografía colombiana / montaña / trocha (consumoKmPorGalon: number, redondeado a 1 decimal).
5. Explicación técnica concisa de fábrica de 1 o 2 frases sobre el tanque original, motor y autonomía para operaciones de rescate/trabajo (fichaInvestigadaNota: string).

Responde ÚNICAMENTE un JSON válido con esta estructura:
{
  "capacidadTanqueLitros": 100,
  "capacidadTanqueGalones": 26.4,
  "tipoCombustible": "diesel",
  "consumoKmPorGalon": 24,
  "fichaInvestigadaNota": "Ficha oficial de fábrica: Tanque de 100 L (26.4 gal). Motor turbodiésel con rendimiento de ~24 km/gal en cordillera."
}`

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
  }

  try {
    const { res } = await llamarGemini(body)
    if (!res) return null

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    const texto = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('')
    if (!texto) return null

    const parsed = JSON.parse(limpiarJson(texto)) as Partial<FichaInvestigadaVehiculo>
    const gal = Number(parsed.capacidadTanqueGalones)
    const lit = Number(parsed.capacidadTanqueLitros)
    const kmGal = Number(parsed.consumoKmPorGalon)

    if (!Number.isFinite(gal) || gal <= 0) return null

    const litrosValidos = Number.isFinite(lit) && lit > 0 ? Number(lit.toFixed(1)) : Number((gal * 3.78541).toFixed(1))
    const galonesValidos = Number(gal.toFixed(1))
    const kmValido = Number.isFinite(kmGal) && kmGal > 0 ? Number(kmGal.toFixed(1)) : 20
    const comb = parsed.tipoCombustible === 'corriente' || parsed.tipoCombustible === 'extra' ? parsed.tipoCombustible : 'diesel'
    const nota = String(parsed.fichaInvestigadaNota || '').trim() || `Ficha investigada por IA: Tanque oficial de ${galonesValidos} gal (${litrosValidos} L).`

    return {
      capacidadTanqueGalones: galonesValidos,
      capacidadTanqueLitros: litrosValidos,
      consumoKmPorGalon: kmValido,
      tipoCombustible: comb,
      fichaInvestigadaNota: nota.startsWith('✨') ? nota : `✨ Gemini IA: ${nota}`,
    }
  } catch (err) {
    console.warn('Error investigando vehículo con Gemini AI:', err)
    return null
  }
}

export async function interpretarConGemini(mensaje: string, contexto: Contexto): Promise<Interpretacion> {
  if (!API_KEY) throw new Error('gemini_sin_clave')

  const contextoTexto = [
    `Fecha actual: ${contexto.hoy}. Cuentas del usuario: ${
      contexto.cuentas.length ? contexto.cuentas.join(', ') : 'ninguna'
    }.`,
    contexto.snapshot ?? '',
  ]
    .filter(Boolean)
    .join('\n\n')

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

  const { res, cuotaAgotada } = await llamarGemini(body)
  if (!res) throw new Error(cuotaAgotada ? 'gemini_cuota' : 'gemini_no_disponible')

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
          moneda: normalizarMoneda(params.moneda),
        },
      })
      continue
    }

    if (nombre === 'crear_evento') params.fecha = fechaValida(params.fecha, contexto.hoy)
    if (nombre === 'pago_deuda' || nombre === 'pago_nomina') {
      params.fecha = fechaValida(params.fecha, contexto.hoy)
      params.monto = num(params.monto)
    }
    if (nombre === 'transferir') {
      params.monto = num(params.monto)
      params.fecha = fechaValida(params.fecha, contexto.hoy)
      params.cuentaOrigenId = String(
        params.cuentaOrigenId ?? params.cuentaOrigen ?? params.origenId ?? params.origen ?? ''
      ).trim()
      params.cuentaDestinoId = String(
        params.cuentaDestinoId ?? params.cuentaDestino ?? params.destinoId ?? params.destino ?? ''
      ).trim()
    }
    if (nombre === 'pagar_impuesto') {
      params.impuestoId = String(params.impuestoId ?? params.id ?? '').trim()
      params.nombre = String(params.nombre ?? params.impuesto ?? '').trim()
      params.fecha = fechaValida(params.fecha, contexto.hoy)
    }
    if (nombre === 'crear_recurrente') {
      params.monto = num(params.monto)
      params.valor = params.monto
    }
    if (nombre === 'resumen_mes') {
      params.mes = String(params.mes ?? contexto.hoy.slice(0, 7)).slice(0, 7)
    }

    if (nombre === 'obtener_vehiculo_completo' || nombre === 'renovar_soat' || nombre === 'renovar_tecnomecanica') {
      params.vehiculoId = String(params.vehiculoId ?? '').trim()
    }

    if (nombre === 'crear_vehiculo') {
      params.placa = String(params.placa ?? '').trim().toUpperCase()
      params.marca = String(params.marca ?? '').trim()
      params.linea = String(params.linea ?? '').trim()
      params.modelo = num(params.modelo)
      if (params.cilindraje !== undefined && String(params.cilindraje).trim() !== '') {
        params.cilindraje = num(params.cilindraje)
      } else {
        delete params.cilindraje
      }
      params.tipo = String(params.tipo ?? '').trim().toLowerCase()
    }

    if (nombre === 'registrar_mantenimiento') {
      params.monto = num(params.monto)
      params.fecha = fechaValida(params.fecha, contexto.hoy)
      params.placa = String(params.placa ?? '').trim().toUpperCase()
      params.marca = String(params.marca ?? '').trim()
      params.linea = String(params.linea ?? '').trim()
      params.concepto = String(params.concepto ?? '').trim()
      params.cuentaBancoId = String(params.cuentaBancoId ?? '').trim()
      if (params.km !== undefined && String(params.km).trim() !== '') {
        params.km = num(params.km)
      } else {
        delete params.km
      }
    }

    if ('moneda' in params) {
      const m = normalizarMoneda(params.moneda)
      if (m) params.moneda = m
      else delete params.moneda
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

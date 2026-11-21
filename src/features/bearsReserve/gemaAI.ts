/**
 * Motor de Inteligencia Artificial Gemini para Bear's Reserve 💎🐻
 * - Radio conversacional real con Gema (contexto completo en vivo + acciones)
 * - Consulta en vivo de precios de combustible en Colombia (Google Search Grounding)
 * - Escaneo real de noticias viales/emergencias en Caldas y Eje Cafetero (1–2 días TTL)
 * - Generación dinámica de llamadas comunitarias veredales frescas (24–36h TTL)
 * - Resolución autónoma y realista de misiones + redacción de crónicas humanas
 */

import {
  geminiDisponible,
  limpiarJson,
  llamarGemini,
  llamarGeminiConBusqueda,
} from '@/ai/gemini'
import { hoyISO } from '@/lib/fechas'
import { BASE_BEARS_RESERVE, resolverCoordenadasLugar } from './geo'
import type {
  EmpleadoOperativo,
  EventoRadarLocal,
  MensajeGema,
  MisionComunitaria,
  PreciosCombustible,
  RutaHabitual,
  TarjetaCombustibleReserva,
  TurnoSemanal,
  VehiculoOperativo,
} from './types'

export const TTL_NOTICIA_WEB_MS = 36 * 60 * 60 * 1000 // 36 horas (1.5 días)
export const TTL_LLAMADA_COMUNITARIA_MS = 28 * 60 * 60 * 1000 // 28 horas (~1.2 días)

interface GeminiCandidateResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> }
    groundingMetadata?: {
      groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>
    }
  }>
}

function extraerTextoYFuentes(data: GeminiCandidateResponse): {
  texto: string
  fuentesWeb: Array<{ title: string; uri: string }>
} {
  const cand = data.candidates?.[0]
  const texto = (cand?.content?.parts ?? []).map((p) => p.text ?? '').join('')
  const fuentesWeb = (cand?.groundingMetadata?.groundingChunks ?? [])
    .map((c) => ({
      title: String(c.web?.title || '').trim(),
      uri: String(c.web?.uri || '').trim(),
    }))
    .filter((f) => Boolean(f.uri))
  return { texto, fuentesWeb }
}

/**
 * 1. PRECIOS REALES DE COMBUSTIBLE EN COLOMBIA (Manizales / Caldas)
 * Usa Gemini con Google Search Grounding para consultar precios vigentes CREG / MinMinas.
 */
export async function consultarPreciosCombustibleRealesAI(): Promise<PreciosCombustible | null> {
  if (!geminiDisponible) return null

  const hoy = hoyISO()
  const prompt = `Fecha actual: ${hoy}.
Busca los precios vigentes ACTUALES del combustible por galón en pesos colombianos (COP) en Manizales / Caldas (o promedio principales ciudades de Colombia según CREG / Ministerio de Minas y Energía):
1. Gasolina Corriente (corrientePorGalon)
2. ACPM / Diésel (dieselPorGalon)
3. Gasolina Extra (extraPorGalon)

Responde ÚNICAMENTE con un JSON válido, sin bloques de código ni texto adicional:
{
  "corrientePorGalon": 15850,
  "dieselPorGalon": 10700,
  "extraPorGalon": 20100,
  "fuente": "CREG / MinMinas Colombia (Manizales)"
}`

  try {
    const { res, usoBusqueda } = await llamarGeminiConBusqueda({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1 },
    })
    if (!res) return null

    const data = (await res.json()) as GeminiCandidateResponse
    const { texto, fuentesWeb } = extraerTextoYFuentes(data)
    if (!texto) return null

    const parsed = JSON.parse(limpiarJson(texto)) as Partial<PreciosCombustible>
    const corr = Math.round(Number(parsed.corrientePorGalon))
    const dies = Math.round(Number(parsed.dieselPorGalon))
    const ext = Math.round(Number(parsed.extraPorGalon))

    // Validación de rangos realistas en Colombia (COP por galón)
    if (
      !Number.isFinite(corr) ||
      corr < 10000 ||
      corr > 35000 ||
      !Number.isFinite(dies) ||
      dies < 7000 ||
      dies > 30000 ||
      !Number.isFinite(ext) ||
      ext < 13000 ||
      ext > 45000
    ) {
      return null
    }

    const ahora = Date.now()
    const hora = new Date(ahora).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
    const primeraFuente = fuentesWeb[0]
    const fuenteTexto =
      String(parsed.fuente || '').trim() ||
      (primeraFuente?.title ? `Web · ${primeraFuente.title}` : 'MinMinas / CREG Colombia')

    return {
      corrientePorGalon: corr,
      dieselPorGalon: dies,
      extraPorGalon: ext,
      actualizado: `${hoy} ${hora} · ${usoBusqueda ? 'Sincronizado en vivo (Web)' : 'Actualizado por Gemini IA'}`,
      fuente: fuenteTexto,
      consultadoEn: ahora,
      esFuenteReal: usoBusqueda,
      urlFuente: primeraFuente?.uri,
      editadoManualmente: false,
    }
  } catch (err) {
    console.warn('Error consultando precios reales de combustible:', err)
    return null
  }
}

/**
 * 2. NOTICIAS REALES EN VIVO DE VÍAS Y EMERGENCIAS (Manizales, Caldas y Eje Cafetero)
 * Usa Gemini + Google Search Grounding. Cada noticia nace con caducidad de 36 horas.
 */
export async function buscarNoticiasVialesRealesAI(
  titulosExistentes: string[] = []
): Promise<EventoRadarLocal[]> {
  if (!geminiDisponible) return []

  const hoy = hoyISO()
  const prompt = `Fecha de hoy: ${hoy}.
Busca noticias REALES y RECIENTES (últimas 24 a 48 horas) sobre estado de vías, derrumbes, cierres viales, accidentes graves, lluvias o emergencias comunitarias en Manizales, Caldas, Villamaría, Chinchiná, Neira, Vía a Letras / Fresno, Risaralda o Eje Cafetero (fuentes como La Patria Manizales, Invías, Gestión del Riesgo Caldas, Caracol, RCN, El Tiempo).
NO inventes noticias viejas ni eventos ficticios. Si hay 1 a 3 novedades reales recientes, devuélvelas.
Evita repetir estos títulos ya registrados: ${titulosExistentes.slice(0, 8).join(' | ') || 'ninguno'}.

Responde ÚNICAMENTE con un JSON válido:
{
  "eventos": [
    {
      "titulo": "Título concreto de la novedad vial o emergencia real",
      "lugar": "Sector / Municipio específico",
      "departamento": "Caldas",
      "lat": 5.07,
      "lng": -75.52,
      "fuenteNoticia": "Nombre del medio o entidad (ej: La Patria / Invías)",
      "urlFuente": "https://...",
      "resumen": "Resumen real de 1-2 frases de lo que ocurre",
      "esEmergenciaGrave": true,
      "atencionOficialPresente": true,
      "recomendacionGema": "apoyo_logistico",
      "justificacionGema": "Criterio breve de Bear's Reserve (base en San Peregrino, Manizales)"
    }
  ]
}`

  try {
    const { res, usoBusqueda } = await llamarGeminiConBusqueda({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 },
    })
    if (!res || !usoBusqueda) return []

    const data = (await res.json()) as GeminiCandidateResponse
    const { texto, fuentesWeb } = extraerTextoYFuentes(data)
    if (!texto) return []

    const parsed = JSON.parse(limpiarJson(texto)) as { eventos?: Array<Partial<EventoRadarLocal>> }
    const crudos = Array.isArray(parsed.eventos) ? parsed.eventos : []
    const ahora = Date.now()
    const existentesLower = new Set(titulosExistentes.map((t) => t.toLowerCase().trim()))

    const resultados: EventoRadarLocal[] = []
    for (let i = 0; i < crudos.length && resultados.length < 3; i++) {
      const e = crudos[i]
      const titulo = String(e.titulo || '').trim()
      if (!titulo || existentesLower.has(titulo.toLowerCase())) continue

      const lugar = String(e.lugar || 'Manizales · Caldas').trim()
      const departamento = String(e.departamento || 'Caldas').trim()
      const coordsFallback = resolverCoordenadasLugar(lugar, departamento)
      const latNum = Number(e.lat)
      const lngNum = Number(e.lng)
      const coordsValidas =
        Number.isFinite(latNum) &&
        Number.isFinite(lngNum) &&
        latNum >= 1 &&
        latNum <= 12 &&
        lngNum >= -79 &&
        lngNum <= -67

      const rec =
        e.recomendacionGema === 'intervenir_urgente' ||
        e.recomendacionGema === 'apoyo_logistico' ||
        e.recomendacionGema === 'monitorear_sin_intervenir'
          ? e.recomendacionGema
          : 'apoyo_logistico'

      resultados.push({
        id: `rad-web-${ahora}-${i}`,
        titulo,
        lugar,
        departamento,
        lat: coordsValidas ? Number(latNum.toFixed(5)) : coordsFallback.lat,
        lng: coordsValidas ? Number(lngNum.toFixed(5)) : coordsFallback.lng,
        fuenteNoticia: String(e.fuenteNoticia || fuentesWeb[i]?.title || 'Prensa Regional / Invías').trim(),
        urlFuente: String(e.urlFuente || fuentesWeb[i]?.uri || '').trim() || undefined,
        resumen: String(e.resumen || 'Reporte vial y comunitario verificado en prensa regional.').trim(),
        fecha: hoy,
        creadoEn: ahora,
        expiraEn: ahora + TTL_NOTICIA_WEB_MS,
        esEmergenciaGrave: Boolean(e.esEmergenciaGrave),
        atencionOficialPresente: e.atencionOficialPresente !== false,
        esNoticiaWebReal: true,
        recomendacionGema: rec,
        justificacionGema:
          String(e.justificacionGema || '').trim() ||
          'Situación reportada en prensa regional. Evaluar cercanía a Finca El Guadual antes de despachar.',
      })
    }

    return resultados
  } catch (err) {
    console.warn('Error buscando noticias viales reales con Gemini:', err)
    return []
  }
}

/**
 * 3. GENERACIÓN DINÁMICA DE LLAMADAS COMUNITARIAS VEREDALES FRESCAS (TTL ~28h)
 * Genera solicitudes campesinas realistas y variadas en veredas de Manizales y Caldas.
 */
export async function generarLlamadasComunitariasIA(
  titulosExistentes: string[] = [],
  cantidad = 2
): Promise<EventoRadarLocal[]> {
  if (!geminiDisponible) return []

  const hoy = hoyISO()
  const prompt = `Fecha: ${hoy}. Eres Gema, oficial de operaciones de Bear's Reserve (base en Finca El Guadual, Vereda San Peregrino, Manizales, Caldas).
Genera exactamente ${cantidad} llamadas comunitarias veredales REALISTAS, variadas y cotidianas de campesinos, juntas de acción comunal o conductores rurales en Manizales / Caldas (veredas como San Peregrino, La Cabaña, La Linda, Morrogacho, El Desquite, El Rosario, Bajo Tablazo, La Trinidad, Gallinazo, Neira, Chinchiná).
Ejemplos de variedad: desvare de campero cafetero, rescate de camión lechero en barro, trasteo solidario en trocha, caída de árbol en camino veredal, traslado de insumos/tejas, auxilio a adulto mayor o escuela rural.
NO repitas estos títulos: ${titulosExistentes.slice(0, 10).join(' | ') || 'ninguno'}.

Responde ÚNICAMENTE con un JSON válido:
{
  "llamadas": [
    {
      "titulo": "Título concreto",
      "lugar": "Vereda o sector real de Caldas",
      "departamento": "Caldas",
      "fuenteNoticia": "Llamada comunitaria / JAC / Radio veredal",
      "resumen": "Detalle humano concreto (1-2 frases)",
      "esEmergenciaGrave": false,
      "recomendacionGema": "intervenir_urgente",
      "justificacionGema": "Por qué y qué tipo de vehículo/equipo conviene"
    }
  ]
}`

  try {
    const { res } = await llamarGemini({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.85, responseMimeType: 'application/json' },
    })
    if (!res) return []

    const data = (await res.json()) as GeminiCandidateResponse
    const { texto } = extraerTextoYFuentes(data)
    if (!texto) return []

    const parsed = JSON.parse(limpiarJson(texto)) as { llamadas?: Array<Partial<EventoRadarLocal>> }
    const crudos = Array.isArray(parsed.llamadas) ? parsed.llamadas : []
    const ahora = Date.now()
    const existentesLower = new Set(titulosExistentes.map((t) => t.toLowerCase().trim()))

    return crudos
      .filter((c) => {
        const t = String(c.titulo || '').trim()
        return Boolean(t) && !existentesLower.has(t.toLowerCase())
      })
      .slice(0, cantidad)
      .map((c, idx) => {
        const lugar = String(c.lugar || 'Vereda San Peregrino · Manizales').trim()
        const departamento = String(c.departamento || 'Caldas').trim()
        const coords = resolverCoordenadasLugar(lugar, departamento)
        const rec =
          c.recomendacionGema === 'intervenir_urgente' ||
          c.recomendacionGema === 'apoyo_logistico' ||
          c.recomendacionGema === 'monitorear_sin_intervenir'
            ? c.recomendacionGema
            : 'intervenir_urgente'

        return {
          id: `rad-com-${ahora}-${idx}`,
          titulo: String(c.titulo || '').trim(),
          lugar,
          departamento,
          lat: coords.lat,
          lng: coords.lng,
          fuenteNoticia: String(c.fuenteNoticia || 'Llamada directa a la Central Bear\'s Reserve').trim(),
          resumen: String(c.resumen || 'Solicitud de apoyo comunitario en zona rural.').trim(),
          fecha: hoy,
          creadoEn: ahora,
          expiraEn: ahora + TTL_LLAMADA_COMUNITARIA_MS,
          esEmergenciaGrave: Boolean(c.esEmergenciaGrave),
          atencionOficialPresente: false,
          esNoticiaWebReal: false,
          recomendacionGema: rec,
          justificacionGema:
            String(c.justificacionGema || '').trim() ||
            'Apoyo rural directo sin cobertura oficial. Evaluar despliegue desde Finca El Guadual.',
        }
      })
  } catch (err) {
    console.warn('Error generando llamadas comunitarias con Gemini:', err)
    return []
  }
}

/**
 * 4. RESOLUCIÓN AUTÓNOMA DE MISIONES POR IA 🤖
 * Evalúa el desenlace realista según dificultad del terreno, idoneidad de flota/tripulación
 * y genera una crónica narrativa humana y única.
 */
export interface ResolucionMisionIA {
  resultado: 'exito' | 'parcial' | 'fallida_dificultad'
  factorDistanciaReal: number
  cronicaHistoria: string
  resueltaPorIA: boolean
}

export async function resolverMisionConIA(
  mision: MisionComunitaria,
  vehiculosParticipantes: VehiculoOperativo[],
  tripulantesNombres: string[]
): Promise<ResolucionMisionIA | null> {
  if (!geminiDisponible) return null

  const flotaResumen = vehiculosParticipantes
    .map(
      (v) =>
        `${v.marca} ${v.linea} (${v.tipo}, ${v.tipoCombustible}, tanque ${v.nivelCombustiblePorc}%, llantas ${v.desgasteLlantasPorc}% desgaste${v.notasCashmet ? `, notas: ${v.notasCashmet}` : ''})`
    )
    .join('; ')

  const prompt = `Eres Gema, oficial de operaciones de Bear's Reserve (base Finca El Guadual, Vereda San Peregrino, Manizales, Caldas).
La siguiente misión acaba de cumplir su tiempo estimado de operación y debes cerrar su bitácora evaluando de forma REALISTA el desenlace:

- Título: ${mision.titulo}
- Tipo: ${mision.tipo}
- Prioridad: ${mision.prioridad}
- Destino: ${mision.destino} (${mision.departamento})
- Terreno: ${mision.terreno}
- Distancia planificada ida y vuelta: ${mision.distanciaKmIdaYVuelta} km
- Duración estimada: ${mision.duracionMinutos} minutos
- Contexto / Impacto social: ${mision.impactoSocial}
- Flota despachada: ${flotaResumen || 'Vehículo de reserva'}
- Tripulación: ${tripulantesNombres.join(', ') || 'Equipo de guardia'}

CRITERIOS REALISTAS DE EVALUACIÓN:
- Las rutas habituales (escolares, mercado) y misiones en pavimento o mixto con vehículo adecuado casi siempre terminan en "exito" (factorDistanciaReal ~ 0.98 - 1.04).
- Si el terreno es "trocha_extrema_barrizal" o "rescate_barrizal" y el vehículo NO es adecuado (ej. carro compacto sin 4x4/winche o llantas > 75% desgaste), puede ser "parcial" (factorDistanciaReal ~ 0.85 - 1.05) o "fallida_dificultad" (repliegue táctico por seguridad, factorDistanciaReal ~ 0.55 - 0.78).
- Si la misión tiene vehículo bien equipado (4x4, winche, camión) y tripulación competente, lo normal es "exito" (~80%) o "parcial" (~15%) y solo raramente "fallida_dificultad" (~5%).
- Redacta "cronicaHistoria" en español colombiano natural y humano (3 a 4 frases), narrando concretamente lo que pasó en ${mision.destino} con ${flotaResumen || 'la flota'} y ${tripulantesNombres.join(', ') || 'la cuadrilla'}, sin clichés repetitivos.

Responde ÚNICAMENTE con un JSON válido:
{
  "resultado": "exito",
  "factorDistanciaReal": 1.0,
  "cronicaHistoria": "Relato realista y humano de la intervención..."
}`

  try {
    const { res } = await llamarGemini({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.65, responseMimeType: 'application/json' },
    })
    if (!res) return null

    const data = (await res.json()) as GeminiCandidateResponse
    const { texto } = extraerTextoYFuentes(data)
    if (!texto) return null

    const parsed = JSON.parse(limpiarJson(texto)) as Partial<ResolucionMisionIA>
    const resultado: ResolucionMisionIA['resultado'] =
      parsed.resultado === 'parcial' || parsed.resultado === 'fallida_dificultad'
        ? parsed.resultado
        : 'exito'

    const factorRaw = Number(parsed.factorDistanciaReal)
    const factorDistanciaReal =
      Number.isFinite(factorRaw) && factorRaw >= 0.45 && factorRaw <= 1.2
        ? Number(factorRaw.toFixed(2))
        : resultado === 'fallida_dificultad'
          ? 0.65
          : 1.0

    const cronicaHistoria = String(parsed.cronicaHistoria || '').trim()
    if (!cronicaHistoria) return null

    return {
      resultado,
      factorDistanciaReal,
      cronicaHistoria,
      resueltaPorIA: true,
    }
  } catch (err) {
    console.warn('Error resolviendo misión con Gemini:', err)
    return null
  }
}

/**
 * 5. RADIO CONVERSACIONAL REAL DE GEMA (GEMINI AI) 💎
 */
export interface AccionGema {
  tipo: 'rotar_turnos' | 'tanquear_vehiculo' | 'escanear_radar' | 'actualizar_precios'
  vehiculoId?: string
}

export interface ContextoGemaCompleto {
  empleados: EmpleadoOperativo[]
  vehiculos: VehiculoOperativo[]
  turnos: TurnoSemanal[]
  misiones: MisionComunitaria[]
  rutasHabituales: RutaHabitual[]
  eventosRadar: EventoRadarLocal[]
  tarjetaCombustible: TarjetaCombustibleReserva
  preciosCombustible: PreciosCombustible
  enTurnoAhora: EmpleadoOperativo[]
}

const SISTEMA_GEMA = `Eres Gema 💎, la oficial de operaciones, despacho y radio comunitaria de Bear's Reserve 🐻 (una iniciativa comunitaria 0% ánimo de lucro con base en ${BASE_BEARS_RESERVE.nombre}, ${BASE_BEARS_RESERVE.sector}, ${BASE_BEARS_RESERVE.municipio}, ${BASE_BEARS_RESERVE.departamento}).

PERSONALIDAD Y ESTILO:
- Hablas en español colombiano cercano, cálido, práctico y claro (tuteas al coordinador con confianza y respeto).
- Eres una verdadera oficial de operaciones: conoces en tiempo real tu flota, niveles de tanque, odómetros, desgaste de llantas, el cuadrante 24/7 (máx 42h semanales), las rutas escolares/mercado, el radar de contingencias, los precios del combustible, la tarjeta mensual y las crónicas de misiones.
- NUNCA inventes datos, placas, nombres ni alertas que no estén en el bloque de contexto en vivo. Si no hay alertas o misiones, dilo con honestidad.
- Usa formato limpio con negritas (**dato**) y viñetas simples (- item) cuando resumas listas, sin exceso de decoración.

ACCIONES EJECUTABLES (solo inclúyelas cuando el usuario lo pida explícitamente):
- {"tipo":"rotar_turnos"}: cuando pida rotar, reorganizar o cuadrar los turnos de la semana.
- {"tipo":"tanquear_vehiculo","vehiculoId":"ID_EXACTO"}: cuando pida tanquear un vehículo específico (usa el ID exacto que aparece entre [id: ...] en la flota).
- {"tipo":"escanear_radar"}: cuando pida escanear nuevas noticias/frecuencias del radar en vivo.
- {"tipo":"actualizar_precios"}: cuando pida consultar o actualizar los precios actuales de gasolina/ACPM en Colombia.

Responde SIEMPRE con un único objeto JSON válido, sin bloques markdown:
{"respuesta":"Tu respuesta humana y completa aquí","acciones":[]}`

function construirSnapshotGema(ctx: ContextoGemaCompleto): string {
  const hoy = hoyISO()
  const hora = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })

  const turnosHoy = ctx.turnos.filter((t) => t.fecha === hoy)
  const horasPorEmp = new Map<string, number>()
  for (const t of ctx.turnos) {
    horasPorEmp.set(t.empleadoId, (horasPorEmp.get(t.empleadoId) || 0) + t.horas)
  }

  const flotaTxt = ctx.vehiculos
    .map(
      (v) =>
        `- ${v.marca} ${v.linea} ${v.placa ? `(${v.placa})` : ''} [id: ${v.id}] | ${v.disponibleParaTrabajo ? 'Habilitado' : 'Solo CashMet'} | Estado: ${v.estado} | Tanque: ${v.nivelCombustiblePorc}% de ${v.capacidadTanqueGalones} gal (${v.tipoCombustible}, ${v.consumoKmPorGalon} km/gal) | Odómetro: ${v.kilometrajeActual.toLocaleString('es-CO')} km | Llantas: ${v.desgasteLlantasPorc}% desgaste${v.notasCashmet ? ` | Notas: ${v.notasCashmet}` : ''}`
    )
    .join('\n')

  const personalTxt = ctx.empleados
    .map(
      (e) =>
        `- ${e.nombreCompleto} (${e.cargo}) | ${e.activo ? 'En Reserva' : 'Excluido'} | ${horasPorEmp.get(e.id) || 0}/42h esta semana${e.horariosNoDisponibles.length ? ` | Restricciones: ${e.horariosNoDisponibles.map((h) => `día ${h.diaSemana} ${h.horaInicio}-${h.horaFin} (${h.motivo})`).join(', ')}` : ''}`
    )
    .join('\n')

  const guardiaHoyTxt = turnosHoy.length
    ? turnosHoy.map((t) => `- ${t.horaInicio}-${t.horaFin} (${t.franja}): ${t.empleadoNombre} — ${t.rolGuardia}`).join('\n')
    : '- Sin turnos cargados para hoy'

  const ahoraTxt = ctx.enTurnoAhora.length
    ? ctx.enTurnoAhora.map((e) => `${e.nombreCompleto} (${e.cargo})`).join(', ')
    : 'Nadie en franja activa en este instante'

  const rutasTxt = ctx.rutasHabituales
    .map(
      (r) =>
        `- ${r.nombre} (${r.distanciaKm} km, salida ${r.horaSalida || 'N/A'}, ${r.esAutomatica ? 'automática' : 'manual'}, último cumplimiento: ${r.ultimoCumplimientoFecha || 'pendiente'})`
    )
    .join('\n')

  const radarTxt = ctx.eventosRadar.length
    ? ctx.eventosRadar
        .map(
          (ev) =>
            `- [${ev.esNoticiaWebReal ? 'Noticia Web Real ✓' : 'Llamada Comunitaria'}] ${ev.titulo} · ${ev.lugar} (${ev.departamento}) | Prioridad: ${ev.recomendacionGema} | ${ev.resumen}${ev.despachado ? ' [YA DESPACHADO]' : ''}`
        )
        .join('\n')
    : '- Sin alertas activas en el radar.'

  const misionesActivas = ctx.misiones.filter((m) => m.estado === 'en_curso' || m.estado === 'programada')
  const misionesRecientes = ctx.misiones
    .filter((m) => m.estado === 'completada' || m.estado === 'inconclusa_repliegue')
    .slice(0, 6)

  const activasTxt = misionesActivas.length
    ? misionesActivas
        .map(
          (m) =>
            `- [${m.estado.toUpperCase()}] ${m.titulo} → ${m.destino} (${m.distanciaKmIdaYVuelta} km, ${m.duracionMinutos} min) | Flota: ${m.vehiculosAsignados.map((v) => v.nombre).join(', ') || 'N/A'} | Tripulación: ${m.tripulantesAsignados.map((t) => t.nombre).join(', ') || 'N/A'}`
        )
        .join('\n')
    : '- Ninguna misión en curso o programada.'

  const recientesTxt = misionesRecientes.length
    ? misionesRecientes
        .map(
          (m) =>
            `- [${m.fecha} · ${m.resultado || m.estado}] ${m.titulo} (${m.distanciaKmIdaYVuelta} km, ${m.galonesConsumidosEstimados} gal): ${m.cronicaHistoria?.slice(0, 180) || m.impactoSocial}`
        )
        .join('\n')
    : '- Aún no hay crónicas archivadas.'

  const saldoPendiente = Math.max(
    0,
    ctx.tarjetaCombustible.saldoAcumuladoCOP - (ctx.tarjetaCombustible.saldoLiquidadoCOP || 0)
  )

  return `ESTADO EN VIVO BEAR'S RESERVE (${hoy} · ${hora}):

EN TURNO EN ESTE MOMENTO: ${ahoraTxt}

GUARDIA DE HOY (${hoy}):
${guardiaHoyTxt}

PERSONAL (${ctx.empleados.length}):
${personalTxt || '- Sin empleados'}

FLOTA (${ctx.vehiculos.length}):
${flotaTxt || '- Sin vehículos'}

COMBUSTIBLE Y TARJETA (${ctx.tarjetaCombustible.mes}):
- Precios vigentes (${ctx.preciosCombustible.fuente}): Corriente $${ctx.preciosCombustible.corrientePorGalon.toLocaleString('es-CO')}, ACPM $${ctx.preciosCombustible.dieselPorGalon.toLocaleString('es-CO')}, Extra $${ctx.preciosCombustible.extraPorGalon.toLocaleString('es-CO')}
- Tarjeta mes: Acumulado $${ctx.tarjetaCombustible.saldoAcumuladoCOP.toLocaleString('es-CO')} COP (${ctx.tarjetaCombustible.totalGalonesMes} gal) | Liquidado: $${(ctx.tarjetaCombustible.saldoLiquidadoCOP || 0).toLocaleString('es-CO')} COP | Pendiente por liquidar: $${saldoPendiente.toLocaleString('es-CO')} COP

RUTAS HABITUALES:
${rutasTxt}

RADAR DE CONTINGENCIAS (${ctx.eventosRadar.length}):
${radarTxt}

MISIONES ACTIVAS / PROGRAMADAS:
${activasTxt}

ÚLTIMAS CRÓNICAS COMPLETADAS:
${recientesTxt}`
}

export async function conversarConGemaAI(
  mensaje: string,
  historial: MensajeGema[],
  contexto: ContextoGemaCompleto
): Promise<{ respuesta: string; acciones: AccionGema[]; fuente: 'gemini' } | null> {
  if (!geminiDisponible) return null

  const snapshot = construirSnapshotGema(contexto)
  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = []

  // Últimos 10 mensajes de historial para continuidad conversacional
  for (const m of historial.slice(-10)) {
    const t = String(m.texto || '').trim()
    if (!t || m.id === 'gema-init') continue
    const role = m.remitente === 'usuario' ? 'user' : 'model'
    const ultimo = contents[contents.length - 1]
    if (ultimo && ultimo.role === role) ultimo.parts.push({ text: t })
    else contents.push({ role, parts: [{ text: t }] })
  }
  while (contents.length && contents[0].role !== 'user') contents.shift()

  contents.push({
    role: 'user',
    parts: [{ text: `${snapshot}\n\nMensaje del coordinador: ${mensaje}` }],
  })

  try {
    const { res } = await llamarGemini({
      systemInstruction: { parts: [{ text: SISTEMA_GEMA }] },
      contents,
      generationConfig: { temperature: 0.4, responseMimeType: 'application/json' },
    })
    if (!res) return null

    const data = (await res.json()) as GeminiCandidateResponse
    const { texto } = extraerTextoYFuentes(data)
    if (!texto) return null

    const parsed = JSON.parse(limpiarJson(texto)) as {
      respuesta?: string
      mensaje?: string
      acciones?: Array<{ tipo?: string; vehiculoId?: string; params?: { vehiculoId?: string } }>
    }

    const respuesta = String(parsed.respuesta ?? parsed.mensaje ?? '').trim()
    if (!respuesta) return null

    const acciones: AccionGema[] = []
    if (Array.isArray(parsed.acciones)) {
      for (const a of parsed.acciones) {
        if (
          a.tipo === 'rotar_turnos' ||
          a.tipo === 'escanear_radar' ||
          a.tipo === 'actualizar_precios'
        ) {
          acciones.push({ tipo: a.tipo })
        } else if (a.tipo === 'tanquear_vehiculo') {
          const vid = String(a.vehiculoId ?? a.params?.vehiculoId ?? '').trim()
          if (vid) acciones.push({ tipo: 'tanquear_vehiculo', vehiculoId: vid })
        }
      }
    }

    return { respuesta, acciones, fuente: 'gemini' }
  } catch (err) {
    console.warn('Error en Radio con Gema (Gemini):', err)
    return null
  }
}

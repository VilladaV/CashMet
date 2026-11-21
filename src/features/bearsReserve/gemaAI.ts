/**
 * Motor de Inteligencia Artificial Gemini para Bear's Reserve 💎🐻
 * - Pipeline en 2 pasos (Google Search Grounding -> Estructuración JSON) para precios reales y noticias web
 * - Filtro estricto por fecha real de publicación (máximo 48 horas; jamás deja pasar noticias viejas)
 * - Anti-repetición de veredas y temáticas en llamadas comunitarias veredales (TTL ~28h)
 * - Resolución autónoma y realista de misiones + redacción de crónicas humanas
 * - Radio conversacional real con Gema (contexto completo en vivo + acciones)
 */

import {
  geminiDisponible,
  limpiarJson,
  llamarGemini,
  llamarGeminiConBusqueda,
} from '@/ai/gemini'
import { hoyISO, isoLocal } from '@/lib/fechas'
import { BASE_BEARS_RESERVE, resolverCoordenadasLugar } from './geo'
import {
  detectarTemaEvento,
  esEventoRedundante,
  esFechaNoticiaReciente,
  extraerClaveVereda,
} from './gemaEngine'
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
      webSearchQueries?: string[]
      groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>
    }
  }>
}

function extraerTextoYFuentes(data: GeminiCandidateResponse): {
  texto: string
  fuentesWeb: Array<{ title: string; uri: string }>
  consultasWeb: string[]
} {
  const cand = data.candidates?.[0]
  const texto = (cand?.content?.parts ?? []).map((p) => p.text ?? '').join('')
  const fuentesWeb = (cand?.groundingMetadata?.groundingChunks ?? [])
    .map((c) => ({
      title: String(c.web?.title || '').trim(),
      uri: String(c.web?.uri || '').trim(),
    }))
    .filter((f) => Boolean(f.uri))
  const consultasWeb = cand?.groundingMetadata?.webSearchQueries ?? []
  return { texto, fuentesWeb, consultasWeb }
}

function haceNDiasISO(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  return isoLocal(d)
}

/**
 * 1. PRECIOS REALES DE COMBUSTIBLE EN COLOMBIA (Manizales / Caldas) — Pipeline en 2 pasos
 * Paso 1: Gemini + Google Search Grounding en texto natural (sin forzar JSON).
 * Paso 2: Extracción JSON estricta sobre el texto verificado en web.
 */
export async function consultarPreciosCombustibleRealesAI(): Promise<PreciosCombustible | null> {
  if (!geminiDisponible) return null

  const hoy = hoyISO()

  try {
    // PASO 1: Búsqueda web en vivo (texto libre para que Google Search Grounding siempre se ejecute)
    const promptBusqueda = `Fecha actual: ${hoy}.
Consulta en internet los precios VIGENTES hoy del combustible por galón en pesos colombianos (COP) en Manizales, Caldas (o el promedio oficial CREG / Ministerio de Minas y Energía de Colombia si Manizales no aparece desglosado):
- Gasolina Corriente (COP/galón)
- ACPM / Diésel (COP/galón)
- Gasolina Extra (COP/galón)
Indica las cifras exactas y la fuente oficial o medio colombiano que reporta la tarifa vigente.`

    const { res: resPaso1, usoBusqueda } = await llamarGeminiConBusqueda(
      {
        contents: [{ role: 'user', parts: [{ text: promptBusqueda }] }],
        generationConfig: { temperature: 0.1 },
      },
      true
    )
    if (!resPaso1) return null

    const data1 = (await resPaso1.json()) as GeminiCandidateResponse
    const { texto: textoInvestigado, fuentesWeb, consultasWeb } = extraerTextoYFuentes(data1)
    if (!textoInvestigado) return null

    const tuvoGroundingReal = usoBusqueda && (fuentesWeb.length > 0 || consultasWeb.length > 0)

    // PASO 2: Estructurar la investigación en JSON limpio
    const promptJson = `Extrae del siguiente texto los precios vigentes por galón en COP para Colombia/Manizales.
Texto investigado:
"""
${textoInvestigado}
"""
Fuentes web detectadas: ${fuentesWeb.map((f) => f.title).join(', ') || 'ninguna'}

Responde ÚNICAMENTE con un JSON válido:
{
  "corrientePorGalon": 16000,
  "dieselPorGalon": 10800,
  "extraPorGalon": 20500,
  "fuente": "CREG / MinMinas Colombia (Manizales)"
}`

    const { res: resPaso2 } = await llamarGemini({
      contents: [{ role: 'user', parts: [{ text: promptJson }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' },
    })
    if (!resPaso2) return null

    const data2 = (await resPaso2.json()) as GeminiCandidateResponse
    const { texto: textoJson } = extraerTextoYFuentes(data2)
    if (!textoJson) return null

    const parsed = JSON.parse(limpiarJson(textoJson)) as Partial<PreciosCombustible>
    const corr = Math.round(Number(parsed.corrientePorGalon))
    const dies = Math.round(Number(parsed.dieselPorGalon))
    const ext = Math.round(Number(parsed.extraPorGalon))

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
      actualizado: `${hoy} ${hora} · ${tuvoGroundingReal ? 'Sincronizado en vivo (Google Search)' : 'Estimación Gemini (sin grounding web)'}`,
      fuente: fuenteTexto,
      consultadoEn: ahora,
      esFuenteReal: tuvoGroundingReal,
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
 * Pipeline en 2 pasos:
 * - Paso 1: Google Search Grounding en texto libre (exige grounding real, SIN fallback inventado).
 * - Paso 2: Estructuración JSON exigiendo `fechaPublicacion` real (YYYY-MM-DD) y rechazando
 *           por código cualquier artículo publicado hace más de 2 días.
 */
export interface ResultadoBusquedaNoticiasWeb {
  eventos: EventoRadarLocal[]
  busquedaWebActiva: boolean
  descartadasPorViejas: number
  diagnostico: string
}

export async function buscarNoticiasVialesRealesAI(
  eventosExistentes: EventoRadarLocal[] = []
): Promise<ResultadoBusquedaNoticiasWeb> {
  if (!geminiDisponible) {
    return {
      eventos: [],
      busquedaWebActiva: false,
      descartadasPorViejas: 0,
      diagnostico: 'Falta configurar VITE_GEMINI_API_KEY para buscar noticias en internet.',
    }
  }

  const hoy = hoyISO()
  const desdeISO = haceNDiasISO(2)
  const titulosExistentes = eventosExistentes.map((e) => e.titulo)

  try {
    // PASO 1: Búsqueda real en Google Search (texto natural, SIN responseMimeType JSON)
    const promptBusqueda = `Hoy es ${hoy}. Necesito un boletín de noticias REALES publicadas únicamente entre ${desdeISO} y ${hoy} (últimas 48 horas) sobre:
- Derrumbes, cierres viales, paso restringido, pérdida de banca, accidentes de tránsito relevantes, fuertes lluvias, inundaciones o emergencias comunitarias.
- Zonas prioritarias: Manizales, Caldas (Villamaría, Chinchiná, Neira, Palestina, Salamina, Aranzazu, Vía Manizales - Alto de Letras - Fresno, Autopista del Café, Pacífico 3, vía antigua a Chinchiná) y Eje Cafetero cercano (Santa Rosa de Cabal, Pereira, Risaralda).
- Consulta medios reales como La Patria (Manizales), Invías, Gestión del Riesgo de Caldas, Caracol Radio Manizales, RCN, El Tiempo o prensa regional.

Para cada noticia REAL encontrada dentro de estas últimas 48 horas, escribe:
1. Título exacto de la noticia
2. Fecha exacta de publicación (formato YYYY-MM-DD)
3. Municipio/sector y departamento
4. Medio o fuente oficial
5. Resumen real en 1-2 frases

REGLA ESTRICTA: Si no encuentras ninguna novedad vial o emergencia publicada entre ${desdeISO} y ${hoy}, responde explícitamente "SIN_NOVEDADES_RECIENTES" y NO incluyas noticias de semanas o meses anteriores.`

    const { res: resPaso1, usoBusqueda, errorBusqueda } = await llamarGeminiConBusqueda(
      {
        contents: [{ role: 'user', parts: [{ text: promptBusqueda }] }],
        generationConfig: { temperature: 0.1 },
      },
      false // Jamás usar memoria sin Google Search para noticias web reales
    )

    if (!resPaso1 || !usoBusqueda) {
      return {
        eventos: [],
        busquedaWebActiva: false,
        descartadasPorViejas: 0,
        diagnostico: `Búsqueda web no disponible (${errorBusqueda || 'sin acceso a Google Search Grounding'}).`,
      }
    }

    const data1 = (await resPaso1.json()) as GeminiCandidateResponse
    const { texto: textoBuscado, fuentesWeb, consultasWeb } = extraerTextoYFuentes(data1)

    if (!textoBuscado || (fuentesWeb.length === 0 && consultasWeb.length === 0)) {
      return {
        eventos: [],
        busquedaWebActiva: false,
        descartadasPorViejas: 0,
        diagnostico: 'Google Search no devolvió resultados verificables para esta consulta.',
      }
    }

    if (textoBuscado.includes('SIN_NOVEDADES_RECIENTES')) {
      return {
        eventos: [],
        busquedaWebActiva: true,
        descartadasPorViejas: 0,
        diagnostico: `Web consultada (${hoy}): sin cierres ni emergencias viales publicadas en las últimas 48h en Caldas/Eje Cafetero.`,
      }
    }

    // PASO 2: Convertir hallazgos reales en JSON verificando fechaPublicacion estricta
    const fuentesResumen = fuentesWeb
      .slice(0, 8)
      .map((f, i) => `[${i}] ${f.title} — ${f.uri}`)
      .join('\n')

    const promptEstructura = `Extrae las noticias REALES de vías/emergencias del siguiente boletín obtenido de Google Search.
Hoy es ${hoy}. Ventana válida: únicamente noticias publicadas entre ${desdeISO} y ${hoy}.
NO inventes hechos ni cambies fechas: si una noticia no tiene fecha reciente (${desdeISO} a ${hoy}), déjala con su fecha real o descártala.
Evita repetir estos títulos ya en radar: ${titulosExistentes.slice(0, 8).join(' | ') || 'ninguno'}.

BOLETÍN INVESTIGADO:
"""
${textoBuscado}
"""

FUENTES WEB ENCONTRADAS:
${fuentesResumen || 'Ninguna'}

Responde ÚNICAMENTE con un JSON válido:
{
  "eventos": [
    {
      "titulo": "Título real conciso",
      "fechaPublicacion": "YYYY-MM-DD",
      "lugar": "Sector / Municipio",
      "departamento": "Caldas",
      "lat": 5.07,
      "lng": -75.52,
      "fuenteNoticia": "Nombre del medio (ej: La Patria / Invías)",
      "indiceFuenteWeb": 0,
      "resumen": "Resumen real de 1-2 frases",
      "esEmergenciaGrave": true,
      "atencionOficialPresente": true,
      "recomendacionGema": "apoyo_logistico",
      "justificacionGema": "Criterio operativo desde Finca El Guadual (San Peregrino, Manizales)"
    }
  ]
}`

    const { res: resPaso2 } = await llamarGemini({
      contents: [{ role: 'user', parts: [{ text: promptEstructura }] }],
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
    })
    if (!resPaso2) {
      return {
        eventos: [],
        busquedaWebActiva: true,
        descartadasPorViejas: 0,
        diagnostico: 'Se consultó internet pero no se pudo estructurar la respuesta.',
      }
    }

    const data2 = (await resPaso2.json()) as GeminiCandidateResponse
    const { texto: textoJson } = extraerTextoYFuentes(data2)
    if (!textoJson) {
      return {
        eventos: [],
        busquedaWebActiva: true,
        descartadasPorViejas: 0,
        diagnostico: `Web consultada (${hoy}): sin emergencias viales recientes en las últimas 48h.`,
      }
    }

    const parsed = JSON.parse(limpiarJson(textoJson)) as {
      eventos?: Array<
        Partial<EventoRadarLocal> & { fechaPublicacion?: string; indiceFuenteWeb?: number }
      >
    }
    const crudos = Array.isArray(parsed.eventos) ? parsed.eventos : []
    const ahora = Date.now()
    const acumulados = [...eventosExistentes]
    const resultados: EventoRadarLocal[] = []
    let descartadasPorViejas = 0

    for (let i = 0; i < crudos.length && resultados.length < 3; i++) {
      const e = crudos[i]
      const titulo = String(e.titulo || '').trim()
      if (!titulo) continue

      // Candado estricto en código: rechazar noticias sin fecha o publicadas hace más de 2 días
      const fechaPub = String(e.fechaPublicacion || e.fecha || '').trim().slice(0, 10)
      if (!esFechaNoticiaReciente(fechaPub, hoy, 2)) {
        descartadasPorViejas++
        continue
      }

      const lugar = String(e.lugar || 'Manizales · Caldas').trim()
      const departamento = String(e.departamento || 'Caldas').trim()
      const resumen = String(e.resumen || 'Reporte vial verificado en prensa regional.').trim()

      const candidatoBase = { titulo, lugar, resumen, esNoticiaWebReal: true }
      if (esEventoRedundante(candidatoBase, acumulados)) continue

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

      const idxFuente =
        typeof e.indiceFuenteWeb === 'number' &&
        e.indiceFuenteWeb >= 0 &&
        e.indiceFuenteWeb < fuentesWeb.length
          ? e.indiceFuenteWeb
          : i
      const fuenteObj = fuentesWeb[idxFuente] || fuentesWeb[0]

      // Caducidad calculada desde la fecha real de publicación (máx 48h desde el día publicado)
      const [yP, mP, dP] = fechaPub.split('-').map(Number)
      const pubFinDiaMs = new Date(yP, mP - 1, dP, 23, 59, 0).getTime()
      const expiraDesdePub = pubFinDiaMs + 24 * 60 * 60 * 1000 // Máx hasta el final del día siguiente
      const expiraEn = Math.max(ahora + 12 * 60 * 60 * 1000, Math.min(ahora + TTL_NOTICIA_WEB_MS, expiraDesdePub))

      const rec =
        e.recomendacionGema === 'intervenir_urgente' ||
        e.recomendacionGema === 'apoyo_logistico' ||
        e.recomendacionGema === 'monitorear_sin_intervenir'
          ? e.recomendacionGema
          : 'apoyo_logistico'

      const nuevoEvento: EventoRadarLocal = {
        id: `rad-web-${ahora}-${i}`,
        titulo,
        lugar,
        departamento,
        lat: coordsValidas ? Number(latNum.toFixed(5)) : coordsFallback.lat,
        lng: coordsValidas ? Number(lngNum.toFixed(5)) : coordsFallback.lng,
        fuenteNoticia: String(e.fuenteNoticia || fuenteObj?.title || 'Prensa Regional / Invías').trim(),
        urlFuente: fuenteObj?.uri || undefined,
        resumen,
        fecha: fechaPub,
        creadoEn: ahora,
        expiraEn,
        esEmergenciaGrave: Boolean(e.esEmergenciaGrave),
        atencionOficialPresente: e.atencionOficialPresente !== false,
        esNoticiaWebReal: true,
        recomendacionGema: rec,
        justificacionGema:
          String(e.justificacionGema || '').trim() ||
          'Novedad reportada en prensa regional. Evaluar cercanía a Finca El Guadual antes de despachar.',
      }

      resultados.push(nuevoEvento)
      acumulados.push(nuevoEvento)
    }

    const horaTxt = new Date(ahora).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
    const diagnostico =
      resultados.length > 0
        ? `🌐 Web verificada (${horaTxt}): ${resultados.length} noticia(s) real(es) de las últimas 48h.`
        : descartadasPorViejas > 0
          ? `🌐 Web verificada (${horaTxt}): sin noticias nuevas de las últimas 48h (se filtraron ${descartadasPorViejas} antiguas).`
          : `🌐 Web verificada (${horaTxt}): sin emergencias viales recientes (<48h) en Caldas / Eje Cafetero.`

    return {
      eventos: resultados,
      busquedaWebActiva: true,
      descartadasPorViejas,
      diagnostico,
    }
  } catch (err) {
    console.warn('Error buscando noticias viales reales con Gemini:', err)
    return {
      eventos: [],
      busquedaWebActiva: false,
      descartadasPorViejas: 0,
      diagnostico: 'Error de red consultando noticias web en vivo.',
    }
  }
}

/**
 * 3. GENERACIÓN DINÁMICA DE LLAMADAS COMUNITARIAS VEREDALES FRESCAS (TTL ~28h)
 * Evita repetir veredas y temáticas ya activas en el radar.
 */
export async function generarLlamadasComunitariasIA(
  eventosExistentes: EventoRadarLocal[] = [],
  cantidad = 2
): Promise<EventoRadarLocal[]> {
  if (!geminiDisponible) return []

  const hoy = hoyISO()
  const activos = eventosExistentes.filter((e) => !e.despachado)
  const veredasOcupadas = Array.from(
    new Set(activos.map((e) => extraerClaveVereda(e.lugar)).filter(Boolean))
  )
  const temasOcupados = Array.from(
    new Set(activos.map((e) => detectarTemaEvento(e)).filter((t): t is string => Boolean(t)))
  )
  const titulosExistentes = eventosExistentes.map((e) => e.titulo)

  const prompt = `Fecha: ${hoy}. Eres Gema, oficial de operaciones de Bear's Reserve (base en Finca El Guadual, Vereda San Peregrino, Manizales, Caldas).
Genera exactamente ${cantidad} llamada(s) comunitaria(s) veredal(es) REALISTAS y DISTINTAS entre sí en zona rural de Manizales / Caldas.

VEREDAS DISPONIBLES (elige veredas DIFERENTES entre sí):
San Peregrino, La Cabaña, La Linda, Morrogacho, El Desquite, El Rosario, Bajo Tablazo, La Trinidad, Gallinazo (Villamaría), Alto Bonito, Cuchilla del Salado, Kilómetro 41, La Violeta, Neira rural, Chinchiná rural, Palestina rural.

RESTRICCIONES ESTRICTAS ANTI-REPETICIÓN:
- PROHIBIDO repetir estas veredas que ya están activas en el radar: ${veredasOcupadas.join(', ') || 'ninguna'}.
- PROHIBIDO repetir estas temáticas que ya están activas: ${temasOcupados.join(', ') || 'ninguna'}.
- PROHIBIDO repetir estos títulos: ${titulosExistentes.slice(0, 10).join(' | ') || 'ninguno'}.
- Varía entre temas distintos: desvare mecánico de jeep cafetero, traslado de adulto mayor a cita médica, caída de árbol sobre camino/acueducto, trasteo solidario de familia campesina, transporte de cosecha de plátano/aguacate, despeje de cuneta/vado tras lluvia, apoyo a camión lechero (solo si "lechero" no está prohibido).

Responde ÚNICAMENTE con un JSON válido:
{
  "llamadas": [
    {
      "titulo": "Título concreto y diferente",
      "lugar": "Vereda específica · Manizales o municipio de Caldas",
      "departamento": "Caldas",
      "fuenteNoticia": "Llamada comunitaria / JAC / Radio veredal",
      "resumen": "Detalle humano concreto (1-2 frases)",
      "esEmergenciaGrave": false,
      "recomendacionGema": "intervenir_urgente",
      "justificacionGema": "Qué vehículo/equipo conviene despachar desde Finca El Guadual"
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
    const acumulados = [...eventosExistentes]
    const elegidas: EventoRadarLocal[] = []

    for (let idx = 0; idx < crudos.length && elegidas.length < cantidad; idx++) {
      const c = crudos[idx]
      const titulo = String(c.titulo || '').trim()
      if (!titulo) continue
      const lugar = String(c.lugar || 'Vereda San Peregrino · Manizales').trim()
      const departamento = String(c.departamento || 'Caldas').trim()
      const resumen = String(c.resumen || 'Solicitud de apoyo comunitario en zona rural.').trim()

      // Doble filtro en código contra vereda o temática repetida
      if (esEventoRedundante({ titulo, lugar, resumen, esNoticiaWebReal: false }, acumulados)) {
        continue
      }

      const coords = resolverCoordenadasLugar(lugar, departamento)
      const rec =
        c.recomendacionGema === 'intervenir_urgente' ||
        c.recomendacionGema === 'apoyo_logistico' ||
        c.recomendacionGema === 'monitorear_sin_intervenir'
          ? c.recomendacionGema
          : 'intervenir_urgente'

      const nueva: EventoRadarLocal = {
        id: `rad-com-${ahora}-${idx}`,
        titulo,
        lugar,
        departamento,
        lat: coords.lat,
        lng: coords.lng,
        fuenteNoticia: String(c.fuenteNoticia || 'Llamada directa a la Central Bear\'s Reserve').trim(),
        resumen,
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

      elegidas.push(nueva)
      acumulados.push(nueva)
    }

    return elegidas
  } catch (err) {
    console.warn('Error generando llamadas comunitarias con Gemini:', err)
    return []
  }
}

/**
 * 4. RESOLUCIÓN AUTÓNOMA DE MISIONES POR IA 🤖
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

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
  googleSearchBloqueadoEnSesion,
  limpiarJson,
  llamarGemini,
  llamarGeminiConBusqueda,
} from '@/ai/gemini'
import { hoyISO, isoLocal } from '@/lib/fechas'
import { BASE_BEARS_RESERVE, resolverCoordenadasLugar, type EstimacionLogisticaMision } from './geo'
import {
  CAPACIDAD_TANQUE_FALLBACK_GAL,
  TTL_LLAMADA_COMUNITARIA_MS,
  TTL_NOTICIA_WEB_MS,
} from './constants'
import {
  calcularAutonomiaRealKm,
  detectarTemaEvento,
  esEventoRedundante,
  esFechaNoticiaReciente,
  extraerClaveVereda,
  filtrarEventosRadarVigentes,
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

export { TTL_NOTICIA_WEB_MS, TTL_LLAMADA_COMUNITARIA_MS } from './constants'

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

interface RssNewsItem {
  title?: string
  pubDate?: string
  link?: string
  author?: string
  description?: string
}

interface CandidatoNoticiaRaw {
  titulo: string
  fuente: string
  link: string
  fechaPub: string
  resumenRaw: string
  alcance: 'regional' | 'nacional'
}

function parsearRssXml(xmlText: string): RssNewsItem[] {
  if (typeof DOMParser === 'undefined') return []
  try {
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml')
    if (doc.querySelector('parsererror')) return []
    const nodes = Array.from(doc.querySelectorAll('item'))
    return nodes.map((n) => ({
      title: n.querySelector('title')?.textContent || '',
      pubDate: n.querySelector('pubDate')?.textContent || '',
      link: n.querySelector('link')?.textContent || '',
      author: n.querySelector('source')?.textContent || '',
      description: n.querySelector('description')?.textContent || '',
    }))
  } catch {
    return []
  }
}

function parsearFechaRssISO(pubDate?: string): string {
  const s = String(pubDate || '').trim()
  if (!s) return ''
  // Formato MySQL/rss2json sin zona horaria: "YYYY-MM-DD HH:mm:ss" (UTC)
  const cadenaFecha = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(:\d{2})?$/.test(s)
    ? `${s.replace(' ', 'T')}Z`
    : s
  const parsedDate = new Date(cadenaFecha)
  if (Number.isNaN(parsedDate.getTime())) return ''
  return isoLocal(parsedDate)
}

interface MedioRssColombia {
  nombre: string
  rssUrl: string
  alcance: 'regional' | 'nacional'
}

/**
 * Medios colombianos reales verificados en vivo (HTTP 200, <700ms, CORS abierto vía rss2json / allorigins).
 * Prioriza La Patria (Caldas/Manizales) primero para que la prensa regional nunca quede fuera del tope.
 */
const MEDIOS_RSS_COLOMBIA: MedioRssColombia[] = [
  { nombre: 'La Patria', rssUrl: 'https://www.lapatria.com/rss.xml', alcance: 'regional' },
  { nombre: 'El Tiempo CO', rssUrl: 'https://www.eltiempo.com/rss/colombia.xml', alcance: 'nacional' },
  {
    nombre: 'El Tiempo Regiones',
    rssUrl: 'https://www.eltiempo.com/rss/colombia_otras-ciudades.xml',
    alcance: 'nacional',
  },
  {
    nombre: 'El Tiempo Antioquia',
    rssUrl: 'https://www.eltiempo.com/rss/colombia_medellin.xml',
    alcance: 'nacional',
  },
  {
    nombre: 'El Tiempo Valle',
    rssUrl: 'https://www.eltiempo.com/rss/colombia_cali.xml',
    alcance: 'nacional',
  },
  {
    nombre: 'Caracol Radio',
    rssUrl: 'https://caracol.com.co/arc/outboundfeeds/rss/?outputType=xml',
    alcance: 'nacional',
  },
]

const REGEX_SENAL_OPERATIVA =
  /\b(derrumbe|derrumbes|deslizamiento|deslizamientos|inundaci[oó]n|inundaciones|alerta roja|quebrada|quebradas|creciente|avalancha|v[ií]a|bloquea|bloqueo|cierre vial|cierre total|volcamiento|[aá]rbol|tormenta|lluvias|aguacero|emergencia|emergencias|damnificad[oa]s?|evacuaci[oó]n|socavaci[oó]n|incendio|terremoto|sismo|temblor|rescate|atrapad[oa]s?|varad[oa]s?|incomunicad[oa]s?|desbordamiento|vendaval|granizada|puente|pendiente|suspendido)\b/i

async function obtenerItemsMedioRss(
  medio: MedioRssColombia
): Promise<{ items: RssNewsItem[]; ok: boolean; detalle: string }> {
  const encoded = encodeURIComponent(medio.rssUrl)
  const fallos: string[] = []

  // Canal 1 (primario, ~300-600ms con CORS nativo para medios colombianos): rss2json.com
  const c1 = new AbortController()
  const t1 = setTimeout(() => c1.abort(), 7000)
  try {
    const r1 = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encoded}`, {
      signal: c1.signal,
    })
    if (r1.ok) {
      const json = (await r1.json()) as { status?: string; items?: RssNewsItem[] }
      if (json.status === 'ok' && Array.isArray(json.items)) {
        return { items: json.items, ok: true, detalle: medio.nombre }
      }
      fallos.push('rss2json sin items')
    } else {
      fallos.push(`rss2json ${r1.status}`)
    }
  } catch {
    fallos.push('rss2json timeout')
  } finally {
    clearTimeout(t1)
  }

  // Canal 2 (respaldo directo XML): allorigins /raw
  const c2 = new AbortController()
  const t2 = setTimeout(() => c2.abort(), 7000)
  try {
    const r2 = await fetch(`https://api.allorigins.win/raw?url=${encoded}`, { signal: c2.signal })
    if (r2.ok) {
      const xml = await r2.text()
      const items = parsearRssXml(xml)
      if (items.length > 0 || xml.includes('<rss')) {
        return { items, ok: true, detalle: medio.nombre }
      }
      fallos.push('allorigins sin XML')
    } else {
      fallos.push(`allorigins ${r2.status}`)
    }
  } catch {
    fallos.push('allorigins timeout')
  } finally {
    clearTimeout(t2)
  }

  return { items: [], ok: false, detalle: `${medio.nombre} (${fallos.join(', ')})` }
}

async function fetchMedioColombia(
  medio: MedioRssColombia
): Promise<{ items: CandidatoNoticiaRaw[]; totalRecientes: number; ok: boolean; detalle: string; alcance: 'regional' | 'nacional' }> {
  const hoy = hoyISO()
  const { items: rawItems, ok, detalle } = await obtenerItemsMedioRss(medio)
  if (!ok) return { items: [], totalRecientes: 0, ok: false, detalle, alcance: medio.alcance }

  const recientes: CandidatoNoticiaRaw[] = []
  for (const item of rawItems) {
    const titulo = String(item.title || '').trim()
    if (!titulo) continue

    const fechaPub = parsearFechaRssISO(item.pubDate)
    if (!esFechaNoticiaReciente(fechaPub, hoy, 2)) continue

    const resumenRaw = String(item.description || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 260)

    recientes.push({
      titulo,
      fuente: medio.nombre,
      link: String(item.link || '').trim(),
      fechaPub,
      resumenRaw: resumenRaw || titulo,
      alcance: medio.alcance,
    })
  }

  // Priorizar noticias con señal operativa (emergencias, clima, vías, rescates)
  const conSenal = recientes.filter((it) =>
    REGEX_SENAL_OPERATIVA.test(`${it.titulo} ${it.resumenRaw}`)
  )
  return { items: conSenal, totalRecientes: recientes.length, ok: true, detalle, alcance: medio.alcance }
}

/**
 * Fuente web real multi-medio de TODO Colombia (verificada en vivo con CORS abierto, sin depender de cuota de Google Search):
 * 1. Consulta en paralelo 6 feeds reales de prensa colombiana (El Tiempo CO/Regiones/Antioquia/Valle, Caracol Radio, La Patria).
 * 2. Filtra estrictamente noticias <48h y prioriza señales operativas (vías, lluvias, derrumbes, emergencias, rescates).
 * 3. Curador operativo estricto en 1 sola llamada a Gemini IA para aprobar solo emergencias donde Bear's Reserve puede ayudar.
 */
async function buscarNoticiasFuentesAbiertasColombia(
  eventosExistentes: EventoRadarLocal[]
): Promise<{
  eventos: EventoRadarLocal[]
  consultado: boolean
  candidatasEvaluadas: number
  descartadasIrrelevantes: number
  detalleFuentes: string
}> {
  const resultados = await Promise.all(MEDIOS_RSS_COLOMBIA.map((m) => fetchMedioColombia(m)))

  const exitosos = resultados.filter((r) => r.ok)
  const fallidos = resultados.filter((r) => !r.ok)

  if (exitosos.length === 0) {
    return {
      eventos: [],
      consultado: false,
      candidatasEvaluadas: 0,
      descartadasIrrelevantes: 0,
      detalleFuentes: fallidos.map((f) => f.detalle).slice(0, 3).join(' | '),
    }
  }

  const totalArticulosRecientes = exitosos.reduce((acc, r) => acc + r.totalRecientes, 0)
  const detalleFuentes = `${exitosos.length}/${MEDIOS_RSS_COLOMBIA.length} medios CO (${totalArticulosRecientes} notas <48h)`

  // Combinar y pre-deduplicar candidatas aplicando cuotas por medio (priorizando prensa regional Caldas)
  const combinadas: CandidatoNoticiaRaw[] = []
  const yaVistas: EventoRadarLocal[] = [...eventosExistentes]
  const exitososPriorizados = [...exitosos].sort((a, b) =>
    a.alcance === b.alcance ? 0 : a.alcance === 'regional' ? -1 : 1
  )

  const agregarDeMedio = (res: (typeof exitososPriorizados)[number], maxPorMedio: number) => {
    let agregadasMedio = 0
    for (const item of res.items) {
      if (combinadas.length >= 18 || agregadasMedio >= maxPorMedio) break
      const temp: EventoRadarLocal = {
        id: 'tmp',
        titulo: item.titulo,
        lugar: 'Colombia',
        departamento: 'Colombia',
        fuenteNoticia: item.fuente,
        urlFuente: item.link,
        resumen: item.resumenRaw,
        fecha: item.fechaPub,
        esEmergenciaGrave: false,
        atencionOficialPresente: true,
        esNoticiaWebReal: true,
        recomendacionGema: 'apoyo_logistico',
        justificacionGema: '',
      }
      if (esEventoRedundante(temp, yaVistas)) continue
      combinadas.push(item)
      yaVistas.push(temp)
      agregadasMedio++
    }
  }

  // Ronda 1: cuota balanceada (máx 6 para regional La Patria, máx 4 por medio nacional)
  for (const res of exitososPriorizados) {
    agregarDeMedio(res, res.alcance === 'regional' ? 6 : 4)
  }
  // Ronda 2: completar hasta 18 si sobraron cupos
  if (combinadas.length < 18) {
    for (const res of exitososPriorizados) {
      agregarDeMedio(res, 18)
    }
  }

  if (combinadas.length === 0) {
    return {
      eventos: [],
      consultado: true,
      candidatasEvaluadas: totalArticulosRecientes,
      descartadasIrrelevantes: totalArticulosRecientes,
      detalleFuentes,
    }
  }

  // Sin Gemini disponible, no mostramos noticias sin curar para no meter basura irrelevante
  if (!geminiDisponible) {
    return {
      eventos: [],
      consultado: true,
      candidatasEvaluadas: combinadas.length,
      descartadasIrrelevantes: combinadas.length,
      detalleFuentes,
    }
  }

  try {
    const promptCurador = `Eres Gema, curadora operativa de Bear's Reserve 🐻 (organización comunitaria sin ánimo de lucro con base en Manizales, Caldas, equipada con camiones pesados, 4x4, winches, motosierras, capacidad de transporte de víveres, agua, ayudas humanitarias, evacuación de familias/enseres, despeje de vías rurales y rescate vehicular).

TAREA: Revisa CADA UNA de estas ${combinadas.length} noticias REALES recientes de Colombia (<48h) y decide cuáles son RELEVANTES para Bear's Reserve.

REGLAS DE FILTRADO ESTRICTO:
1. ACEPTA (puedeAyudar: true) ÚNICAMENTE si existe una situación REAL donde Bear's Reserve podría aportar aunque sea en lo más mínimo:
   - Inundaciones, derrumbes, avalanchas, crecientes o emergencias invernales con familias damnificadas o incomunicadas (EN CUALQUIER PARTE DE COLOMBIA: Chocó, Costa Caribe, Córdoba, Guajira, Antioquia, Cauca, Nariño, Tolima, Caldas, etc. — el usuario decide si envía ayuda o no).
   - Cierres viales prolongados, pérdida de banca, carreteras bloqueadas con viajeros/transportadores varados o pueblos sin suministros.
   - Comunidades rurales necesitando transporte humanitario, víveres, agua potable, evacuación de enseres o remoción de árboles/escombros.
2. RECHAZA (puedeAyudar: false) TAJANTEMENTE:
   - Accidentes de tránsito urbanos puntuales (moto vs carro/buseta, identificación de víctimas, choques ya atendidos por tránsito).
   - Noticias políticas, asignación de fondos/presupuestos, leyes, economía, aniversarios históricos (ej. "Fondo destina X millones a reconstrucción...").
   - Orden público armado, capturas, crímenes, deportes, farándula o notas que solo informan un hecho pasado donde ya no hay forma de ayudar.
3. Si dos noticias hablan del MISMO suceso, acepta solo UNA (la más completa) y rechaza la repetida.
4. Selecciona máximo 4 noticias verdaderamente accionables (si ninguna sirve, devuelve "aprobadas": []).

NOTICIAS CANDIDATAS:
${combinadas.map((c, i) => `[${i}] (${c.fechaPub} · ${c.fuente}) ${c.titulo} — ${c.resumenRaw}`).join('\n')}

Responde ÚNICAMENTE con un JSON válido:
{
  "aprobadas": [
    {
      "indice": 0,
      "lugar": "Municipio / Sector específico real de la noticia",
      "departamento": "Departamento real (ej: Chocó, Caldas, Antioquia, Córdoba, Cauca, Tolima...)",
      "resumen": "Resumen real y claro de la emergencia en 1-2 frases",
      "esEmergenciaGrave": true,
      "recomendacionGema": "apoyo_logistico",
      "justificacionGema": "Cómo exactamente podría apoyar Bear's Reserve (ej: envío de camión con agua/víveres, despeje con 4x4/winche, evacuación, etc.)"
    }
  ]
}`

    const { res } = await llamarGemini({
      contents: [{ role: 'user', parts: [{ text: promptCurador }] }],
      generationConfig: { temperature: 0.15, responseMimeType: 'application/json' },
    })
    if (!res) {
      return {
        eventos: [],
        consultado: true,
        candidatasEvaluadas: combinadas.length,
        descartadasIrrelevantes: combinadas.length,
        detalleFuentes: `${detalleFuentes} (curador Gemini ocupado)`,
      }
    }

    const data = (await res.json()) as GeminiCandidateResponse
    const { texto } = extraerTextoYFuentes(data)
    const parsed = JSON.parse(limpiarJson(texto)) as {
      aprobadas?: Array<{
        indice?: number
        lugar?: string
        departamento?: string
        resumen?: string
        esEmergenciaGrave?: boolean
        recomendacionGema?: EventoRadarLocal['recomendacionGema']
        justificacionGema?: string
      }>
    }

    const aprobadas = Array.isArray(parsed.aprobadas) ? parsed.aprobadas : []
    const ahora = Date.now()
    const eventos: EventoRadarLocal[] = []
    const usados = new Set<number>()
    const acumulados = [...eventosExistentes]

    for (const ap of aprobadas) {
      if (eventos.length >= 4) break
      const idx = Number(ap.indice)
      if (!Number.isInteger(idx) || idx < 0 || idx >= combinadas.length || usados.has(idx)) continue
      usados.add(idx)

      const orig = combinadas[idx]
      const lugar = String(ap.lugar || 'Colombia').trim()
      const departamento = String(ap.departamento || 'Colombia').trim()
      const resumen = String(ap.resumen || orig.resumenRaw || orig.titulo).trim()
      const justificacion = String(ap.justificacionGema || '').trim()

      // Doble filtro de seguridad por si la IA igualmente coló algo "sin impacto operativo"
      if (/sin impacto operativo|ya ocurrido|sin relaci[oó]n/i.test(justificacion)) continue

      const candidatoEv = {
        titulo: orig.titulo,
        lugar,
        resumen,
        urlFuente: orig.link,
        esNoticiaWebReal: true,
      }
      if (esEventoRedundante(candidatoEv, acumulados)) continue

      const coords = resolverCoordenadasLugar(lugar, departamento)
      const [yP, mP, dP] = orig.fechaPub.split('-').map(Number)
      const expiraDesdePub = new Date(yP, mP - 1, dP, 23, 59, 0).getTime() + 24 * 60 * 60 * 1000
      const expiraEn = Math.max(
        ahora + 12 * 60 * 60 * 1000,
        Math.min(ahora + TTL_NOTICIA_WEB_MS, expiraDesdePub)
      )

      const rec =
        ap.recomendacionGema === 'intervenir_urgente' ||
        ap.recomendacionGema === 'apoyo_logistico' ||
        ap.recomendacionGema === 'monitorear_sin_intervenir'
          ? ap.recomendacionGema
          : 'apoyo_logistico'

      const evFinal: EventoRadarLocal = {
        id: `rad-rss-${ahora}-${idx}`,
        titulo: orig.titulo,
        lugar,
        departamento,
        lat: coords.lat,
        lng: coords.lng,
        fuenteNoticia: orig.fuente,
        urlFuente: orig.link || undefined,
        resumen,
        fecha: orig.fechaPub,
        creadoEn: ahora,
        expiraEn,
        esEmergenciaGrave: Boolean(ap.esEmergenciaGrave),
        atencionOficialPresente: true,
        esNoticiaWebReal: true,
        recomendacionGema: rec,
        justificacionGema:
          justificacion ||
          'Emergencia real donde Bear\'s Reserve puede aportar apoyo logístico, transporte humanitario o rescate.',
      }

      eventos.push(evFinal)
      acumulados.push(evFinal)
    }

    return {
      eventos,
      consultado: true,
      candidatasEvaluadas: combinadas.length,
      descartadasIrrelevantes: Math.max(0, combinadas.length - eventos.length),
      detalleFuentes,
    }
  } catch (err) {
    console.warn('Error curando noticias con Gemini:', err)
    return {
      eventos: [],
      consultado: true,
      candidatasEvaluadas: combinadas.length,
      descartadasIrrelevantes: combinadas.length,
      detalleFuentes,
    }
  }
}

/**
 * 1. PRECIOS REALES DE COMBUSTIBLE EN COLOMBIA (Manizales / Caldas)
 * Si Google Search Grounding tiene cuota, usa 2 pasos verificados en web.
 * Si el plan gratuito no tiene cuota de grounding, hace 1 sola llamada limpia JSON (sin quemar RPM).
 */
export async function consultarPreciosCombustibleRealesAI(): Promise<PreciosCombustible | null> {
  if (!geminiDisponible) return null

  const hoy = hoyISO()

  try {
    let textoJson = ''
    let fuentesWeb: Array<{ title: string; uri: string }> = []
    let tuvoGroundingReal = false

    if (!googleSearchBloqueadoEnSesion()) {
      const promptBusqueda = `Fecha actual: ${hoy}.
Consulta en internet los precios VIGENTES hoy del combustible por galón en pesos colombianos (COP) en Manizales, Caldas (o el promedio oficial CREG / Ministerio de Minas y Energía de Colombia):
- Gasolina Corriente (COP/galón)
- ACPM / Diésel (COP/galón)
- Gasolina Extra (COP/galón)
Indica las cifras exactas y la fuente.`

      const { res: resPaso1, usoBusqueda } = await llamarGeminiConBusqueda(
        {
          contents: [{ role: 'user', parts: [{ text: promptBusqueda }] }],
          generationConfig: { temperature: 0.1 },
        },
        false
      )

      if (resPaso1 && usoBusqueda) {
        const data1 = (await resPaso1.json()) as GeminiCandidateResponse
        const extr = extraerTextoYFuentes(data1)
        fuentesWeb = extr.fuentesWeb
        tuvoGroundingReal = extr.fuentesWeb.length > 0 || extr.consultasWeb.length > 0
        if (extr.texto) {
          const promptJson = `Extrae del texto los precios vigentes por galón en COP para Colombia/Manizales:
"""
${extr.texto}
"""
Responde ÚNICAMENTE con un JSON válido:
{"corrientePorGalon":16000,"dieselPorGalon":10800,"extraPorGalon":20500,"fuente":"CREG / MinMinas Colombia (Manizales)"}`
          const { res: resPaso2 } = await llamarGemini({
            contents: [{ role: 'user', parts: [{ text: promptJson }] }],
            generationConfig: { temperature: 0, responseMimeType: 'application/json' },
          })
          if (resPaso2) {
            const data2 = (await resPaso2.json()) as GeminiCandidateResponse
            textoJson = extraerTextoYFuentes(data2).texto
          }
        }
      }
    }

    // 1 sola llamada limpia a Gemini si grounding no tiene cuota en el plan actual
    if (!textoJson) {
      const promptDirecto = `Fecha actual: ${hoy}.
Indica los precios de referencia vigentes más recientes del combustible por galón en COP en Manizales / Caldas (Colombia, CREG / MinMinas):
Responde ÚNICAMENTE con un JSON válido:
{"corrientePorGalon":16000,"dieselPorGalon":10800,"extraPorGalon":20500,"fuente":"Referencia Gemini (CREG / Manizales)"}`

      const { res } = await llamarGemini({
        contents: [{ role: 'user', parts: [{ text: promptDirecto }] }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
      })
      if (!res) return null
      const data = (await res.json()) as GeminiCandidateResponse
      textoJson = extraerTextoYFuentes(data).texto
    }

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
      actualizado: `${hoy} ${hora} · ${tuvoGroundingReal ? 'Sincronizado en vivo (Google Search)' : 'Referencia Gemini IA'}`,
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
    // PASO 1: Búsqueda real en Google Search para TODA Colombia (priorizando Caldas + emergencias nacionales donde Bear's Reserve pueda ayudar)
    const promptBusqueda = `Hoy es ${hoy}. Necesito noticias REALES publicadas únicamente entre ${desdeISO} y ${hoy} (últimas 48 horas) en CUALQUIER REGIÓN DE COLOMBIA (Caldas/Manizales, Chocó, Costa Caribe, Antioquia, Cauca, Nariño, Valle, Tolima, Santander, Llanos, etc.) donde una flota comunitaria con camiones, 4x4, winches y ayuda humanitaria (Bear's Reserve) PUEDA AYUDAR aunque sea en lo más mínimo:
- Inundaciones, derrumbes, avalanchas, crecientes o emergencias invernales con damnificados o pueblos incomunicados.
- Cierres viales prolongados, pérdida de banca o vías bloqueadas con viajeros/transportadores varados.
- Comunidades que necesiten víveres, agua, evacuación de enseres o remoción de árboles/escombros.

RECHAZA Y NO INCLUYAS: accidentes urbanos de moto/carro, identificación de víctimas, política, presupuestos, asignación de fondos, orden público armado ni noticias de hace más de 2 días.
Si no hay ninguna emergencia accionable entre ${desdeISO} y ${hoy}, responde "SIN_NOVEDADES_RECIENTES".`

    const { res: resPaso1, usoBusqueda, errorBusqueda } = await llamarGeminiConBusqueda(
      {
        contents: [{ role: 'user', parts: [{ text: promptBusqueda }] }],
        generationConfig: { temperature: 0.1 },
      },
      false
    )

    const ejecutarFallbackFuentesAbiertas = async (
      motivoFallback?: string
    ): Promise<ResultadoBusquedaNoticiasWeb> => {
      const abiertas = await buscarNoticiasFuentesAbiertasColombia(eventosExistentes)
      const horaTxt = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })

      if (abiertas.consultado) {
        return {
          eventos: abiertas.eventos,
          busquedaWebActiva: true,
          descartadasPorViejas: 0,
          diagnostico:
            abiertas.eventos.length > 0
              ? `🌐 Prensa nacional en vivo (${horaTxt} · ${abiertas.detalleFuentes}): ${abiertas.eventos.length} emergencia(s) relevante(s) aprobada(s) por Gema IA de ${abiertas.candidatasEvaluadas} revisadas (<48h).`
              : `🌐 Prensa nacional revisada (${horaTxt} · ${abiertas.detalleFuentes}): se evaluaron ${abiertas.candidatasEvaluadas} noticia(s) <48h en Colombia; ninguna requiere apoyo operativo de Bear's Reserve ahora.`,
        }
      }

      return {
        eventos: [],
        busquedaWebActiva: false,
        descartadasPorViejas: 0,
        diagnostico: `⚠️ Fuentes web no respondieron (${horaTxt}): ${abiertas.detalleFuentes || motivoFallback || 'sin conexión'}.`,
      }
    }

    if (!resPaso1 || !usoBusqueda) {
      return await ejecutarFallbackFuentesAbiertas(errorBusqueda)
    }

    const data1 = (await resPaso1.json()) as GeminiCandidateResponse
    const { texto: textoBuscado, fuentesWeb, consultasWeb } = extraerTextoYFuentes(data1)

    if (!textoBuscado || (fuentesWeb.length === 0 && consultasWeb.length === 0)) {
      return await ejecutarFallbackFuentesAbiertas(
        'Google Search no devolvió fuentes verificables para esta consulta'
      )
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
      // Bounding box completo de Colombia (incluye Amazonas/Leticia, Nariño/Ipiales y San Andrés)
      const coordsValidas =
        Number.isFinite(latNum) &&
        Number.isFinite(lngNum) &&
        latNum >= -4.5 &&
        latNum <= 13.5 &&
        lngNum >= -82 &&
        lngNum <= -66.5

      const idxFuenteRaw =
        e.indiceFuenteWeb !== undefined && e.indiceFuenteWeb !== null
          ? Number(e.indiceFuenteWeb)
          : Number.NaN
      const fuenteObj =
        Number.isInteger(idxFuenteRaw) && idxFuenteRaw >= 0 && idxFuenteRaw < fuentesWeb.length
          ? fuentesWeb[idxFuenteRaw]
          : undefined

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
    const [minFactor, maxFactor, defaultFactor] =
      resultado === 'fallida_dificultad'
        ? [0.45, 0.8, 0.65]
        : resultado === 'parcial'
          ? [0.75, 1.05, 0.92]
          : [0.9, 1.15, 1.0]
    const factorDistanciaReal = Number.isFinite(factorRaw)
      ? Number(Math.min(maxFactor, Math.max(minFactor, factorRaw)).toFixed(2))
      : defaultFactor

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

const DIAS_SEMANA_CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function construirSnapshotGema(ctx: ContextoGemaCompleto): string {
  const hoy = hoyISO()
  const hora = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })

  const turnosHoy = ctx.turnos.filter((t) => t.fecha === hoy)
  const horasPorEmp = new Map<string, number>()
  for (const t of ctx.turnos) {
    horasPorEmp.set(t.empleadoId, (horasPorEmp.get(t.empleadoId) || 0) + t.horas)
  }

  // Ocultar [id: ...] en vehículos no habilitados para que Gemini nunca intente tanquearlos
  const flotaTxt = ctx.vehiculos
    .map(
      (v) =>
        `- ${v.marca} ${v.linea} ${v.placa ? `(${v.placa})` : ''}${v.disponibleParaTrabajo ? ` [id: ${v.id}]` : ''} | ${v.disponibleParaTrabajo ? 'Habilitado' : 'Solo CashMet (no operable)'} | Estado: ${v.estado} | Tanque: ${v.nivelCombustiblePorc}% de ${v.capacidadTanqueGalones} gal (${v.tipoCombustible}, ${v.consumoKmPorGalon} km/gal) | Odómetro: ${v.kilometrajeActual.toLocaleString('es-CO')} km | Llantas: ${v.desgasteLlantasPorc}% desgaste${v.notasCashmet ? ` | Notas: ${v.notasCashmet}` : ''}`
    )
    .join('\n')

  const personalTxt = ctx.empleados
    .map(
      (e) =>
        `- ${e.nombreCompleto} (${e.cargo}) | ${e.activo ? 'En Reserva' : 'Excluido'} | ${horasPorEmp.get(e.id) || 0}/${e.maxHorasSemanales || 42}h esta semana${e.horariosNoDisponibles.length ? ` | Restricciones: ${e.horariosNoDisponibles.map((h) => `${DIAS_SEMANA_CORTO[h.diaSemana] ?? `día ${h.diaSemana}`} ${h.horaInicio}-${h.horaFin} (${h.motivo})`).join(', ')}` : ''}`
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

  const radarVigente = filtrarEventosRadarVigentes(ctx.eventosRadar)
  const radarTxt = radarVigente.length
    ? radarVigente
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

  const montoLiquidado =
    typeof ctx.tarjetaCombustible.saldoLiquidadoCOP === 'number'
      ? ctx.tarjetaCombustible.saldoLiquidadoCOP
      : ctx.tarjetaCombustible.liquidadoEnCashmet
        ? ctx.tarjetaCombustible.saldoAcumuladoCOP
        : 0
  const saldoPendiente = Math.max(0, Math.round(ctx.tarjetaCombustible.saldoAcumuladoCOP - montoLiquidado))

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
- Tarjeta mes: Acumulado $${ctx.tarjetaCombustible.saldoAcumuladoCOP.toLocaleString('es-CO')} COP (${ctx.tarjetaCombustible.totalGalonesMes} gal) | Liquidado: $${montoLiquidado.toLocaleString('es-CO')} COP | Pendiente por liquidar: $${saldoPendiente.toLocaleString('es-CO')} COP

RUTAS HABITUALES:
${rutasTxt}

RADAR DE CONTINGENCIAS (${radarVigente.length}):
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
  const mensajeLimpio = String(mensaje || '').trim()
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

  // Evitar doble turno consecutivo `role: 'user'` (ej. cuando la UI ya agregó el mensaje actual al historial)
  const turnoNuevoTexto = `${snapshot}\n\nMensaje del coordinador: ${mensajeLimpio}`
  const ultimoContenido = contents[contents.length - 1]
  if (ultimoContenido && ultimoContenido.role === 'user') {
    const ultimoTexto = ultimoContenido.parts[ultimoContenido.parts.length - 1]?.text?.trim()
    if (ultimoTexto === mensajeLimpio) {
      ultimoContenido.parts[ultimoContenido.parts.length - 1] = { text: turnoNuevoTexto }
    } else {
      ultimoContenido.parts.push({ text: turnoNuevoTexto })
    }
  } else {
    contents.push({
      role: 'user',
      parts: [{ text: turnoNuevoTexto }],
    })
  }

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

    const vehiculosHabilitados = new Set(
      contexto.vehiculos
        .filter((v) => v.disponibleParaTrabajo && v.estado !== 'mantenimiento')
        .map((v) => v.id)
    )
    const acciones: AccionGema[] = []
    const accionesVistas = new Set<string>()
    if (Array.isArray(parsed.acciones)) {
      for (const a of parsed.acciones) {
        if (
          a.tipo === 'rotar_turnos' ||
          a.tipo === 'escanear_radar' ||
          a.tipo === 'actualizar_precios'
        ) {
          if (!accionesVistas.has(a.tipo)) {
            accionesVistas.add(a.tipo)
            acciones.push({ tipo: a.tipo })
          }
        } else if (a.tipo === 'tanquear_vehiculo') {
          const vid = String(a.vehiculoId ?? a.params?.vehiculoId ?? '').trim()
          const clave = `tanquear_vehiculo:${vid}`
          if (vid && vehiculosHabilitados.has(vid) && !accionesVistas.has(clave)) {
            accionesVistas.add(clave)
            acciones.push({ tipo: 'tanquear_vehiculo', vehiculoId: vid })
          }
        }
      }
    }

    return { respuesta, acciones, fuente: 'gemini' }
  } catch (err) {
    console.warn('Error en Radio con Gema (Gemini):', err)
    return null
  }
}

export interface SeleccionConvoyIA {
  vehiculosElegidos: VehiculoOperativo[]
  rolesPorVehiculo: Record<string, string>
  motivoGema: string
  tipoMision: MisionComunitaria['tipo']
  terrenoSugerido: MisionComunitaria['terreno']
  usoGemini: true
}

/**
 * 5. SELECCIÓN INTELIGENTE DE VEHÍCULO O CONVOY CON GEMINI IA 🧠🚛🚙
 * Interpreta la emergencia real, compara TODOS los vehículos habilitados y libres de Bear's Reserve
 * (tipo, modelo, carrocería, notas de CashMet, ficha técnica, tanque, autonomía vs km ida y vuelta, desgaste)
 * y decide si enviar 1 vehículo óptimo o un convoy de 2–3 vehículos complementarios.
 */
export async function seleccionarConvoyMisionConIA(
  evento: Pick<EventoRadarLocal, 'titulo' | 'lugar' | 'departamento' | 'resumen' | 'esEmergenciaGrave'>,
  vehiculos: VehiculoOperativo[],
  logistica: EstimacionLogisticaMision,
  personalActivoDisponible = 2
): Promise<SeleccionConvoyIA | null> {
  if (!geminiDisponible) return null

  const candidatos = vehiculos.filter(
    (v) => v.disponibleParaTrabajo && v.estado !== 'en_mision' && v.estado !== 'mantenimiento'
  )
  if (candidatos.length === 0) return null

  const maxConvoy = Math.min(3, candidatos.length, Math.max(1, personalActivoDisponible))

  const terrenoBaseAutonomia =
    logistica.categoriaDistancia === 'nacional' ? 'mixto_montaña' : 'trocha_moderada'

  const catalogoFlota = candidatos
    .map((v) => {
      const nivel = Number.isFinite(v.nivelCombustiblePorc) ? v.nivelCombustiblePorc : 50
      const capGal =
        Number.isFinite(v.capacidadTanqueGalones) && v.capacidadTanqueGalones > 0
          ? v.capacidadTanqueGalones
          : CAPACIDAD_TANQUE_FALLBACK_GAL
      const galActuales = Number((capGal * (nivel / 100)).toFixed(1))
      const autonomiaKm = Math.round(
        calcularAutonomiaRealKm(v, terrenoBaseAutonomia, logistica.minutosRalenti)
      )
      const extras = [
        v.carroceria ? `carrocería: ${v.carroceria}` : '',
        v.capacidadTexto ? `capacidad: ${v.capacidadTexto}` : '',
        v.notasCashmet ? `notas CashMet: "${v.notasCashmet}"` : '',
        v.fichaInvestigadaNota ? `ficha: "${v.fichaInvestigadaNota}"` : '',
      ]
        .filter(Boolean)
        .join(' | ')

      return `- id="${v.id}" | ${v.marca} ${v.linea}${v.modelo ? ` (${v.modelo})` : ''} | tipo=${v.tipo} | comb=${v.tipoCombustible} | tanque=${nivel}% (${galActuales}/${capGal} gal, autonomía real estimada ~${autonomiaKm} km) | llantas desgaste=${v.desgasteLlantasPorc}%${extras ? ` | ${extras}` : ''}`
    })
    .join('\n')

  const prompt = `Eres Gema, coordinadora táctica de flota de Bear's Reserve 🐻 (base en Finca El Guadual, Manizales, Caldas).
Debes INTERPRETAR esta situación operativa y COMPARAR los vehículos habilitados libres para decidir cuál vehículo o qué convoy (entre 1 y ${maxConvoy} vehículos) debe salir.

SITUACIÓN / MISIÓN:
- Título: ${evento.titulo}
- Ubicación: ${evento.lugar} (${evento.departamento})
- Descripción: ${evento.resumen}
- Emergencia grave: ${evento.esEmergenciaGrave ? 'SÍ' : 'No'}
- Distancia real estimada: ${logistica.distanciaKmIda} km ida (${logistica.distanciaKmTotalIdaYVuelta} km ida y vuelta)
- Tiempo estimado: ${logistica.minutosRodamientoTotal} min conducción + ${logistica.minutosServicioEnSitio} min servicio en sitio

VEHÍCULOS HABILITADOS Y LIBRES EN BASE (${candidatos.length}):
${catalogoFlota}

CRITERIOS OPERATIVOS OBLIGATORIOS:
1. INTERPRETA QUÉ SE NECESITA DE VERDAD:
   - Traslado médico, adulto mayor, personas o cita de salud → prioriza SUV / campero cómodo / van / automóvil / camioneta de pasajeros. EVITA mandar camiones pesados de carga si hay un vehículo de pasajeros o 4x4 adecuado.
   - Rescate de vehículo atascado, barrizal, volcamiento, derrumbe o remolque pesado → prioriza 4x4, camión con tracción/winche o vehículo de fuerza/rescate según lo que indiquen modelo, carrocería y notas.
   - Transporte de víveres, agua, ayudas humanitarias, insumos o mudanza campesina → prioriza camionetas de platón, furgones o camiones de carga adecuados a la trocha/carretera.
   - Emergencias grandes o complejas (volcamiento de camión/tractomula, inundación con familias damnificadas, derrumbe grave, rescate + evacuación) → si hay varios vehículos complementarios libres y personal suficiente (máximo ${maxConvoy}), ARMA UN CONVOY de 2 o 3 vehículos con roles complementarios (ej. vehículo pesado/rescate + 4x4 de apoyo/evacuación o enlace rápido).
   - Situaciones puntuales o sencillas (1 traslado médico, 1 desvare menor, 1 entrega pequeña) → envía SOLO 1 vehículo bien elegido (no desperdicies flota).
2. COMPARA AUTONOMÍA, TERRENO Y ESTADO:
   - Revisa la autonomía actual vs los ${logistica.distanciaKmTotalIdaYVuelta} km ida y vuelta (prefiere vehículos con buen nivel de tanque y menor desgaste de llantas; evita enviar vehículos con tanque <=15% si hay otro apto).
   - En veredas/trochas prefiere despeje al suelo y tracción (4x4/campero/camión rural); en autopista nacional larga distancia prefiere vehículos confiables y con buena autonomía.
3. USA ÚNICAMENTE IDs EXACTOS de la lista anterior (entre 1 y ${maxConvoy} IDs, sin repetir).

Responde ÚNICAMENTE con un JSON válido:
{
  "vehiculosIds": ["id_exacto_1"],
  "rolesPorVehiculo": {
    "id_exacto_1": "Rol breve de este vehículo en la misión"
  },
  "tipoMision": "auxilio_comunitario | desvarado_rural | rescate_barrizal | transporte_humanitario | apoyo_vial",
  "terrenoSugerido": "pavimento | trocha_moderada | trocha_extrema_barrizal | mixto_montaña",
  "motivoGema": "Explicación concreta en 1-2 frases comparando por qué elegiste este vehículo (o convoy) frente a los demás disponibles."
}`

  try {
    const { res } = await llamarGemini({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
    })
    if (!res) return null

    const data = (await res.json()) as GeminiCandidateResponse
    const { texto } = extraerTextoYFuentes(data)
    if (!texto) return null

    const parsed = JSON.parse(limpiarJson(texto)) as {
      vehiculosIds?: unknown
      rolesPorVehiculo?: Record<string, string>
      tipoMision?: string
      terrenoSugerido?: string
      motivoGema?: string
    }

    const idsRaw = Array.isArray(parsed.vehiculosIds) ? parsed.vehiculosIds : []
    const mapaCand = new Map(candidatos.map((v) => [v.id, v]))
    const elegidos: VehiculoOperativo[] = []
    const vistos = new Set<string>()

    for (const raw of idsRaw) {
      const id = String(raw || '').trim()
      if (!id || vistos.has(id)) continue
      const veh = mapaCand.get(id)
      if (veh) {
        elegidos.push(veh)
        vistos.add(id)
        if (elegidos.length >= maxConvoy) break
      }
    }

    if (elegidos.length === 0) return null

    const tiposValidos: Array<MisionComunitaria['tipo']> = [
      'auxilio_comunitario',
      'desvarado_rural',
      'rescate_barrizal',
      'transporte_humanitario',
      'apoyo_vial',
    ]
    const tipoMision: MisionComunitaria['tipo'] = tiposValidos.includes(
      parsed.tipoMision as MisionComunitaria['tipo']
    )
      ? (parsed.tipoMision as MisionComunitaria['tipo'])
      : 'auxilio_comunitario'

    const terrenosValidos: Array<MisionComunitaria['terreno']> = [
      'pavimento',
      'trocha_moderada',
      'trocha_extrema_barrizal',
      'mixto_montaña',
    ]
    const terrenoSugerido: MisionComunitaria['terreno'] = terrenosValidos.includes(
      parsed.terrenoSugerido as MisionComunitaria['terreno']
    )
      ? (parsed.terrenoSugerido as MisionComunitaria['terreno'])
      : logistica.categoriaDistancia === 'nacional'
        ? 'mixto_montaña'
        : 'trocha_moderada'

    const rolesPorVehiculo: Record<string, string> = {}
    if (parsed.rolesPorVehiculo && typeof parsed.rolesPorVehiculo === 'object') {
      for (const v of elegidos) {
        const rol = String(parsed.rolesPorVehiculo[v.id] || '').trim()
        if (rol) rolesPorVehiculo[v.id] = rol
      }
    }

    const nombres = elegidos.map((v) => `${v.marca} ${v.linea}`).join(' + ')
    const motivoGema =
      String(parsed.motivoGema || '').trim() ||
      `Gema IA seleccionó ${nombres} tras evaluar la situación y comparar la flota disponible.`

    return {
      vehiculosElegidos: elegidos,
      rolesPorVehiculo,
      motivoGema,
      tipoMision,
      terrenoSugerido,
      usoGemini: true,
    }
  } catch (err) {
    console.warn('Error seleccionando convoy con Gemini IA:', err)
    return null
  }
}

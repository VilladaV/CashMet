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

async function obtenerItemsRssConRespaldo(rssUrl: string): Promise<{ items: RssNewsItem[]; ok: boolean }> {
  const encoded = encodeURIComponent(rssUrl)

  // Mirror 1: rss2json.com (devuelve JSON ya parseado)
  try {
    const c1 = new AbortController()
    const t1 = setTimeout(() => c1.abort(), 6500)
    const r1 = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encoded}`, { signal: c1.signal })
    clearTimeout(t1)
    if (r1.ok) {
      const json = (await r1.json()) as { status?: string; items?: RssNewsItem[] }
      if (json.status === 'ok' && Array.isArray(json.items)) {
        return { items: json.items, ok: true }
      }
    }
  } catch {
    /* intenta mirror 2 */
  }

  // Mirror 2: allorigins.win (XML directo de Google News)
  try {
    const c2 = new AbortController()
    const t2 = setTimeout(() => c2.abort(), 7500)
    const r2 = await fetch(`https://api.allorigins.win/raw?url=${encoded}`, { signal: c2.signal })
    clearTimeout(t2)
    if (r2.ok) {
      const xml = await r2.text()
      const items = parsearRssXml(xml)
      if (items.length > 0 || xml.includes('<rss')) {
        return { items, ok: true }
      }
    }
  } catch {
    /* intenta mirror 3 */
  }

  // Mirror 3: corsproxy.io (XML directo de Google News)
  try {
    const c3 = new AbortController()
    const t3 = setTimeout(() => c3.abort(), 7500)
    const r3 = await fetch(`https://corsproxy.io/?url=${encoded}`, { signal: c3.signal })
    clearTimeout(t3)
    if (r3.ok) {
      const xml = await r3.text()
      const items = parsearRssXml(xml)
      if (items.length > 0 || xml.includes('<rss')) {
        return { items, ok: true }
      }
    }
  } catch {
    /* sin mirrors disponibles */
  }

  return { items: [], ok: false }
}

async function fetchGoogleNewsQuery(
  queryStr: string,
  alcance: 'regional' | 'nacional'
): Promise<{ items: CandidatoNoticiaRaw[]; ok: boolean }> {
  const hoy = hoyISO()
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(queryStr)}&hl=es-419&gl=CO&ceid=CO:es-419`

  const { items: rawItems, ok } = await obtenerItemsRssConRespaldo(rssUrl)
  if (!ok) return { items: [], ok: false }

  const items: CandidatoNoticiaRaw[] = []
  for (const item of rawItems) {
    const tituloRaw = String(item.title || '').trim()
    if (!tituloRaw) continue

    const partes = tituloRaw.split(' - ')
    const fuente =
      partes.length > 1 ? partes.pop()!.trim() : String(item.author || 'Prensa Colombia').trim()
    const titulo = partes.join(' - ').trim() || tituloRaw

    let fechaPub = ''
    if (item.pubDate) {
      const parsedDate = new Date(
        item.pubDate.includes('GMT') || item.pubDate.includes('Z') || item.pubDate.includes('+')
          ? item.pubDate
          : item.pubDate.replace(' ', 'T') + 'Z'
      )
      if (!Number.isNaN(parsedDate.getTime())) {
        fechaPub = isoLocal(parsedDate)
      }
    }
    // Candado estricto: solo noticias publicadas en los últimos 2 días
    if (!esFechaNoticiaReciente(fechaPub, hoy, 2)) continue

    const resumenRaw = String(item.description || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 240)

    items.push({
      titulo,
      fuente,
      link: String(item.link || '').trim(),
      fechaPub,
      resumenRaw,
      alcance,
    })
  }

  return { items, ok: true }
}

/**
 * Fuente web real de todo Colombia (1 sola consulta limpia + mirrors CORS de respaldo):
 * 1. Consulta Google News Colombia (`when:2d`) sobre derrumbes, inundaciones, damnificados,
 *    cierres viales y emergencias invernales en todo el país (sin saturar rate-limits).
 * 2. Pasa las candidatas en 1 sola llamada a Gemini IA como CURADOR OPERATIVO ESTRICTO.
 */
async function buscarNoticiasGoogleNewsRSS(
  eventosExistentes: EventoRadarLocal[]
): Promise<{
  eventos: EventoRadarLocal[]
  consultado: boolean
  candidatasEvaluadas: number
  descartadasIrrelevantes: number
}> {
  // 1 sola petición limpia cubriendo todo Colombia (evita 429 por solicitudes paralelas en rss2json)
  const queryUnificada =
    'Colombia (derrumbe OR deslizamiento OR inundaciones OR damnificados OR "cierre vial" OR "emergencia invernal" OR avalancha OR "vía bloqueada") when:2d'

  const resNac = await fetchGoogleNewsQuery(queryUnificada, 'nacional')

  if (!resNac.ok) {
    return { eventos: [], consultado: false, candidatasEvaluadas: 0, descartadasIrrelevantes: 0 }
  }

  // Pre-deduplicar candidatas por título/url contra las existentes
  const combinadas: CandidatoNoticiaRaw[] = []
  const yaVistas: EventoRadarLocal[] = [...eventosExistentes]
  for (const item of resNac.items.slice(0, 16)) {
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
  }

  if (combinadas.length === 0) {
    return { eventos: [], consultado: true, candidatasEvaluadas: 0, descartadasIrrelevantes: 0 }
  }

  // Sin Gemini disponible, no mostramos noticias sin curar para no meter basura irrelevante
  if (!geminiDisponible) {
    return {
      eventos: [],
      consultado: true,
      candidatasEvaluadas: combinadas.length,
      descartadasIrrelevantes: combinadas.length,
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
    }
  } catch (err) {
    console.warn('Error curando noticias de Google News con Gemini:', err)
    return {
      eventos: [],
      consultado: true,
      candidatasEvaluadas: combinadas.length,
      descartadasIrrelevantes: combinadas.length,
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

    if (!resPaso1 || !usoBusqueda) {
      // Respaldo web real (todo Colombia) vía Google News Colombia RSS (`when:2d`) + Curador Gemini IA
      const rss = await buscarNoticiasGoogleNewsRSS(eventosExistentes)
      if (rss.consultado) {
        const horaTxt = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
        return {
          eventos: rss.eventos,
          busquedaWebActiva: true,
          descartadasPorViejas: 0,
          diagnostico:
            rss.eventos.length > 0
              ? `🌐 Prensa nacional en vivo (${horaTxt}): ${rss.eventos.length} emergencia(s) relevante(s) aprobada(s) por Gema IA de ${rss.candidatasEvaluadas} revisadas (<48h).`
              : `🌐 Prensa nacional revisada (${horaTxt}): se evaluaron ${rss.candidatasEvaluadas} noticia(s) <48h en Colombia; ninguna requiere apoyo operativo de Bear's Reserve ahora.`,
        }
      }

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

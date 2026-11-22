import { normalizarTexto } from '@/ai/parser/nl'

const URL_PRIMARIA = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json'
const URL_ESPEJO = 'https://latest.currency-api.pages.dev/v1/currencies/usd.json'
const CLAVE_CACHE = 'cashmet_fx_v1'
const VIGENCIA_MS = 6 * 60 * 60 * 1000
const TIMEOUT_FX_MS = 5000

export interface Tasas {
  usd: Record<string, number>
  fecha?: string
  ts: number
}

let memoria: Tasas | null = null
let enVuelo: Promise<Tasas | null> | null = null

// Alias inequívocos para detección en texto libre (excluye palabras comunes
// del español cotidiano como "libra", "sol", "real" o "verdes").
const ALIAS_TEXTO: Record<string, string> = {
  usd: 'USD',
  dolar: 'USD',
  dolares: 'USD',
  'dolar americano': 'USD',
  'dolares americanos': 'USD',
  eur: 'EUR',
  euro: 'EUR',
  euros: 'EUR',
  gbp: 'GBP',
  'libra esterlina': 'GBP',
  'libras esterlinas': 'GBP',
  mxn: 'MXN',
  'peso mexicano': 'MXN',
  'pesos mexicanos': 'MXN',
  brl: 'BRL',
  'real brasileno': 'BRL',
  'reales brasilenos': 'BRL',
  pen: 'PEN',
  'sol peruano': 'PEN',
  'soles peruanos': 'PEN',
  ars: 'ARS',
  'peso argentino': 'ARS',
  'pesos argentinos': 'ARS',
  clp: 'CLP',
  'peso chileno': 'CLP',
  'pesos chilenos': 'CLP',
  cad: 'CAD',
  'dolar canadiense': 'CAD',
  'dolares canadienses': 'CAD',
  aud: 'AUD',
  'dolar australiano': 'AUD',
  'dolares australianos': 'AUD',
  jpy: 'JPY',
  yen: 'JPY',
  yenes: 'JPY',
  chf: 'CHF',
  'franco suizo': 'CHF',
  'francos suizos': 'CHF',
  cny: 'CNY',
  yuan: 'CNY',
  yuanes: 'CNY',
  uyu: 'UYU',
  'peso uruguayo': 'UYU',
  'pesos uruguayos': 'UYU',
  bob: 'BOB',
  boliviano: 'BOB',
  bolivianos: 'BOB',
  dkk: 'DKK',
  nok: 'NOK',
  sek: 'SEK',
}

// Alias adicionales válidos SOLO cuando el valor es explícitamente el campo moneda.
const ALIAS_EXACTO: Record<string, string> = {
  ...ALIAS_TEXTO,
  verdes: 'USD',
  libra: 'GBP',
  libras: 'GBP',
  real: 'BRL',
  reales: 'BRL',
  sol: 'PEN',
  soles: 'PEN',
}

const ALIAS_COMPILADOS: Array<{ re: RegExp; moneda: string }> = Object.keys(ALIAS_TEXTO)
  .sort((a, b) => b.length - a.length)
  .map((nombre) => ({
    re: new RegExp(`\\b${nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`),
    moneda: ALIAS_TEXTO[nombre],
  }))

const SIMBOLOS: Array<{ re: RegExp; moneda: string }> = [
  { re: /\bus\$\s*\d/, moneda: 'USD' },
  { re: /\$\s*\d[\d.,]*\s*(?:usd|dolares?|dolar)\b/, moneda: 'USD' },
  { re: /\d[\d.,]*\s*(?:usd|dolares?|dolar)\b/, moneda: 'USD' },
  { re: /€\s*\d|\d[\d.,]*\s*€|\d[\d.,]*\s*(?:eur|euros?)\b/, moneda: 'EUR' },
  { re: /£\s*\d|\d[\d.,]*\s*£|\d[\d.,]*\s*(?:gbp|libras?\s+esterlinas?)\b/, moneda: 'GBP' },
  { re: /\br\$\s*\d|\d[\d.,]*\s*(?:brl|reales?\s+brasilenos?)\b/, moneda: 'BRL' },
  { re: /\bs\/\s*\d|\d[\d.,]*\s*(?:pen|soles?\s+peruanos?)\b/, moneda: 'PEN' },
]

function aliasDeNombre(texto: string): string | undefined {
  for (const { re, moneda } of ALIAS_COMPILADOS) {
    if (re.test(texto)) return moneda
  }
  return undefined
}

export function normalizarMoneda(entrada: unknown): string | undefined {
  const s = String(entrada ?? '').trim()
  if (!s) return undefined
  const t = normalizarTexto(s)
  const porNombre = ALIAS_EXACTO[t] ?? aliasDeNombre(t)
  if (porNombre) return porNombre === 'COP' ? undefined : porNombre
  const porSimbolo = SIMBOLOS.find((x) => x.re.test(t))?.moneda
  if (porSimbolo) return porSimbolo
  if (/^[A-Za-z]{3}$/.test(s)) {
    const code = s.toUpperCase()
    return code === 'COP' ? undefined : code
  }
  return undefined
}

export function detectarMoneda(texto: string): string | undefined {
  const t = normalizarTexto(texto)
  const porNombre = aliasDeNombre(t)
  if (porNombre) return porNombre === 'COP' ? undefined : porNombre
  for (const { re, moneda } of SIMBOLOS) {
    if (re.test(t)) return moneda
  }
  return undefined
}

function leerLocal(): Tasas | null {
  try {
    const crudo = localStorage.getItem(CLAVE_CACHE)
    if (!crudo) return null
    const c = JSON.parse(crudo) as Tasas
    if (!c?.usd || typeof c.ts !== 'number' || typeof c.usd.cop !== 'number' || !(c.usd.cop > 0)) return null
    return c
  } catch {
    return null
  }
}

function guardar(t: Tasas) {
  memoria = t
  try {
    localStorage.setItem(CLAVE_CACHE, JSON.stringify(t))
  } catch {
    /* sin persistencia disponible */
  }
}

async function pedir(url: string): Promise<Tasas | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_FX_MS)
  try {
    const r = await fetch(url, { cache: 'no-cache', signal: ctrl.signal })
    if (!r.ok) return null
    const j = (await r.json()) as { date?: string; usd?: Record<string, number> }
    if (!j?.usd || typeof j.usd.cop !== 'number' || !Number.isFinite(j.usd.cop) || j.usd.cop <= 0) return null
    return { usd: j.usd, fecha: j.date, ts: Date.now() }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function obtenerTasas(): Promise<Tasas | null> {
  if (memoria && Date.now() - memoria.ts < VIGENCIA_MS) return memoria
  const local = leerLocal()
  if (local && Date.now() - local.ts < VIGENCIA_MS) {
    memoria = local
    return local
  }
  if (!enVuelo) {
    enVuelo = (async () => {
      const fresco = (await pedir(URL_PRIMARIA)) ?? (await pedir(URL_ESPEJO))
      if (fresco) {
        guardar(fresco)
        return fresco
      }
      return local ?? memoria
    })().finally(() => {
      enVuelo = null
    })
  }
  return enVuelo
}

export function tasaACOP(tasas: Tasas, moneda: string): number | null {
  const code = moneda.trim().toLowerCase()
  if (code === 'cop') return 1
  const cop = tasas.usd.cop
  if (!Number.isFinite(cop) || cop <= 0) return null
  const valor = tasas.usd[code]
  if (!Number.isFinite(valor) || valor <= 0) return null
  return cop / valor
}

export interface Conversion {
  montoCOP: number
  tasa: number
  moneda: string
  fecha?: string
}

export async function convertirACOP(monto: number, moneda: string): Promise<Conversion | null> {
  if (!Number.isFinite(monto) || monto < 0) return null
  const code = moneda.trim().toUpperCase()
  if (code === 'COP') return { montoCOP: Math.round(monto), tasa: 1, moneda: 'COP' }
  const tasas = await obtenerTasas()
  if (!tasas) return null
  const tasa = tasaACOP(tasas, code)
  if (!tasa) return null
  return { montoCOP: Math.round(monto * tasa), tasa, moneda: code, fecha: tasas.fecha }
}

export async function lineaTasasContexto(): Promise<string | null> {
  const tasas = await obtenerTasas()
  if (!tasas) return null
  const comunes = ['USD', 'EUR', 'GBP', 'MXN', 'BRL', 'PEN']
  const lineas = ['TASAS DE CAMBIO DEL DÍA (referencia, en pesos colombianos):']
  for (const m of comunes) {
    const tasa = tasaACOP(tasas, m)
    if (tasa) lineas.push(`- 1 ${m} = $${Math.round(tasa).toLocaleString('es-CO')}`)
  }
  if (lineas.length === 1) return null
  if (tasas.fecha) lineas.push(`(tasas de referencia del ${tasas.fecha})`)
  return lineas.join('\n')
}

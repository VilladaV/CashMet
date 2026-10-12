import { normalizarTexto } from '@/ai/parser/nl'

const URL_PRIMARIA = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json'
const URL_ESPEJO = 'https://latest.currency-api.pages.dev/v1/currencies/usd.json'
const CLAVE_CACHE = 'cashmet_fx_v1'
const VIGENCIA_MS = 6 * 60 * 60 * 1000

export interface Tasas {
  usd: Record<string, number>
  fecha?: string
  ts: number
}

let memoria: Tasas | null = null

const ALIAS: Record<string, string> = {
  usd: 'USD', dolar: 'USD', dolares: 'USD', 'dolar americano': 'USD', 'dolares americanos': 'USD', verdes: 'USD',
  eur: 'EUR', euro: 'EUR', euros: 'EUR',
  gbp: 'GBP', libra: 'GBP', libras: 'GBP', 'libra esterlina': 'GBP', 'libras esterlinas': 'GBP',
  mxn: 'MXN', 'peso mexicano': 'MXN', 'pesos mexicanos': 'MXN',
  brl: 'BRL', real: 'BRL', reales: 'BRL',
  pen: 'PEN', sol: 'PEN', soles: 'PEN', 'sol peruano': 'PEN', 'soles peruanos': 'PEN',
  ars: 'ARS', 'peso argentino': 'ARS', 'pesos argentinos': 'ARS',
  clp: 'CLP', 'peso chileno': 'CLP', 'pesos chilenos': 'CLP',
  cad: 'CAD', 'dolar canadiense': 'CAD', 'dolares canadienses': 'CAD',
  aud: 'AUD', 'dolar australiano': 'AUD', 'dolares australianos': 'AUD',
  jpy: 'JPY', yen: 'JPY', yenes: 'JPY',
  chf: 'CHF', 'franco suizo': 'CHF', 'francos suizos': 'CHF',
  cny: 'CNY', yuan: 'CNY', yuanes: 'CNY',
  uyu: 'UYU', 'peso uruguayo': 'UYU', 'pesos uruguayos': 'UYU',
  bob: 'BOB', boliviano: 'BOB', bolivianos: 'BOB',
  dkk: 'DKK', nok: 'NOK', sek: 'SEK',
}

const SIMBOLOS: Array<{ re: RegExp; moneda: string }> = [
  { re: /\bus\$\s*\d/, moneda: 'USD' },
  { re: /\$\s*\d+\s*(usd|dolares?|d[oó]lar(es)?)\b/, moneda: 'USD' },
  { re: /\d+\s*(usd|dolares?|d[oó]lar(es)?)\b/, moneda: 'USD' },
  { re: /[€]\s*\d|\d+\s*(eur|euros?)\b/, moneda: 'EUR' },
  { re: /[£]\s*\d|\d+\s*(gbp|libras?)\b/, moneda: 'GBP' },
]

function aliasDeNombre(texto: string): string | undefined {
  for (const nombre of Object.keys(ALIAS).sort((a, b) => b.length - a.length)) {
    if (new RegExp(`\\b${nombre}\\b`).test(texto)) return ALIAS[nombre]
  }
  return undefined
}

export function normalizarMoneda(entrada: unknown): string | undefined {
  const s = String(entrada ?? '').trim()
  if (!s) return undefined
  const t = normalizarTexto(s)
  const porNombre = ALIAS[t] ?? aliasDeNombre(t)
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
    if (!c?.usd || typeof c.ts !== 'number' || typeof c.usd.cop !== 'number') return null
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
  try {
    const r = await fetch(url, { cache: 'no-cache' })
    if (!r.ok) return null
    const j = (await r.json()) as { date?: string; usd?: Record<string, number> }
    if (!j?.usd || typeof j.usd.cop !== 'number') return null
    return { usd: j.usd, fecha: j.date, ts: Date.now() }
  } catch {
    return null
  }
}

export async function obtenerTasas(): Promise<Tasas | null> {
  if (memoria && Date.now() - memoria.ts < VIGENCIA_MS) return memoria
  const local = leerLocal()
  if (local && Date.now() - local.ts < VIGENCIA_MS) {
    memoria = local
    return local
  }
  const fresco = (await pedir(URL_PRIMARIA)) ?? (await pedir(URL_ESPEJO))
  if (fresco) {
    guardar(fresco)
    return fresco
  }
  return local ?? memoria
}

export function tasaACOP(tasas: Tasas, moneda: string): number | null {
  const code = moneda.trim().toLowerCase()
  if (code === 'cop') return 1
  const valor = tasas.usd[code]
  if (!valor || valor <= 0) return null
  return tasas.usd.cop / valor
}

export interface Conversion {
  montoCOP: number
  tasa: number
  moneda: string
  fecha?: string
}

export async function convertirACOP(monto: number, moneda: string): Promise<Conversion | null> {
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

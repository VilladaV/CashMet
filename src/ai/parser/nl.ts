import { fechaExiste } from '../../lib/fechas'

export interface BorradorMovimiento {
  tipo: 'gasto' | 'ingreso'
  fecha: string
  concepto: string
  monto: number
  categoria: string
  moneda?: string
  montoOriginal?: number
  tasaCambio?: number
}

export function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function isoFecha(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function sumarDias(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10,
  noviembre: 11, diciembre: 12,
}

function normalizarMonto(numStr: string, sufijo?: string): number | null {
  let s = numStr.trim()
  const hasDot = s.includes('.')
  const hasComma = s.includes(',')
  if (hasDot && hasComma) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (hasDot) {
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
  } else if (hasComma) {
    if (/^\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, '')
    else s = s.replace(',', '.')
  }
  let n = parseFloat(s)
  if (!Number.isFinite(n)) return null
  if (sufijo) {
    const sfx = sufijo.toLowerCase()
    if (sfx.startsWith('millon') || sfx === 'mm' || sfx === 'm') n *= 1_000_000
    else if (sfx.startsWith('k') || sfx === 'mil') n *= 1000
  }
  return Math.round(n)
}

function quitarNoMontos(texto: string): string {
  return texto
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
    .replace(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, ' ')
    .replace(/\b\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+de(?:l)?\s+\d{4})?\b/g, ' ')
    .replace(/\b(?:modelo|ano)\s+(?:19|20)\d{2}\b/g, ' ')
    .replace(/\b\d{2,4}\s*(?:cc|cil)\b/g, ' ')
}

export function parseMontoCO(texto: string): number | null {
  const t = quitarNoMontos(normalizarTexto(texto))
  const patrones: RegExp[] = [
    /(?:us\$|r\$|s\/|[$€£])\s*([\d][\d.,]*)(?:\s*(millones?|mm|mil|k|m)\b)?/,
    /\b([\d][\d.,]*)(?:\s*(millones?|mm|mil|k|m)\b)?\s*(?:[€£]|(?:usd|eur|gbp|mxn|brl|pen|ars|clp|cad|aud|chf|jpy|cny|dolares?|dolar|euros?|libras?\s+esterlinas?|soles?\s+peruanos?|reales?\s+brasilenos?|pesos?)\b)/,
    /\b([\d][\d.,]*)\s*(millones?|mm|mil|k|m)\b/,
    /\b([\d][\d.,]{2,})\b(?!\s*(?:kg|g|gr|km|mts|metros|cm|litros?|galones?|cc|cil|horas?|minutos?|dias?)\b)/,
    /\b(\d{3,})\b(?!\s*(?:kg|g|gr|km|mts|metros|cm|litros?|galones?|cc|cil|horas?|minutos?|dias?)\b)/,
  ]
  for (const re of patrones) {
    const m = t.match(re)
    if (m) {
      const n = normalizarMonto(m[1], m[2])
      if (n && n > 0) return n
    }
  }
  return null
}

export function parseFecha(texto: string): string {
  const t = normalizarTexto(texto)
  const hoy = new Date()
  if (/\banteayer\b/.test(t)) return isoFecha(sumarDias(hoy, -2))
  if (/\bayer\b/.test(t)) return isoFecha(sumarDias(hoy, -1))
  if (/\bmanana\b/.test(t)) return isoFecha(sumarDias(hoy, 1))
  if (/\bhoy\b/.test(t)) return isoFecha(hoy)

  // Fecha ISO explícita (YYYY-MM-DD); se valida que el día exista.
  const iso = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (iso) {
    const anio = parseInt(iso[1], 10)
    const mes = parseInt(iso[2], 10)
    const dia = parseInt(iso[3], 10)
    if (fechaExiste(anio, mes, dia)) return `${iso[1]}-${iso[2]}-${iso[3]}`
  }

  const m1 = t.match(/\b(\d{1,2})\s+de\s+([a-z]+)(?:\s+de(?:l)?\s+(\d{4}))?/)
  if (m1) {
    const dia = parseInt(m1[1], 10)
    const mes = MESES[m1[2]]
    const anio = m1[3] ? parseInt(m1[3], 10) : hoy.getFullYear()
    if (mes && fechaExiste(anio, mes, dia)) {
      return isoFecha(new Date(anio, mes - 1, dia))
    }
  }

  // DD/MM/YYYY o DD-MM-YYYY con año explícito
  const m2ConAnio = t.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/)
  if (m2ConAnio) {
    const dia = parseInt(m2ConAnio[1], 10)
    const mes = parseInt(m2ConAnio[2], 10)
    let anio = parseInt(m2ConAnio[3], 10)
    if (anio < 100) anio += 2000
    if (fechaExiste(anio, mes, dia)) {
      return isoFecha(new Date(anio, mes - 1, dia))
    }
  }

  // DD/MM sin año solo si viene con contexto explícito de fecha o es toda la cadena
  // (evita falsos positivos con fracciones como 1/2, 24/7, 3/12).
  const m2SinAnio = t.match(/(?:^|\b(?:el|del|dia|fecha|para el|hasta el)\s+)(\d{1,2})[/-](\d{1,2})\b/)
  if (m2SinAnio) {
    const dia = parseInt(m2SinAnio[1], 10)
    const mes = parseInt(m2SinAnio[2], 10)
    const anio = hoy.getFullYear()
    if (!(dia === 24 && mes === 7) && fechaExiste(anio, mes, dia)) {
      return isoFecha(new Date(anio, mes - 1, dia))
    }
  }
  return isoFecha(hoy)
}

export function parseTipo(texto: string): 'gasto' | 'ingreso' {
  const t = normalizarTexto(texto)
  if (
    /\b(pague|pagar|gaste|gastar|compre|comprar)\b/.test(t) &&
    !/\b(me pagaron|me consignaron|me depositaron|me abonaron|me regalaron|me dieron)\b/.test(t)
  ) {
    return 'gasto'
  }
  const ingreso =
    /\b(ingres\w*|recibi\w*|recibimos|reciben|recibir\w*|me pagaron|me consignaron|consignaron|abono|abonaron|vendi|venta|salario|nomina|honorarios|entraron|entro|depositaron|devolucion|me regalaron|me regalo|regalaron|me invitaron|invitaron|gane|premio|bono|loteria|me dieron)\b/
  return ingreso.test(t) ? 'ingreso' : 'gasto'
}

const CATEGORIAS: Array<{ re: RegExp; cat: string }> = [
  { re: /\b(supermercado|mercado|exito|carulla|jumbo|d1|ara|olimpica|compras)\b/, cat: 'Mercado' },
  { re: /\b(gasolina|combustible|tanque|diesel|acpm)\b/, cat: 'Combustible' },
  { re: /\b(restaurante|almuerzo|comida|cena|desayuno|domicilio|rappi|ifood)\b/, cat: 'Alimentación' },
  { re: /\b(arriendo|alquiler|administracion)\b/, cat: 'Arriendo' },
  { re: /\b(luz|agua|gas|internet|telefono|celular|energia|epm|claro|movistar|tigo)\b/, cat: 'Servicios' },
  { re: /\b(soat)\b/, cat: 'SOAT' },
  { re: /\b(tecnicomecanica|tecno)\b/, cat: 'Tecnicomecánica' },
  { re: /\b(predial|impuesto)\b/, cat: 'Impuestos' },
  { re: /\b(salud|medicina|medicamento|drogueria|eps|farmacia)\b/, cat: 'Salud' },
  { re: /\b(uber|taxi|bus|transporte|metro|pasaje|peaje)\b/, cat: 'Transporte' },
  { re: /\b(salario|nomina|sueldo)\b/, cat: 'Salario' },
  { re: /\b(banco|cuota|credito|tarjeta|deuda|prestamo)\b/, cat: 'Deudas' },
  { re: /\b(parqueadero|lavadero|soat|mantenimiento|llanta|aceite)\b/, cat: 'Vehículo' },
]

export function parseCategoria(texto: string, tipo: 'gasto' | 'ingreso'): string {
  const t = normalizarTexto(texto)
  for (const { re, cat } of CATEGORIAS) {
    if (re.test(t)) return cat
  }
  return tipo === 'ingreso' ? 'Ingreso' : 'Otros'
}

export function limpiarConcepto(texto: string): string {
  let s = texto.trim()
  s = s.replace(/(?:us\$|r\$|s\/|[$€£])\s*[\d.,]+(?:\s*(?:millones?|mm|mil|k|m)\b)?/gi, ' ')
  s = s.replace(/\b\d[\d.,]*\s*(?:millones?|mm|mil|k|m)\b/gi, ' ')
  s = s.replace(/\b\d{1,3}(?:[.,]\d{3})+\b/g, ' ')
  s = s.replace(/\b\d[\d.,]*\s*(?:[€£]|usd|eur|gbp|mxn|brl|pen|dolares?|dólares?|dolar|dólar|euros?|pesos?|cop)\b/gi, ' ')
  s = s.replace(/(?<![a-zA-ZáéíóúñüÁÉÍÓÚÑÜ])(registra|registrar|anota|anotar|agrega|agregar|añade|añadir|guardar|guarda)(?![a-zA-ZáéíóúñüÁÉÍÓÚÑÜ])/gi, ' ')
  s = s.replace(/(?<![a-zA-ZáéíóúñüÁÉÍÓÚÑÜ])(compre|compré|pague|pagué|gaste|gasté|recibi|recibí|vendi|vendí|me regalaron|me dieron|me pagaron|me consignaron)(?![a-zA-ZáéíóúñüÁÉÍÓÚÑÜ])/gi, ' ')
  s = s.replace(/(?<![a-zA-ZáéíóúñüÁÉÍÓÚÑÜ])(hoy|ayer|anteayer|manana|mañana)(?![a-zA-ZáéíóúñüÁÉÍÓÚÑÜ])/gi, ' ')
  s = s.replace(/\b(por|en|de|con|para)\s*$/i, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  // Quita preposiciones y artículos iniciales que quedan tras eliminar el
  // monto o el verbo ("registra $25.000 de almuerzo" → "almuerzo").
  let anterior = ''
  while (anterior !== s) {
    anterior = s
    s = s.replace(/^(de|del|por|en|con|para|el|la|los|las|un|una|unos|unas)\s+/i, '')
  }
  s = s.replace(/^[,.:;\-\s]+|[,.:;\-\s]+$/g, '').trim()
  if (!s) return 'Movimiento'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

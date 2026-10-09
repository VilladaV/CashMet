export interface BorradorMovimiento {
  tipo: 'gasto' | 'ingreso'
  fecha: string
  concepto: string
  monto: number
  categoria: string
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
  if (Number.isNaN(n)) return null
  if (sufijo) {
    const sfx = sufijo.toLowerCase()
    if (sfx.startsWith('k') || sfx.startsWith('mil')) n *= 1000
    else if (sfx.startsWith('m')) n *= 1_000_000
  }
  return Math.round(n)
}

export function parseMontoCO(texto: string): number | null {
  const t = normalizarTexto(texto)
  const patrones: RegExp[] = [
    /\$\s*([\d][\d.,]*)\s*(k|m|mm|millones?|mil)?/,
    /([\d][\d.,]{2,})\s*(k|m|mm|millones?|mil)?/,
    /(\d+)\s*(k|m|mm|millones?|mil)\b/,
    /(\d{3,})\b/,
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

  const m1 = t.match(/\b(\d{1,2})\s+de\s+([a-z]+)/)
  if (m1) {
    const dia = parseInt(m1[1], 10)
    const mes = MESES[m1[2]]
    if (mes && dia >= 1 && dia <= 31) {
      return isoFecha(new Date(hoy.getFullYear(), mes - 1, dia))
    }
  }

  const m2 = t.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/)
  if (m2) {
    const dia = parseInt(m2[1], 10)
    const mes = parseInt(m2[2], 10)
    let anio = m2[3] ? parseInt(m2[3], 10) : hoy.getFullYear()
    if (anio < 100) anio += 2000
    if (mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31) {
      return isoFecha(new Date(anio, mes - 1, dia))
    }
  }
  return isoFecha(hoy)
}

export function parseTipo(texto: string): 'gasto' | 'ingreso' {
  const t = normalizarTexto(texto)
  const ingreso =
    /\b(ingres|recib|me pagaron|me consignaron|consignaron|abono|abonaron|vendi|venta|salario|nomina|honorarios|entraron|entro|depositaron|devolucion)\b/
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
  s = s.replace(/\$\s*[\d.,]+\s*(k|m|mm|millones?|mil)?/gi, ' ')
  s = s.replace(/\b(registra|registrar|anota|anotar|agrega|agregar|añade|añadir|guardar|guarda)\b/gi, ' ')
  s = s.replace(/\b(hoy|ayer|anteayer|manana)\b/gi, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  s = s.replace(/^[,.:;\-\s]+|[,.:;\-\s]+$/g, '').trim()
  if (!s) return 'Movimiento'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

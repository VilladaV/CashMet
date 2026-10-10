import {
  limpiarConcepto,
  normalizarTexto,
  parseCategoria,
  parseFecha,
  parseMontoCO,
  parseTipo,
  type BorradorMovimiento,
} from '@/ai/parser/nl'

export interface Interpretacion {
  respuesta: string
  acciones: string[]
  borrador?: BorradorMovimiento
  params?: Record<string, unknown>
}

const AYUDA =
  'Puedo: registrar gastos/ingresos ("gasté 50.000 en mercado", "me pagaron 2.500.000"), ' +
  'consultar saldos ("¿cuánto tengo?"), listar movimientos ("muéstrame los últimos movimientos"), ' +
  'registrar pagos de deudas ("pagué 450.000 de cuota del crédito"), ' +
  'registrar vehículos ("agrega vehículo Mazda 3 2019 placa ABC123"), ' +
  'estimar SOAT/seguros ("investiga SOAT Mazda 3 2019 1500cc"), ' +
  'generar el calendario de vencimientos ("genera el calendario") y ' +
  'ver el resumen del mes ("resumen de este mes").'

const MESES: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
}

const STOP = new Set([
  'vehiculo', 'moto', 'camion', 'carro', 'soat', 'seguro', 'tecnomecanica',
  'tecnico', 'placa', 'modelo', 'linea', 'marca', 'con', 'de', 'un', 'una',
  'del', 'la', 'el', 'los', 'las', 'para', 'y', 'en', 'cc', 'cil', 'cilindraje', 'nuevo', 'nueva',
])

function extraerPlaca(texto: string): string | undefined {
  const m = texto.match(/\b([A-Za-z]{3}\d{2,3})\b/)
  return m ? m[1].toUpperCase() : undefined
}

function extraerModelo(texto: string): number | undefined {
  const m = texto.match(/\b(19|20)\d{2}\b/)
  return m ? Number(m[0]) : undefined
}

function extraerCilindraje(texto: string): number | undefined {
  const m = texto.match(/\b(\d{3,4})\s*(cc|cil)\b/i)
  return m ? Number(m[1]) : undefined
}

function extraerMarcaLinea(texto: string): { marca: string; linea: string } {
  const kws = ['vehiculo', 'moto', 'camion', 'carro', 'soat', 'marca']
  let start = -1
  let kwLen = 0
  for (const kw of kws) {
    const i = texto.toLowerCase().indexOf(kw)
    if (i >= 0 && (start === -1 || i < start)) {
      start = i
      kwLen = kw.length
    }
  }
  const tokens = texto
    .slice(start >= 0 ? start + kwLen : 0)
    .split(/[^a-zA-Záéíóúñü0-9]+/)
    .filter(Boolean)
  const palabras: string[] = []
  for (const tok of tokens) {
    const low = tok.toLowerCase()
    if (STOP.has(low)) continue
    if (/^(19|20)\d{2}$/.test(tok)) break
    if (/^\d+$/.test(tok)) continue
    if (/^[A-Za-z]{3}\d{2,3}$/.test(tok)) break
    palabras.push(low)
    if (palabras.length >= 2) break
  }
  return { marca: palabras[0] || '', linea: palabras[1] || palabras[0] || '' }
}

function mesParam(texto: string): string | undefined {
  const t = normalizarTexto(texto)
  for (const nombre of Object.keys(MESES)) {
    if (t.includes(nombre)) {
      const anyo = extraerModelo(texto) ?? new Date().getFullYear()
      return `${anyo}-${String(MESES[nombre]).padStart(2, '0')}`
    }
  }
  const hoy = new Date()
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
}

export function estimadosVehiculoCO(params: { modelo?: number; cilindraje?: number }) {
  const cil = params.cilindraje ?? 1400
  const modelo = params.modelo ?? new Date().getFullYear()
  const edad = Math.max(0, new Date().getFullYear() - modelo)
  const factorCil = Math.min(2.5, 1 + cil / 2500)
  const factorEdad = Math.max(0.6, 1 - edad * 0.03)
  const soat = Math.round(250000 * factorCil * factorEdad)
  const tm = Math.round(120000 + edad * 8000)
  const str = Math.round(soat * 2.2)
  return {
    soatAnualEstimadoCOP: soat,
    soatRango: { min: Math.round(soat * 0.85), max: Math.round(soat * 1.15) },
    tecnicomecanicaCostoEstimadoCOP: tm,
    seguroTodoRiesgoAnualEstimadoCOP: str,
    rangoSTR: { min: Math.round(str * 0.8), max: Math.round(str * 1.2) },
    nivelConfianza: 'medio',
    fuente: 'Estimativo IA Colombia (referencial). Requiere verificación real.',
    justificacion: `Basado en modelo ${modelo}, cilindraje aprox ${cil} cc, edad ${edad} años.`,
  }
}

export function interpretarMensaje(mensaje: string): Interpretacion {
  const t = normalizarTexto(mensaje)

  if (/genera\s+(el\s+)?(calendario|eventos|vencimientos)|generar\s+(el\s+)?calendario/.test(t)) {
    return { respuesta: 'Generando el calendario de vencimientos...', acciones: ['generar_calendario'] }
  }

  const esResumen =
    /\bresumen\b/.test(t) ||
    (/\b(gast[eé]|gastos?|ingresos?)\b/.test(t) && /\b(mes|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/.test(t))
  if (esResumen) {
    return { respuesta: 'Calculando el resumen...', acciones: ['resumen_mes'], params: { mes: mesParam(mensaje) } }
  }

  const monto = parseMontoCO(mensaje)

  if (
    monto &&
    monto > 0 &&
    /(pag(ue|o|a)|abon(a|e|o))/.test(t) &&
    /(cuota|deuda|credito|prestamo|tarjeta|hipoteca)/.test(t)
  ) {
    const nombre = mensaje.match(
      /(?:cuota|deuda|cr[eé]dito|pr[eé]stamo|tarjeta|hipoteca)\s*(?:de\s+|del\s+)?([a-záéíóúñü ]{2,30})/i
    )
    return {
      respuesta: 'Registrando el pago de la deuda...',
      acciones: ['pago_deuda'],
      params: {
        monto,
        fecha: parseFecha(mensaje),
        deudaNombre: nombre ? nombre[1].trim().replace(/\s+\d.*$/, '').trim() : undefined,
      },
    }
  }

  if (/(investiga|investigar|calcular|estima)/.test(t) && /(soat|seguro|tecnomecanica|tecnico|vehiculo|moto)/.test(t)) {
    const modelo = extraerModelo(mensaje)
    const { marca, linea } = extraerMarcaLinea(mensaje)
    if (marca) {
      return {
        respuesta: 'Calculando estimados para Colombia...',
        acciones: ['investigar_vehiculo'],
        params: { marca, linea, modelo, cilindraje: extraerCilindraje(mensaje) },
      }
    }
  }

  if (/(agrega|registra|anade|crea|nuevo)/.test(t) && /(vehiculo|moto|camion|carro)/.test(t)) {
    const { marca, linea } = extraerMarcaLinea(mensaje)
    if (marca) {
      const tipo = t.includes('moto') ? 'moto' : t.includes('camion') ? 'camion' : 'carro'
      return {
        respuesta: 'Registrando el vehículo...',
        acciones: ['crear_vehiculo'],
        params: {
          placa: extraerPlaca(mensaje),
          marca,
          linea,
          modelo: extraerModelo(mensaje) ?? new Date().getFullYear(),
          tipo,
          cilindraje: extraerCilindraje(mensaje),
        },
      }
    }
  }

  if (/\b(saldo|saldos|cuanto tengo|cuanto hay|balance)\b/.test(t)) {
    return { respuesta: 'Consultando saldos...', acciones: ['consulta_saldos'] }
  }

  if (
    /\b(buscar|busca|listar|lista|mostrar|muestra|ultimos|historial|recientes)\b/.test(t) &&
    /\b(movimiento|movimientos|gasto|gastos|ingreso|ingresos)\b/.test(t)
  ) {
    return { respuesta: 'Buscando movimientos recientes...', acciones: ['busqueda_movimientos'] }
  }

  if (monto && monto > 0) {
    const tipo = parseTipo(mensaje)
    const borrador: BorradorMovimiento = {
      tipo,
      fecha: parseFecha(mensaje),
      concepto: limpiarConcepto(mensaje),
      monto,
      categoria: parseCategoria(mensaje, tipo),
    }
    return {
      respuesta: 'Detecté un movimiento. Revisa los datos y confirma para guardarlo:',
      acciones: ['requiere_confirmacion'],
      borrador,
    }
  }

  return { respuesta: AYUDA, acciones: [] }
}
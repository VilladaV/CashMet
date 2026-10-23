import {
  limpiarConcepto,
  normalizarTexto,
  parseCategoria,
  parseFecha,
  parseMontoCO,
  parseTipo,
  type BorradorMovimiento,
} from '@/ai/parser/nl'
import { detectarMoneda } from '@/lib/fx'

export interface AccionInterpretada {
  nombre: string
  borrador?: BorradorMovimiento
  params?: Record<string, unknown>
}

export interface Interpretacion {
  respuesta: string
  acciones: string[]
  borrador?: BorradorMovimiento
  params?: Record<string, unknown>
  lote?: AccionInterpretada[]
}

export const NOMBRE_IA = 'Lucía'

const AYUDA =
  '¡Hola! Soy Lucía, tu contadora. Puedo registrar gastos e ingresos ("gasté 50.000 en mercado", "me regalaron 70.000"), ' +
  'varios en un mismo mensaje ("compré un almuerzo por 25.000 y pagué 30.000 de taxi"), consultar saldos ("¿cuánto tengo?"), ' +
  'listar movimientos, registrar pagos de deudas, pagar nómina, crear gastos recurrentes y eventos, ' +
  'convertir otras monedas a pesos con la tasa del día ("me pagaron 3.000 dólares", "gasté 50 euros"), ' +
  'registrar vehículos, estimar SOAT/tecnicomecánica/seguros en Colombia, generar el calendario de vencimientos y ' +
  'registrar mantenimientos con su costo ("cambié el aceite por 180.000", "pagué 250.000 de frenos"), ' +
  'darte el resumen del mes. Cuéntame con confianza cómo te fue con la plata. 💛'

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

function isoDe(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fechaDeDia(dia: number): string {
  const hoy = new Date()
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), dia)
  if (base.getTime() < new Date(hoy.toDateString()).getTime()) base.setMonth(base.getMonth() + 1)
  return isoDe(base)
}

function extraerDiaVencimiento(texto: string): number | undefined {
  const m = normalizarTexto(texto).match(/\bvence\s+(?:el\s+)?(\d{1,2})\b/)
  if (!m) return undefined
  const d = parseInt(m[1], 10)
  return d >= 1 && d <= 31 ? d : undefined
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

  const diaVenc = extraerDiaVencimiento(mensaje)
  if (diaVenc || /\b(agenda|agendame|recuerdame|recordarme|recordatorio|evento|cita|reunion)\b/.test(t)) {
    const limpio = mensaje
      .replace(/\bvence\s+(el\s+)?\d{1,2}\b/gi, '')
      .replace(/\b(agenda|agéndame|agendame|recuérdame|recuerdame|recordarme|recordatorio|evento|cita|reunión|reunion)\b/gi, '')
    return {
      respuesta: 'Preparando el evento...',
      acciones: ['crear_evento'],
      params: {
        titulo: limpiarConcepto(limpio) || 'Evento',
        fecha: diaVenc ? fechaDeDia(diaVenc) : parseFecha(mensaje),
      },
    }
  }

  const monto = parseMontoCO(mensaje)
  const moneda = detectarMoneda(mensaje)

  if (
    monto &&
    monto > 0 &&
    /\b(pague|pago|pagar|abone|abonar)\b/.test(t) &&
    /\b(sueldo|nomina|salario)\b/.test(t)
  ) {
    const nm = mensaje.match(/\b(?:a|para)\s+([A-Za-zÁÉÍÓÚáéíóúÑñ]+(?:\s+[A-Za-zÁÉÍÓÚáéíóúÑñ]+){1,3})/i)
    return {
      respuesta: 'Registrando pago de nómina...',
      acciones: ['pago_nomina'],
      params: { monto, fecha: parseFecha(mensaje), nombre: nm ? nm[1].trim() : undefined, moneda },
    }
  }

  if (
    monto &&
    monto > 0 &&
    parseTipo(mensaje) === 'gasto' &&
    /\b(recurrente|mensual|mensualmente|fijo|fija|cada mes|todos los meses)\b/.test(t)
  ) {
    return {
      respuesta: 'Preparando gasto recurrente...',
      acciones: ['crear_recurrente'],
      params: {
        concepto: limpiarConcepto(mensaje),
        monto,
        categoria: parseCategoria(mensaje, 'gasto'),
        periodicidad: 'mensual',
        diaVencimiento: extraerDiaVencimiento(mensaje),
        moneda,
      },
    }
  }

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
        moneda,
      },
    }
  }

  if (monto && monto > 0 && /(mantenimiento|aceite|frenos?|llantas?|bateria|revision|reparacion|taller|alineacion|balanceo|correa|pastillas)/.test(t)) {
    const { marca, linea } = extraerMarcaLinea(mensaje)
    return {
      respuesta: 'Registrando el mantenimiento...',
      acciones: ['registrar_mantenimiento'],
      params: {
        monto,
        fecha: parseFecha(mensaje),
        placa: extraerPlaca(mensaje),
        marca: marca || undefined,
        linea: linea || undefined,
        concepto: limpiarConcepto(mensaje),
        moneda,
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
      moneda,
    }
    return {
      respuesta: 'Listo, mira cómo te quedó y confírmalo si está bien 👇',
      acciones: ['requiere_confirmacion'],
      borrador,
    }
  }

  return { respuesta: AYUDA, acciones: [] }
}

const CONECTORES_LOTE = /\s+y\s+|\s*[,;]\s*|\s+luego\s+|\s+despues\s+|\s+tambien\s+|\s+ademas\s+/i

export function interpretarLote(mensaje: string): Interpretacion | null {
  const segmentos = mensaje
    .split(CONECTORES_LOTE)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && /\d/.test(s))
  if (segmentos.length < 2) return null

  const lote: AccionInterpretada[] = []
  for (const seg of segmentos) {
    const r = interpretarMensaje(seg)
    if (r.acciones.includes('requiere_confirmacion') && r.borrador && r.borrador.monto >= 1000) {
      lote.push({ nombre: 'requiere_confirmacion', borrador: r.borrador })
    }
  }
  if (lote.length < 2) return null

  const totalGastos = lote
    .filter((a) => a.borrador?.tipo === 'gasto')
    .reduce((s, a) => s + (a.borrador?.monto || 0), 0)
  const totalIngresos = lote
    .filter((a) => a.borrador?.tipo === 'ingreso')
    .reduce((s, a) => s + (a.borrador?.monto || 0), 0)

  const resumen = [
    totalGastos > 0 ? `gastos por $${totalGastos.toLocaleString('es-CO')}` : '',
    totalIngresos > 0 ? `ingresos por $${totalIngresos.toLocaleString('es-CO')}` : '',
  ]
    .filter(Boolean)
    .join(' y ')

  return {
    respuesta: `Detecté ${lote.length} movimientos en tu mensaje${
      resumen ? ` (${resumen})` : ''
    }. Revísalos y confírmalos uno por uno 👇`,
    acciones: lote.map((a) => a.nombre),
    lote,
  }
}
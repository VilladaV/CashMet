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
}

const AYUDA =
  'Puedo: registrar gastos/ingresos ("gasté 50.000 en mercado"), consultar saldos ("¿cuánto tengo?") ' +
  'y listar movimientos ("muéstrame los últimos movimientos").'

export function interpretarMensaje(mensaje: string): Interpretacion {
  const t = normalizarTexto(mensaje)

  if (/\b(saldo|saldos|cuanto tengo|cuanto hay|balance)\b/.test(t)) {
    return { respuesta: 'Consultando saldos...', acciones: ['consulta_saldos'] }
  }

  if (
    /\b(buscar|busca|listar|lista|mostrar|muestra|ultimos|historial|recientes)\b/.test(t) &&
    /\b(movimiento|movimientos|gasto|gastos|ingreso|ingresos)\b/.test(t)
  ) {
    return { respuesta: 'Buscando movimientos recientes...', acciones: ['busqueda_movimientos'] }
  }

  const monto = parseMontoCO(mensaje)
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

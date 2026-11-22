import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formatea un valor numérico o string en tiempo real colocando comas cada 3 dígitos enteros.
 * Si recibe un número o string con parte decimal explícita (ej. 1500.5), redondea a entero
 * en lugar de concatenar decimales como dígitos enteros.
 */
export function formatearCifra(valor: string | number | undefined | null): string {
  if (valor === undefined || valor === null) return ''
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) return ''
    const entero = Math.round(valor)
    const esNegativo = entero < 0
    const conComas = String(Math.abs(entero)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    return esNegativo ? `-${conComas}` : conComas
  }
  const str = String(valor).trim()
  if (!str) return ''
  if (/^-?\d+\.\d{1,2}$/.test(str)) {
    const n = Math.round(Number(str))
    if (!Number.isFinite(n)) return ''
    const esNegativo = n < 0
    const conComas = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    return esNegativo ? `-${conComas}` : conComas
  }
  const esNegativo = str.startsWith('-')
  const soloDigitos = str.replace(/\D/g, '')
  if (!soloDigitos) return esNegativo ? '-' : ''
  const normalizado = soloDigitos.replace(/^0+(?=\d)/, '')
  const conComas = normalizado.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return esNegativo ? `-${conComas}` : conComas
}

/**
 * Convierte un string formateado con comas o puntos de miles/decimales a número puro,
 * preservando el signo negativo si existe.
 */
export function desformatearCifra(valor: string | number | undefined | null): number {
  if (valor === undefined || valor === null) return 0
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0
  const crudo = String(valor).trim()
  if (!crudo) return 0
  const esNegativo = crudo.startsWith('-')
  let s = crudo.replace(/[^\d.,]/g, '')
  if (!s) return 0

  const tienePunto = s.includes('.')
  const tieneComa = s.includes(',')

  if (tienePunto && tieneComa) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.')
    } else {
      s = s.replace(/,/g, '')
    }
  } else if (tienePunto) {
    if (/^\d{1,3}(\.\d{3})+$/.test(s) || (s.match(/\./g)?.length ?? 0) > 1) {
      s = s.replace(/\./g, '')
    }
  } else if (tieneComa) {
    if (/^\d{1,3}(,\d{3})+$/.test(s) || (s.match(/,/g)?.length ?? 0) > 1) {
      s = s.replace(/,/g, '')
    } else if (/^\d+,\d{1,2}$/.test(s)) {
      s = s.replace(',', '.')
    } else {
      s = s.replace(/,/g, '')
    }
  }

  const n = Number(esNegativo ? `-${s}` : s)
  return Number.isFinite(n) ? n : 0
}

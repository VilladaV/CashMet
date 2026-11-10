import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formatea un valor numérico o string en tiempo real colocando comas cada 3 dígitos enteros.
 * Elimina cualquier caracter no numérico (excepto un signo '-' inicial).
 */
export function formatearCifra(valor: string | number | undefined | null): string {
  if (valor === undefined || valor === null) return ''
  const str = String(valor).trim()
  if (!str) return ''
  const esNegativo = str.startsWith('-')
  const soloDigitos = str.replace(/\D/g, '')
  if (!soloDigitos) return esNegativo ? '-' : ''
  const normalizado = soloDigitos.replace(/^0+(?=\d)/, '')
  const conComas = normalizado.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return esNegativo ? `-${conComas}` : conComas
}

/**
 * Convierte un string formateado con comas o puntos a número puro.
 */
export function desformatearCifra(valor: string | number | undefined | null): number {
  if (valor === undefined || valor === null) return 0
  const n = Number(String(valor).replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}


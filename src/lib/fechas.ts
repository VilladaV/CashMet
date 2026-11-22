export function isoLocal(d: Date): string {
  const y = String(d.getFullYear()).padStart(4, '0')
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function hoyISO(): string {
  return isoLocal(new Date())
}

export function parseFechaLocal(fecha?: string): Date | null {
  if (!fecha) return null
  const cruda = String(fecha).trim()
  if (!/^\d{4}-\d{2}-\d{2}(?:[T ].*)?$/.test(cruda)) return null
  const limpia = cruda.slice(0, 10)
  const [anio, mes, dia] = limpia.split('-').map(Number)
  if (!fechaExiste(anio, mes, dia)) return null
  const d = new Date(0)
  d.setFullYear(anio, mes - 1, dia)
  d.setHours(0, 0, 0, 0)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Valida que año/mes/día existan realmente (evita que 31/02 se convierta en 03/03). */
export function fechaExiste(anio: number, mes: number, dia: number): boolean {
  if (!Number.isInteger(anio) || !Number.isInteger(mes) || !Number.isInteger(dia)) return false
  if (anio < 1000 || anio > 9999 || mes < 1 || mes > 12 || dia < 1) return false
  return dia <= diasEnMes(anio, mes)
}

/** Cantidad de días del mes (mes 1-12). */
export function diasEnMes(anio: number, mes: number): number {
  const d = new Date(0)
  d.setFullYear(anio, mes, 0)
  return d.getDate()
}

export function sumarMeses(fecha: string, meses: number): string {
  if (!Number.isFinite(meses)) return fecha
  const d = parseFechaLocal(fecha)
  if (!d) return fecha
  const dia = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + Math.trunc(meses))
  const ultimo = diasEnMes(d.getFullYear(), d.getMonth() + 1)
  d.setDate(Math.min(dia, ultimo))
  return isoLocal(d)
}

export function sumarAnio(fecha: string, anios = 1): string {
  if (!Number.isFinite(anios)) return fecha
  const d = parseFechaLocal(fecha)
  if (!d) return fecha
  const dia = d.getDate()
  d.setDate(1)
  d.setFullYear(d.getFullYear() + Math.trunc(anios))
  const ultimo = diasEnMes(d.getFullYear(), d.getMonth() + 1)
  d.setDate(Math.min(dia, ultimo))
  return isoLocal(d)
}

export function fechaFutura(fecha?: string): boolean {
  const d = parseFechaLocal(fecha)
  if (!d) return false
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  return d.getTime() >= hoy.getTime()
}

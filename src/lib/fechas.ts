export function isoLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function hoyISO(): string {
  return isoLocal(new Date())
}

export function parseFechaLocal(fecha?: string): Date | null {
  if (!fecha) return null
  const limpia = String(fecha).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(limpia)) return null
  const [anio, mes, dia] = limpia.split('-').map(Number)
  if (!fechaExiste(anio, mes, dia)) return null
  const d = new Date(`${limpia}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Valida que año/mes/día existan realmente (evita que 31/02 se convierta en 03/03). */
export function fechaExiste(anio: number, mes: number, dia: number): boolean {
  if (!Number.isInteger(anio) || !Number.isInteger(mes) || !Number.isInteger(dia)) return false
  if (anio < 1 || mes < 1 || mes > 12 || dia < 1) return false
  return dia <= diasEnMes(anio, mes)
}

/** Cantidad de días del mes (mes 1-12). */
export function diasEnMes(anio: number, mes: number): number {
  return new Date(anio, mes, 0).getDate()
}

export function sumarMeses(fecha: string, meses: number): string {
  const d = parseFechaLocal(fecha)
  if (!d) return fecha
  const dia = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + meses)
  const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(dia, ultimo))
  return isoLocal(d)
}

export function sumarAnio(fecha: string, anios = 1): string {
  const d = parseFechaLocal(fecha)
  if (!d) return fecha
  const dia = d.getDate()
  d.setDate(1)
  d.setFullYear(d.getFullYear() + anios)
  const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
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

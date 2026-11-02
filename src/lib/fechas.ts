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
  const d = new Date(`${limpia}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
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

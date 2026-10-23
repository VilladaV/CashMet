export type Vigencia = 'vencido' | 'por-vencer' | 'vigente' | 'sin-dato'

export function vigenciaDe(fecha?: string): Vigencia {
  if (!fecha) return 'sin-dato'
  const f = new Date(`${fecha}T00:00:00`)
  if (Number.isNaN(f.getTime())) return 'sin-dato'
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const diff = Math.round((f.getTime() - hoy.getTime()) / 86400000)
  if (diff < 0) return 'vencido'
  if (diff <= 30) return 'por-vencer'
  return 'vigente'
}

export function etiquetaVigencia(v: Vigencia): string {
  if (v === 'vencido') return 'Vencido'
  if (v === 'por-vencer') return 'Vence pronto'
  if (v === 'vigente') return 'Vigente'
  return 'Sin dato'
}

export function claseVigencia(v: Vigencia): string {
  if (v === 'vencido') return 'border-red-400/30 bg-red-500/10 text-red-300'
  if (v === 'por-vencer') return 'border-amber-400/30 bg-amber-400/10 text-amber-300'
  if (v === 'vigente') return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
  return 'border-white/10 bg-white/[0.04] text-mist-500'
}

export function formatoKm(km?: number): string {
  if (km === undefined || km === null) return 'N/A'
  return `${Math.round(km).toLocaleString('es-CO')} km`
}

export function formatoFecha(fecha?: string): string {
  if (!fecha) return 'N/A'
  const f = new Date(`${fecha}T00:00:00`)
  if (Number.isNaN(f.getTime())) return fecha
  return f.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function progresoTarea(tarea: {
  ultimoKm?: number
  proximoKm?: number
  intervaloKm?: number
  costoEstimado?: number
  ultimaFecha?: string
  proximaFecha?: string
  nombre: string
  id: string
}, kmActual?: number): number {
  if (tarea.ultimoKm === undefined || tarea.proximoKm === undefined) return 0
  if (tarea.proximoKm <= tarea.ultimoKm) return 100
  const actual = kmActual ?? tarea.ultimoKm
  const total = tarea.proximoKm - tarea.ultimoKm
  const avance = actual - tarea.ultimoKm
  return Math.min(100, Math.max(0, Math.round((avance / total) * 100)))
}

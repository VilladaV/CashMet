import { parseFechaLocal } from '@/lib/fechas'
import type { TareaMantenimiento } from '@/lib/firebase/vehiculosRepo'

export type Vigencia = 'vencido' | 'por-vencer' | 'vigente' | 'sin-dato'

export function diasParaVencer(fecha?: string): number | null {
  const f = parseFechaLocal(fecha)
  if (!f) return null
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  return Math.round((f.getTime() - hoy.getTime()) / 86400000)
}

export function vigenciaDe(fecha?: string): Vigencia {
  const dias = diasParaVencer(fecha)
  if (dias === null) return 'sin-dato'
  if (dias < 0) return 'vencido'
  if (dias <= 30) return 'por-vencer'
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

export function claseEstado(estado?: string): string {
  if (estado === 'Vendido') return 'border-sky-400/30 bg-sky-500/10 text-sky-300'
  if (estado === 'En reparación') return 'border-amber-400/30 bg-amber-400/10 text-amber-300'
  if (estado === 'Dañado' || estado === 'Decomisado') return 'border-red-400/30 bg-red-500/10 text-red-300'
  if (estado === 'No disponible') return 'border-white/15 bg-white/[0.06] text-mist-300'
  return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
}

export function formatoKm(km?: number): string {
  if (km === undefined || km === null || !Number.isFinite(Number(km))) return 'N/A'
  return `${Math.round(Number(km)).toLocaleString('es-CO')} km`
}

export function formatoFecha(fecha?: string): string {
  const f = parseFechaLocal(fecha)
  if (!f) return fecha || 'N/A'
  return f.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function progresoTarea(tarea: TareaMantenimiento, kmActual?: number): number {
  const ultimo = tarea.ultimoKm ?? (tarea.proximoKm !== undefined && tarea.intervaloKm ? tarea.proximoKm - tarea.intervaloKm : undefined)
  if (ultimo === undefined || tarea.proximoKm === undefined) return 0
  if (tarea.proximoKm <= ultimo) return 100
  const actual = kmActual ?? ultimo
  const total = tarea.proximoKm - ultimo
  const avance = actual - ultimo
  return Math.min(100, Math.max(0, Math.round((avance / total) * 100)))
}

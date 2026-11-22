/** Constantes compartidas del módulo Bear's Reserve (módulo hoja sin dependencias circulares). */

export const TTL_NOTICIA_WEB_MS = 48 * 60 * 60 * 1000
export const TTL_LLAMADA_COMUNITARIA_MS = 24 * 60 * 60 * 1000

/** Porcentaje de tanque considerado "en reserva" en flota, widgets, motor e informes. */
export const UMBRAL_RESERVA_COMBUSTIBLE_PORC = 15

/** Porcentaje de desgaste de llantas considerado crítico para riesgo y alertas. */
export const UMBRAL_LLANTAS_CRITICO_PORC = 75

/** Capacidad de tanque por defecto (en galones US) cuando falta ficha técnica. */
export const CAPACIDAD_TANQUE_FALLBACK_GAL = 18

export const LITROS_POR_GALON = 3.78541

export function galonesALitros(galones: number): number {
  if (!Number.isFinite(galones) || galones <= 0) return 0
  return Math.round(galones * LITROS_POR_GALON)
}

/**
 * Construye un identificador único y consistente de cumplimiento diario de ruta habitual
 * entre ejecución manual (UI) y ejecución automática (repo).
 */
export function construirIdCumplimientoRuta(
  ruta: { id: string; tipoHorario?: string },
  fechaISO: string,
): string {
  return `${fechaISO}-${ruta.tipoHorario || ruta.id}`
}

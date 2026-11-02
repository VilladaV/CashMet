function esObjetoPlano(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null) return false
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

function limpiarValor(v: unknown): unknown {
  if (v === undefined || v === '') return undefined
  if (Array.isArray(v)) {
    return v.map(limpiarValor).filter((x) => x !== undefined)
  }
  if (esObjetoPlano(v)) {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v)) {
      const lv = limpiarValor(val)
      if (lv !== undefined) out[k] = lv
    }
    return Object.keys(out).length ? out : undefined
  }
  return v
}

export function limpio(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    const lv = limpiarValor(v)
    if (lv !== undefined) out[k] = lv
  }
  return out
}

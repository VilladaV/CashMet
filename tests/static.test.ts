import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const raiz = resolve(process.cwd())
const src = join(raiz, 'src')

function archivosFuente(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) return archivosFuente(ruta)
    return /\.(ts|tsx)$/.test(nombre) ? [ruta] : []
  })
}

const FUENTES = archivosFuente(src)

function leer(rel: string): string {
  return readFileSync(join(raiz, rel), 'utf8')
}

describe('controles estáticos de seguridad y accesibilidad', () => {
  it('declara el idioma español en el documento', () => {
    expect(leer('index.html')).toMatch(/<html[^>]+lang="es"/i)
  })

  it('no usa dangerouslySetInnerHTML ni eval en el código de la app', () => {
    const infractores = FUENTES.filter((f) => {
      const t = readFileSync(f, 'utf8')
      return t.includes('dangerouslySetInnerHTML') || /\beval\s*\(/.test(t)
    })
    expect(infractores).toEqual([])
  })

  it('no persiste tokens OAuth en localStorage', () => {
    const calendar = leer('src/lib/google/calendar.ts')
    expect(calendar).not.toMatch(/localStorage\.setItem\(CLAVE/)
  })

  it('las reglas de Firestore niegan el acceso por defecto', () => {
    const reglas = leer('firestore.rules')
    expect(reglas).toMatch(/match \/\{document=\*\*\} \{ allow read, write: if false; \}/)
    expect(reglas).not.toMatch(/allow read, write: if true/)
  })

  it('usa fechas locales (no toISOString) para vencimientos y filtros de negocio', () => {
    const infractores = FUENTES.filter((f) => /toISOString\(\)\.slice\(0, ?(7|10)\)/.test(readFileSync(f, 'utf8')))
    expect(infractores.map((f) => f.replace(raiz + '\\', '').replace(raiz + '/', ''))).toEqual([])
  })

  it('mantiene scripts de prueba y compilación en package.json', () => {
    const pkg = JSON.parse(leer('package.json')) as { scripts: Record<string, string> }
    expect(pkg.scripts.test).toBeTruthy()
    expect(pkg.scripts.build).toBeTruthy()
    expect(pkg.scripts.lint).toBeTruthy()
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  limpiarConcepto,
  normalizarTexto,
  parseCategoria,
  parseFecha,
  parseMontoCO,
  parseTipo,
} from '@/ai/parser/nl'

describe('parser NLP', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-11T15:00:00.000Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  describe('parseMontoCO', () => {
    it('interpreta pesos con separadores colombianos', () => {
      expect(parseMontoCO('gasté $1.234.567 en el mercado')).toBe(1234567)
      expect(parseMontoCO('pagué 250.000 de arriendo')).toBe(250000)
    })

    it('interpreta sufijos k y millones', () => {
      expect(parseMontoCO('compré un almuerzo por 25k')).toBe(25000)
      expect(parseMontoCO('me pagaron 1,5 millones')).toBe(1500000)
      expect(parseMontoCO('gasté 2 mil')).toBe(2000)
    })

    it('no confunde cantidades sin unidad monetaria con montos', () => {
      expect(parseMontoCO('compré 2 kg de arroz')).toBeNull()
      expect(parseMontoCO('caminé 3 km')).toBeNull()
      expect(parseMontoCO('sin cifras')).toBeNull()
    })

    it('redondea a pesos enteros', () => {
      expect(parseMontoCO('pagué 10,4 dólares')).toBe(10)
    })
  })

  describe('parseFecha', () => {
    it('respeta el año explícito', () => {
      expect(parseFecha('15 de marzo de 2025')).toBe('2025-03-15')
    })

    it('usa el año actual cuando no se especifica', () => {
      expect(parseFecha('15 de marzo')).toBe('2026-03-15')
    })

    it('rechaza fechas imposibles y usa hoy como respaldo', () => {
      expect(parseFecha('31/02/2026')).toBe('2026-11-11')
      expect(parseFecha('31 de abril')).toBe('2026-11-11')
    })

    it('acepta 29 de febrero solo en año bisiesto', () => {
      expect(parseFecha('29/02/2024')).toBe('2024-02-29')
      expect(parseFecha('29/02/2025')).toBe('2026-11-11')
    })

    it('interpreta fechas relativas', () => {
      expect(parseFecha('ayer')).toBe('2026-11-10')
      expect(parseFecha('anteayer')).toBe('2026-11-09')
      expect(parseFecha('mañana')).toBe('2026-11-12')
    })

    it('acepta fechas ISO explícitas', () => {
      expect(parseFecha('registra 50.000 el 2025-03-15')).toBe('2025-03-15')
    })
  })

  describe('parseTipo', () => {
    it('detecta ingresos', () => {
      expect(parseTipo('recibí 100.000 de un cliente')).toBe('ingreso')
      expect(parseTipo('me consignaron el salario')).toBe('ingreso')
    })

    it('detecta gastos', () => {
      expect(parseTipo('pagué 100.000 de mercado')).toBe('gasto')
      expect(parseTipo('compré un café')).toBe('gasto')
    })
  })

  describe('parseCategoria', () => {
    it('clasifica categorías frecuentes', () => {
      expect(parseCategoria('mercado en D1', 'gasto')).toBe('Mercado')
      expect(parseCategoria('gasolina para el carro', 'gasto')).toBe('Combustible')
      expect(parseCategoria('pagué el SOAT', 'gasto')).toBe('SOAT')
      expect(parseCategoria('recibí honorarios', 'ingreso')).toBe('Ingreso')
    })
  })

  describe('limpiarConcepto', () => {
    it('quita monto y verbos de registro', () => {
      expect(limpiarConcepto('registra $25.000 de almuerzo')).toBe('Almuerzo')
    })

    it('nunca devuelve vacío', () => {
      expect(limpiarConcepto('$50.000')).toBe('Movimiento')
    })
  })

  it('normaliza acentos y mayúsculas', () => {
    expect(normalizarTexto('  MAÑANA  ')).toBe('manana')
    expect(normalizarTexto('Nómina')).toBe('nomina')
  })
})

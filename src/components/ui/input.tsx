import * as React from 'react'
import { cn, formatearCifra } from '@/lib/utils'

export interface InputProps extends React.ComponentProps<'input'> {
  cifra?: boolean
}

function contarDigitosAntes(texto: string, indice: number): { digitos: number; signo: boolean } {
  const prefijo = texto.slice(0, Math.max(0, indice))
  const digitos = (prefijo.match(/\d/g) ?? []).length
  const signo = prefijo.startsWith('-')
  return { digitos, signo }
}

function indiceParaDigitos(texto: string, objetivoDigitos: number, mantenerSigno: boolean): number {
  if (objetivoDigitos === 0) {
    return mantenerSigno && texto.startsWith('-') ? 1 : 0
  }
  let vistos = 0
  for (let i = 0; i < texto.length; i++) {
    if (/\d/.test(texto[i])) {
      vistos++
      if (vistos === objetivoDigitos) return i + 1
    }
  }
  return texto.length
}

function Input({ className, type, cifra, value, onChange, inputMode, ref, ...props }: InputProps) {
  const innerRef = React.useRef<HTMLInputElement | null>(null)
  const caretPendienteRef = React.useRef<number | null>(null)

  const displayValue =
    cifra && value !== undefined && value !== null ? formatearCifra(value as string | number) : value

  React.useLayoutEffect(() => {
    if (!cifra || caretPendienteRef.current === null || !innerRef.current) return
    const pos = caretPendienteRef.current
    caretPendienteRef.current = null
    try {
      innerRef.current.setSelectionRange(pos, pos)
    } catch {
      /* tipos de input sin selección */
    }
  }, [cifra, displayValue])

  const asignarRef = React.useCallback(
    (node: HTMLInputElement | null) => {
      innerRef.current = node
      if (typeof ref === 'function') {
        ref(node)
      } else if (ref && 'current' in ref) {
        ;(ref as React.MutableRefObject<HTMLInputElement | null>).current = node
      }
    },
    [ref]
  )

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (cifra) {
      const crudo = e.target.value
      const seleccion = e.target.selectionStart
      const formatted = formatearCifra(crudo)
      if (seleccion !== null) {
        const { digitos, signo } = contarDigitosAntes(crudo, seleccion)
        caretPendienteRef.current = indiceParaDigitos(formatted, digitos, signo)
      }
      e.target.value = formatted
    }
    onChange?.(e)
  }

  return (
    <input
      ref={asignarRef}
      type={cifra ? 'text' : type}
      inputMode={cifra ? 'numeric' : inputMode}
      value={displayValue}
      onChange={handleChange}
      data-slot="input"
      className={cn(
        'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
        className
      )}
      {...props}
    />
  )
}

export { Input }

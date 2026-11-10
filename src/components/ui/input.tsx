import * as React from 'react'
import { cn, formatearCifra } from '@/lib/utils'

export interface InputProps extends React.ComponentProps<'input'> {
  cifra?: boolean
}

function Input({ className, type, cifra, value, onChange, ...props }: InputProps) {
  const displayValue =
    cifra && value !== undefined && value !== null ? formatearCifra(value as string | number) : value

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (cifra) {
      const formatted = formatearCifra(e.target.value)
      e.target.value = formatted
    }
    onChange?.(e)
  }

  return (
    <input
      type={cifra ? 'text' : type}
      inputMode={cifra ? 'numeric' : props.inputMode}
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


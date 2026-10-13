import { useEffect, useRef } from 'react'
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react'

interface Props {
  valor: number
  formato: (n: number) => string
  className?: string
}

export default function Contador({ valor, formato, className }: Props) {
  const mv = useMotionValue(0)
  const texto = useTransform(mv, (v) => formato(Math.round(v)))
  const reducir = useReducedMotion()
  const primero = useRef(true)

  useEffect(() => {
    if (primero.current || reducir) {
      primero.current = false
      mv.set(valor)
      return
    }
    const controles = animate(mv, valor, { type: 'spring', stiffness: 80, damping: 21, mass: 0.9 })
    return () => controles.stop()
  }, [valor, mv, reducir])

  return <motion.span className={className}>{texto}</motion.span>
}

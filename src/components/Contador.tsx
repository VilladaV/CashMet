import { useEffect, useRef } from 'react'
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react'

interface Props {
  valor: number
  formato: (n: number) => string
  className?: string
}

export default function Contador({ valor, formato, className }: Props) {
  const seguro = Number.isFinite(valor) ? valor : 0
  const formatoRef = useRef(formato)
  const mv = useMotionValue(seguro)
  const texto = useTransform(mv, (v) => formatoRef.current(Math.round(v)))
  const reducir = useReducedMotion()
  const ultimoValorRef = useRef(seguro)

  useEffect(() => {
    formatoRef.current = formato
  }, [formato])

  useEffect(() => {
    if (ultimoValorRef.current === seguro) {
      mv.set(seguro)
      return
    }
    ultimoValorRef.current = seguro
    if (reducir) {
      mv.set(seguro)
      return
    }
    const controles = animate(mv, seguro, { type: 'spring', stiffness: 80, damping: 21, mass: 0.9 })
    return () => controles.stop()
  }, [seguro, mv, reducir])

  return <motion.span className={className}>{texto}</motion.span>
}

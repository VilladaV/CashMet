import { useId } from 'react'

interface CashMetLogoProps {
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showText?: boolean
  showSubtitle?: boolean
  variant?: 'light' | 'dark' | 'auto'
}

export function CashMetEmblem({ size = 36, className = '' }: { size?: number; className?: string }) {
  const uid = useId()
  const ringGradId = `${uid}-ring-grad`
  const arrowGradId = `${uid}-arrow-grad`
  const shadowId = `${uid}-shadow`

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="CashMet Emblem"
    >
      <defs>
        {/* Gradiente para el aro circular azul/marino */}
        <linearGradient id={ringGradId} x1="15%" y1="85%" x2="85%" y2="15%">
          <stop offset="0%" stopColor="#082142" />
          <stop offset="35%" stopColor="#0F3868" />
          <stop offset="70%" stopColor="#1B639B" />
          <stop offset="100%" stopColor="#0284C7" />
        </linearGradient>

        {/* Gradiente para la línea/flecha de crecimiento esmeralda-cyan */}
        <linearGradient id={arrowGradId} x1="10%" y1="90%" x2="95%" y2="10%">
          <stop offset="0%" stopColor="#047857" />
          <stop offset="25%" stopColor="#059669" />
          <stop offset="55%" stopColor="#10B981" />
          <stop offset="85%" stopColor="#14B8A6" />
          <stop offset="100%" stopColor="#2DD4BF" />
        </linearGradient>

        {/* Sombra suave interna / profundidad */}
        <filter id={shadowId} x="-10%" y="-10%" width="130%" height="130%">
          <feDropShadow dx="1" dy="2" stdDeviation="2" floodColor="#07192C" floodOpacity="0.25" />
        </filter>
      </defs>

      {/* Aro circular azul exterior */}
      <circle
        cx="46"
        cy="54"
        r="32"
        stroke={`url(#${ringGradId})`}
        strokeWidth="11"
        strokeLinecap="round"
        fill="none"
        filter={`url(#${shadowId})`}
      />

      {/* Arco secundario para profundidad 3D */}
      <path
        d="M 23 68 A 32 32 0 0 1 72 35"
        stroke="#0284C7"
        strokeWidth="11"
        strokeLinecap="round"
        fill="none"
        opacity="0.4"
      />

      {/* Trazo dinámico de crecimiento en 'M' + flecha alcista */}
      <path
        d="M 24 64 L 38 46 L 47 55 L 68 28"
        stroke={`url(#${arrowGradId})`}
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Cabeza de flecha ascendente hacia arriba a la derecha */}
      <path
        d="M 57 24 L 75 23 L 73 41"
        stroke={`url(#${arrowGradId})`}
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <polygon points="75,23 58,25 64,31 71,31" fill={`url(#${arrowGradId})`} />
    </svg>
  )
}

export default function CashMetLogo({
  className = '',
  size = 'md',
  showText = true,
  showSubtitle = true,
  variant = 'auto',
}: CashMetLogoProps) {
  const pixelSizes = {
    sm: 28,
    md: 38,
    lg: 48,
    xl: 64,
  }

  const textSizes = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-3xl',
    xl: 'text-4xl',
  }

  const subSizes = {
    sm: 'text-[9px] tracking-[0.16em]',
    md: 'text-[10.5px] tracking-[0.22em]',
    lg: 'text-xs tracking-[0.25em]',
    xl: 'text-sm tracking-[0.28em]',
  }

  const textCol =
    variant === 'dark'
      ? 'text-white'
      : variant === 'light'
        ? 'text-[#0B2545]'
        : 'text-[#0B2545] dark:text-white'

  const metCol =
    variant === 'dark'
      ? 'text-[#38BDF8]'
      : variant === 'light'
        ? 'text-[#0F3868]'
        : 'text-[#0F3868] dark:text-[#38BDF8]'

  const subCol =
    variant === 'dark'
      ? 'text-slate-300'
      : variant === 'light'
        ? 'text-[#475569]'
        : 'text-[#475569] dark:text-slate-400'

  return (
    <div className={`inline-flex items-center gap-3 select-none ${className}`}>
      <div className="relative flex shrink-0 items-center justify-center">
        <CashMetEmblem size={pixelSizes[size]} />
      </div>

      {showText && (
        <div className="flex flex-col leading-none">
          <div className={`flex items-center font-sans font-black tracking-tight ${textSizes[size]} ${textCol}`}>
            <span>CASH</span>
            <span className={metCol}>MET</span>
          </div>
          {showSubtitle && (
            <div className={`mt-0.5 font-sans font-semibold uppercase ${subSizes[size]} ${subCol}`}>
              Financial Solutions
            </div>
          )}
        </div>
      )}
    </div>
  )
}

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, Home, RotateCcw } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  mensaje: string
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    mensaje: '',
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      mensaje: error?.message || 'Ocurrió un error inesperado al renderizar la pantalla.',
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary capturó un error de renderizado:', error, info)
  }

  recargar = () => {
    window.location.reload()
  }

  volverAlInicio = () => {
    try {
      window.location.hash = '#chat'
    } catch {
      /* sin acceso a location.hash */
    }
    this.setState({ hasError: false, mensaje: '' })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="bg-mesh-pattern flex min-h-screen items-center justify-center p-4 text-mist-100">
        <div className="glass-card surface-glow w-full max-w-md space-y-5 rounded-3xl p-6 text-center sm:p-8">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-red-400/30 bg-red-500/15 text-red-300">
            <AlertTriangle className="h-7 w-7" />
          </div>

          <div className="space-y-1.5">
            <h1 className="text-lg font-extrabold tracking-tight text-white">
              Algo salió mal en CashMet
            </h1>
            <p className="text-xs leading-relaxed text-mist-500">
              Tus datos están seguros en Firestore. Puedes volver al inicio o recargar la aplicación para continuar.
            </p>
          </div>

          {this.state.mensaje && (
            <div className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-left font-mono text-[11px] break-words text-red-200">
              {this.state.mensaje}
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={this.volverAlInicio}
              className="inline-flex h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 text-xs font-bold text-mist-100 transition hover:bg-white/10"
            >
              <Home className="h-4 w-4" />
              <span>Volver al inicio</span>
            </button>
            <button
              type="button"
              onClick={this.recargar}
              className="inline-flex h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 px-4 text-xs font-bold text-[#04241a] transition hover:brightness-110"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Recargar aplicación</span>
            </button>
          </div>
        </div>
      </div>
    )
  }
}

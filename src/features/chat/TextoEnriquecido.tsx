import type { ReactNode } from 'react'

function enLinea(texto: string): ReactNode[] {
  const partes = texto.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
  return partes.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4) {
      return (
        <strong key={i} className="font-semibold text-slate-900">
          {p.slice(2, -2)}
        </strong>
      )
    }
    if (p.startsWith('*') && p.endsWith('*') && p.length > 2) {
      return (
        <em key={i} className="italic">
          {p.slice(1, -1)}
        </em>
      )
    }
    return <span key={i}>{p}</span>
  })
}

const RE_VINETA = /^\s*[-*•]\s+(.*)$/

export default function TextoEnriquecido({ texto }: { texto: string }) {
  const lineas = texto.split('\n')
  const bloques: ReactNode[] = []
  let lista: string[] = []

  const cerrarLista = () => {
    if (!lista.length) return
    bloques.push(
      <ul key={`ul-${bloques.length}`} className="my-1 space-y-1 pl-1">
        {lista.map((item, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-emerald-500 mt-[2px] select-none">▪</span>
            <span className="flex-1">{enLinea(item)}</span>
          </li>
        ))}
      </ul>,
    )
    lista = []
  }

  lineas.forEach((linea, idx) => {
    const m = linea.match(RE_VINETA)
    if (m) {
      lista.push(m[1])
      return
    }
    cerrarLista()
    if (linea.trim() === '') {
      bloques.push(<div key={`sp-${idx}`} className="h-1.5" />)
    } else {
      bloques.push(
        <p key={`p-${idx}`} className="whitespace-pre-wrap">
          {enLinea(linea)}
        </p>,
      )
    }
  })
  cerrarLista()

  return <div className="space-y-0.5">{bloques}</div>
}

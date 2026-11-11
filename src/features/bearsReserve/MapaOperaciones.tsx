import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  BASE_BEARS_RESERVE,
  calcularDistanciaRealDesdeBase,
  PARADAS_RUTA_ESCOLAR_MATUTINA,
  PARADAS_RUTA_ESCOLAR_VESPERTINA,
} from './geo'
import type { EventoRadarLocal, MisionComunitaria, RutaHabitual } from './types'
import { Navigation, Clock, Radio, Layers } from 'lucide-react'

interface Props {
  eventosRadar: EventoRadarLocal[]
  misiones: MisionComunitaria[]
  rutasHabituales: RutaHabitual[]
  misionSeleccionada?: MisionComunitaria | null
  onSeleccionarEvento?: (ev: EventoRadarLocal) => void
}

export default function MapaOperaciones({
  eventosRadar,
  misiones,
  rutasHabituales,
  misionSeleccionada,
  onSeleccionarEvento,
}: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const routeLayerGroupRef = useRef<L.LayerGroup | null>(null)

  const [capaActiva, setCapaActiva] = useState<'todos' | 'radar' | 'escolares'>('todos')
  const [puntoInspeccionado, setPuntoInspeccionado] = useState<{
    titulo: string
    lugar: string
    lat: number
    lng: number
    kmIdaYVuelta: number
    minutosRodamiento: number
    esTrocha: boolean
  } | null>(null)

  useEffect(() => {
    if (!mapContainerRef.current) return
    if (mapInstanceRef.current) return

    // Inicializar mapa centrado en Base Finca El Guadual (San Peregrino, Caldas)
    const map = L.map(mapContainerRef.current, {
      center: [BASE_BEARS_RESERVE.lat, BASE_BEARS_RESERVE.lng],
      zoom: 12,
      zoomControl: true,
    })

    // Capa de mosaicos oscuros tácticos (CartoDB Dark Matter)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map)

    const layerGroup = L.layerGroup().addTo(map)
    routeLayerGroupRef.current = layerGroup
    mapInstanceRef.current = map

    return () => {
      map.remove()
      mapInstanceRef.current = null
    }
  }, [])

  // Renderizar capas y marcadores cuando cambian los datos o el filtro
  useEffect(() => {
    const map = mapInstanceRef.current
    const layerGroup = routeLayerGroupRef.current
    if (!map || !layerGroup) return

    layerGroup.clearLayers()

    // 1. MARCADOR PRINCIPAL: BASE CENTRAL FINCA EL GUADUAL 🐻
    const baseIcon = L.divIcon({
      className: 'custom-base-icon',
      html: `
        <div style="
          background: linear-gradient(135deg, #f59e0b, #10b981);
          color: black;
          font-weight: 900;
          font-size: 14px;
          border-radius: 9999px;
          width: 38px;
          height: 38px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 3px solid #ffffff;
          box-shadow: 0 0 20px rgba(245, 158, 11, 0.7);
        ">
          🐻
        </div>
      `,
      iconSize: [38, 38],
      iconAnchor: [19, 19],
    })

    const baseMarker = L.marker([BASE_BEARS_RESERVE.lat, BASE_BEARS_RESERVE.lng], { icon: baseIcon })
      .bindPopup(`
        <div style="color: #0f172a; font-family: sans-serif; font-size: 12px; line-height: 1.4;">
          <b style="font-size: 14px; color: #b45309;">🏠 Finca El Guadual</b><br/>
          <b>Base Central Bear's Reserve</b><br/>
          Vereda San Peregrino, Manizales, Caldas<br/>
          <span style="font-size: 10px; color: #64748b;">5.069750, -75.590521</span>
        </div>
      `)
    layerGroup.addLayer(baseMarker)

    // 2. CAPAS DE RUTAS ESCOLARES (Puntos y polilíneas)
    if (capaActiva === 'todos' || capaActiva === 'escolares') {
      const coordsMatutina: [number, number][] = PARADAS_RUTA_ESCOLAR_MATUTINA.map((p) => [p.lat, p.lng])
      const lineaEscolarManana = L.polyline(coordsMatutina, {
        color: '#38bdf8',
        weight: 3.5,
        opacity: 0.85,
        dashArray: '6, 6',
      }).bindTooltip('Ruta Escolar Matutina 06:00 AM (38.4 km)', { sticky: true })
      layerGroup.addLayer(lineaEscolarManana)

      PARADAS_RUTA_ESCOLAR_MATUTINA.forEach((p, idx) => {
        if (idx === 0 || idx === PARADAS_RUTA_ESCOLAR_MATUTINA.length - 1) return
        const stopIcon = L.divIcon({
          className: 'custom-stop-icon',
          html: `<div style="background: #38bdf8; width: 10px; height: 10px; border-radius: 50%; border: 2px solid white;"></div>`,
          iconSize: [10, 10],
          iconAnchor: [5, 5],
        })
        const m = L.marker([p.lat, p.lng], { icon: stopIcon }).bindPopup(`
          <div style="color: #0f172a; font-size: 11px;">
            <b>🚌 Parada Escolar Matutina:</b><br/>${p.nombre}
          </div>
        `)
        layerGroup.addLayer(m)
      })

      // Vespertina
      const coordsVespertina: [number, number][] = PARADAS_RUTA_ESCOLAR_VESPERTINA.map((p) => [p.lat, p.lng])
      const lineaEscolarTarde = L.polyline(coordsVespertina, {
        color: '#a855f7',
        weight: 3,
        opacity: 0.75,
        dashArray: '4, 8',
      }).bindTooltip('Ruta Escolar Vespertina 15:00 (38.4 km)', { sticky: true })
      layerGroup.addLayer(lineaEscolarTarde)
    }

    // 3. EVENTOS DEL RADAR
    if (capaActiva === 'todos' || capaActiva === 'radar') {
      eventosRadar.forEach((ev) => {
        if (!ev.lat || !ev.lng) return
        if (ev.lat === BASE_BEARS_RESERVE.lat && ev.lng === BASE_BEARS_RESERVE.lng) return

        const esGrave = ev.esEmergenciaGrave
        const color = esGrave ? '#ef4444' : ev.esNoticiaWebReal ? '#38bdf8' : '#f59e0b'
        const badge = ev.esNoticiaWebReal ? '✓' : '📻'

        const evIcon = L.divIcon({
          className: 'custom-ev-icon',
          html: `
            <div style="
              background: ${color};
              color: white;
              font-weight: 900;
              font-size: 11px;
              border-radius: 9999px;
              width: 26px;
              height: 26px;
              display: flex;
              align-items: center;
              justify-content: center;
              border: 2px solid #ffffff;
              box-shadow: 0 0 12px ${color};
            ">
              ${badge}
            </div>
          `,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        })

        const marker = L.marker([ev.lat, ev.lng], { icon: evIcon })
          .bindPopup(`
            <div style="color: #0f172a; font-family: sans-serif; font-size: 11px; max-width: 220px;">
              <b style="color: ${color}; font-size: 12px;">${ev.esNoticiaWebReal ? '✓ Noticia Web' : '📻 Auxilio Comunitario'}</b><br/>
              <b>${ev.titulo}</b><br/>
              <span style="color: #475569;">📍 ${ev.lugar}</span><br/>
              <p style="margin: 4px 0; font-size: 10px; color: #334155;">${ev.resumen}</p>
            </div>
          `)
          .on('click', () => {
            const geo = calcularDistanciaRealDesdeBase(ev.lat!, ev.lng!, true)
            setPuntoInspeccionado({
              titulo: ev.titulo,
              lugar: ev.lugar,
              lat: ev.lat!,
              lng: ev.lng!,
              kmIdaYVuelta: geo.distanciaKmTotalIdaYVuelta,
              minutosRodamiento: geo.tiempoMinutosRodamientoIdaYVuelta,
              esTrocha: true,
            })
            if (onSeleccionarEvento) onSeleccionarEvento(ev)
          })

        layerGroup.addLayer(marker)

        // Trazado de ruta desde Base hasta la contingencia
        const rutaContingencia = L.polyline(
          [
            [BASE_BEARS_RESERVE.lat, BASE_BEARS_RESERVE.lng],
            [ev.lat, ev.lng],
          ],
          {
            color,
            weight: 2,
            opacity: 0.6,
            dashArray: '3, 6',
          }
        )
        layerGroup.addLayer(rutaContingencia)
      })
    }

    // Si hay una misión seleccionada en curso
    if (misionSeleccionada && misionSeleccionada.latDestino && misionSeleccionada.lngDestino) {
      const rutaMision = L.polyline(
        [
          [BASE_BEARS_RESERVE.lat, BASE_BEARS_RESERVE.lng],
          [misionSeleccionada.latDestino, misionSeleccionada.lngDestino],
        ],
        {
          color: '#10b981',
          weight: 4,
          opacity: 0.95,
        }
      ).bindTooltip(`Misión Activa: ${misionSeleccionada.titulo}`, { permanent: true })
      layerGroup.addLayer(rutaMision)
    }
  }, [eventosRadar, misiones, rutasHabituales, capaActiva, misionSeleccionada, onSeleccionarEvento])

  return (
    <div className="space-y-3">
      {/* Barra de control del mapa */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-black/40 p-2.5 text-xs backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-400/20 text-amber-300">
            <Navigation className="h-4 w-4" />
          </span>
          <div>
            <div className="font-extrabold text-white">
              Centro Táctico de Rutas · Base Finca El Guadual
            </div>
            <div className="text-[10px] text-mist-400">
              San Peregrino, Manizales · Coordenadas 5.069750, -75.590521
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCapaActiva('todos')}
            className={`cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
              capaActiva === 'todos'
                ? 'bg-amber-400/20 text-amber-200 border border-amber-400/30'
                : 'bg-white/[0.04] text-mist-400 hover:text-white'
            }`}
          >
            <Layers className="h-3 w-3 inline mr-1" />
            Ver Todo
          </button>
          <button
            type="button"
            onClick={() => setCapaActiva('escolares')}
            className={`cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
              capaActiva === 'escolares'
                ? 'bg-sky-400/20 text-sky-200 border border-sky-400/30'
                : 'bg-white/[0.04] text-mist-400 hover:text-white'
            }`}
          >
            Rutas Escolares (Mañana / Tarde)
          </button>
          <button
            type="button"
            onClick={() => setCapaActiva('radar')}
            className={`cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
              capaActiva === 'radar'
                ? 'bg-red-400/20 text-red-200 border border-red-400/30'
                : 'bg-white/[0.04] text-mist-400 hover:text-white'
            }`}
          >
            <Radio className="h-3 w-3 inline mr-1" />
            Contingencias Radar
          </button>
        </div>
      </div>

      {/* Contenedor del mapa Leaflet */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 shadow-2xl">
        <div ref={mapContainerRef} className="h-[440px] w-full bg-[#0b1320]" />

        {/* Leyenda flotante en esquina */}
        <div className="pointer-events-none absolute bottom-3 left-3 z-[400] flex flex-col gap-1 rounded-2xl border border-white/10 bg-black/75 p-2.5 text-[10px] text-mist-300 backdrop-blur-md">
          <div className="flex items-center gap-1.5 font-bold text-white">
            <span className="text-amber-400">🐻</span>
            <span>Base Central Finca El Guadual (San Peregrino)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-sky-400" />
            <span>Ruta Escolar Matutina 06:00 (38.4 km)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-purple-400" />
            <span>Ruta Escolar Vespertina 15:00 (38.4 km)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-red-400" />
            <span>Contingencias / Auxilios Veredales</span>
          </div>
        </div>

        {/* Panel de telemetría de ruta si hay un punto inspeccionado */}
        {puntoInspeccionado && (
          <div className="absolute top-3 right-3 z-[400] w-72 rounded-2xl border border-amber-400/30 bg-night-950/90 p-3 text-xs shadow-2xl backdrop-blur-md">
            <div className="flex items-start justify-between gap-1 border-b border-white/10 pb-2">
              <div>
                <div className="font-extrabold text-white text-[11px] leading-tight">
                  {puntoInspeccionado.titulo}
                </div>
                <div className="text-[10px] text-amber-300">{puntoInspeccionado.lugar}</div>
              </div>
              <button
                type="button"
                onClick={() => setPuntoInspeccionado(null)}
                className="cursor-pointer text-mist-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
              <div className="rounded-xl border border-white/[0.06] bg-black/40 p-2">
                <div className="text-mist-400 flex items-center gap-1 font-bold">
                  <Navigation className="h-3 w-3 text-emerald-400" />
                  <span>Distancia Real</span>
                </div>
                <div className="font-mono text-sm font-black text-white mt-0.5">
                  {puntoInspeccionado.kmIdaYVuelta} km
                </div>
                <div className="text-[9px] text-mist-500">Ida y vuelta a Base</div>
              </div>

              <div className="rounded-xl border border-white/[0.06] bg-black/40 p-2">
                <div className="text-mist-400 flex items-center gap-1 font-bold">
                  <Clock className="h-3 w-3 text-sky-400" />
                  <span>Tiempo Rodando</span>
                </div>
                <div className="font-mono text-sm font-black text-white mt-0.5">
                  ~{puntoInspeccionado.minutosRodamiento} min
                </div>
                <div className="text-[9px] text-mist-500">Curvas montaña</div>
              </div>
            </div>

            <div className="mt-2 rounded-xl border border-white/[0.06] bg-black/40 p-2 text-[10px]">
              <div className="flex items-center justify-between">
                <span className="text-mist-400">Consumo combustible est.:</span>
                <span className="font-mono font-bold text-amber-300">
                  ~{(puntoInspeccionado.kmIdaYVuelta / 22).toFixed(1)} gal
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

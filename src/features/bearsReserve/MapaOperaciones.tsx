import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  BASE_BEARS_RESERVE,
  calcularDistanciaRutaParadas,
  escapeHtml,
  estimarLogisticaMisionDesdeBase,
  formatearDuracionCorta,
  PARADAS_RUTA_ESCOLAR_MATUTINA,
  PARADAS_RUTA_ESCOLAR_VESPERTINA,
  PARADAS_RUTA_MERCADO_CAMPESINO,
} from './geo'
import { trazarRutaCarreteraGps } from './ruteoGps'
import type { EventoRadarLocal, MisionComunitaria, RutaHabitual } from './types'
import {
  Navigation,
  Clock,
  Radio,
  Layers,
  Move,
  Save,
  X,
  CheckCircle2,
  AlertTriangle,
  Crosshair,
  Route as RouteIcon,
} from 'lucide-react'

interface Props {
  eventosRadar: EventoRadarLocal[]
  misiones: MisionComunitaria[]
  rutasHabituales: RutaHabitual[]
  onSeleccionarEvento?: (ev: EventoRadarLocal) => void
  onActualizarRuta?: (ruta: RutaHabitual) => Promise<void> | void
}

type FiltroCapa = 'ruta' | 'todos' | 'radar'

interface PuntoInspeccionado {
  eventoId: string
  titulo: string
  lugar: string
  lat: number
  lng: number
  kmIda: number
  kmIdaYVuelta: number
  minutosRodamiento: number
  minutosServicio: number
  duracionTotal: number
  categoriaDistancia: 'local' | 'regional' | 'nacional'
}

function paradasPorDefectoDeRuta(
  ruta?: RutaHabitual
): Array<{ nombre: string; lat: number; lng: number }> {
  if (!ruta) return [...PARADAS_RUTA_ESCOLAR_MATUTINA]
  if (ruta.tipoHorario === 'mercado_sabado' || ruta.id === 'rut-mercado-campesino') {
    return [...PARADAS_RUTA_MERCADO_CAMPESINO]
  }
  if (ruta.tipoHorario === 'tarde' || ruta.id === 'rut-escolar-tarde') {
    return [...PARADAS_RUTA_ESCOLAR_VESPERTINA]
  }
  return [...PARADAS_RUTA_ESCOLAR_MATUTINA]
}

function coordenadasConJitterBase(
  lat: number,
  lng: number,
  indice: number
): { lat: number; lng: number } {
  const coincideConBase =
    Math.abs(lat - BASE_BEARS_RESERVE.lat) < 0.0001 &&
    Math.abs(lng - BASE_BEARS_RESERVE.lng) < 0.0001
  if (!coincideConBase) return { lat, lng }
  const angulo = ((indice % 8) * Math.PI) / 4 + Math.PI / 6
  const radio = 0.00045
  return {
    lat: Number((lat + Math.sin(angulo) * radio).toFixed(6)),
    lng: Number((lng + Math.cos(angulo) * radio).toFixed(6)),
  }
}

export default function MapaOperaciones({
  eventosRadar,
  misiones,
  rutasHabituales,
  onSeleccionarEvento,
  onActualizarRuta,
}: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)

  // 5 LayerGroups independientes para nunca destruir una capa al cambiar otra
  const baseLayerGroupRef = useRef<L.LayerGroup | null>(null)
  const rutasLayerGroupRef = useRef<L.LayerGroup | null>(null)
  const radarLayerGroupRef = useRef<L.LayerGroup | null>(null)
  const misionesLayerGroupRef = useRef<L.LayerGroup | null>(null)
  const edicionLayerGroupRef = useRef<L.LayerGroup | null>(null)

  const onSeleccionarEventoRef = useRef(onSeleccionarEvento)
  const feedbackTimerRef = useRef<number | null>(null)
  const paradaNuevaSeqRef = useRef(1)

  const [rutaSeleccionadaId, setRutaSeleccionadaId] = useState<string>(
    () => rutasHabituales[0]?.id || 'rut-escolar-manana'
  )
  const [capaActiva, setCapaActiva] = useState<FiltroCapa>('ruta')
  const [puntoInspeccionado, setPuntoInspeccionado] = useState<PuntoInspeccionado | null>(null)
  const [errorTiles, setErrorTiles] = useState(false)

  // Modo edición interactivo (arrastrar pines en mapa)
  const [modoEdicionRuta, setModoEdicionRuta] = useState(false)
  const [rutaIdEditando, setRutaIdEditando] = useState<string>('rut-escolar-manana')
  const [paradasEditando, setParadasEditando] = useState<
    Array<{ nombre: string; lat: number; lng: number }>
  >([])
  const [distanciaGpsLive, setDistanciaGpsLive] = useState<number>(0)
  const [tiempoGpsLive, setTiempoGpsLive] = useState<number>(0)
  const [calculandoGps, setCalculandoGps] = useState<boolean>(false)
  const [guardando, setGuardando] = useState<boolean>(false)
  const [usoFallbackHaversine, setUsoFallbackHaversine] = useState<boolean>(false)
  const [feedback, setFeedback] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const paradasEditandoRef = useRef(paradasEditando)
  const modoEdicionRef = useRef(modoEdicionRuta)

  useEffect(() => {
    onSeleccionarEventoRef.current = onSeleccionarEvento
  }, [onSeleccionarEvento])

  useEffect(() => {
    paradasEditandoRef.current = paradasEditando
  }, [paradasEditando])

  useEffect(() => {
    modoEdicionRef.current = modoEdicionRuta
  }, [modoEdicionRuta])

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current !== null) {
        window.clearTimeout(feedbackTimerRef.current)
      }
    }
  }, [])

  const mostrarFeedback = useCallback((tipo: 'ok' | 'error', texto: string, ms = 5000) => {
    if (feedbackTimerRef.current !== null) {
      window.clearTimeout(feedbackTimerRef.current)
    }
    setFeedback({ tipo, texto })
    feedbackTimerRef.current = window.setTimeout(() => {
      setFeedback((prev) => (prev?.texto === texto ? null : prev))
      feedbackTimerRef.current = null
    }, ms)
  }, [])

  // Derivar ruta seleccionada efectiva (resiliente si cambia la lista de rutas)
  const rutaSeleccionadaEfectiva = useMemo(
    () => rutasHabituales.find((r) => r.id === rutaSeleccionadaId) || rutasHabituales[0],
    [rutasHabituales, rutaSeleccionadaId]
  )
  const rutaSeleccionadaIdEfectiva = rutaSeleccionadaEfectiva?.id || ''

  // Derivar punto inspeccionado visible: se cierra automáticamente si el evento fue descartado o se entró en edición
  const puntoInspeccionadoVisible = useMemo(() => {
    if (!puntoInspeccionado || modoEdicionRuta || capaActiva === 'ruta') return null
    const sigueVigente = eventosRadar.some((e) => e.id === puntoInspeccionado.eventoId)
    return sigueVigente ? puntoInspeccionado : null
  }, [puntoInspeccionado, modoEdicionRuta, capaActiva, eventosRadar])

  const cambiarCapa = (nueva: FiltroCapa) => {
    setCapaActiva(nueva)
    setPuntoInspeccionado(null)
  }

  // 1. Inicializar mapa Leaflet + 5 LayerGroups + Capa Base fija + ResizeObserver + tileerror
  useEffect(() => {
    const container = mapContainerRef.current
    if (!container || mapInstanceRef.current) return

    const map = L.map(container, {
      center: [BASE_BEARS_RESERVE.lat, BASE_BEARS_RESERVE.lng],
      zoom: 12,
      zoomControl: true,
    })

    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)

    const onTileError = () => setErrorTiles(true)
    const onTileLoad = () => setErrorTiles(false)
    tiles.on('tileerror', onTileError)
    tiles.on('tileload', onTileLoad)

    const baseGroup = L.layerGroup().addTo(map)
    const rutasGroup = L.layerGroup().addTo(map)
    const radarGroup = L.layerGroup().addTo(map)
    const misionesGroup = L.layerGroup().addTo(map)
    const edicionGroup = L.layerGroup().addTo(map)

    baseLayerGroupRef.current = baseGroup
    rutasLayerGroupRef.current = rutasGroup
    radarLayerGroupRef.current = radarGroup
    misionesLayerGroupRef.current = misionesGroup
    edicionLayerGroupRef.current = edicionGroup
    mapInstanceRef.current = map

    // Capa 1: Base Central Finca El Guadual (fija, nunca se destruye al cambiar filtros)
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
        ">🐻</div>`,
      iconSize: [38, 38],
      iconAnchor: [19, 19],
    })

    L.marker([BASE_BEARS_RESERVE.lat, BASE_BEARS_RESERVE.lng], {
      icon: baseIcon,
      zIndexOffset: 500,
    })
      .bindPopup(`
        <div style="color: #0f172a; font-family: sans-serif; font-size: 12px; line-height: 1.4;">
          <b style="font-size: 14px; color: #b45309;">🏠 Finca El Guadual</b><br/>
          <b>Base Central Bear's Reserve</b><br/>
          Vereda San Peregrino, Manizales, Caldas<br/>
          <span style="font-size: 10px; color: #64748b;">5.069750, -75.590521</span>
        </div>
      `)
      .addTo(baseGroup)

    // Ajuste inicial tras pintar el contenedor + ResizeObserver para cambios de layout
    const rafId = window.requestAnimationFrame(() => {
      map.invalidateSize({ animate: false })
    })

    let resizeObs: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObs = new ResizeObserver(() => {
        map.invalidateSize({ animate: false })
      })
      resizeObs.observe(container)
    }

    return () => {
      window.cancelAnimationFrame(rafId)
      resizeObs?.disconnect()
      tiles.off('tileerror', onTileError)
      tiles.off('tileload', onTileLoad)
      map.remove()
      mapInstanceRef.current = null
      baseLayerGroupRef.current = null
      rutasLayerGroupRef.current = null
      radarLayerGroupRef.current = null
      misionesLayerGroupRef.current = null
      edicionLayerGroupRef.current = null
    }
  }, [])

  // Clic en el mapa para insertar parada en modo edición
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    const handleMapClick = (e: L.LeafletMouseEvent) => {
      if (!modoEdicionRef.current) return
      const arr = [...paradasEditandoRef.current]
      const seq = paradaNuevaSeqRef.current++
      const nuevoPunto = {
        nombre: `Parada #${seq} (Agregada en Mapa)`,
        lat: Number(e.latlng.lat.toFixed(6)),
        lng: Number(e.latlng.lng.toFixed(6)),
      }
      if (arr.length >= 2) {
        arr.splice(arr.length - 1, 0, nuevoPunto)
      } else {
        arr.push(nuevoPunto)
      }
      setCalculandoGps(true)
      setParadasEditando(arr)
    }

    map.on('click', handleMapClick)
    return () => {
      map.off('click', handleMapClick)
    }
  }, [])

  // 2. Capa de Rutas Habituales (independiente)
  useEffect(() => {
    const group = rutasLayerGroupRef.current
    if (!group) return
    group.clearLayers()

    if (modoEdicionRuta || (capaActiva !== 'todos' && capaActiva !== 'ruta')) {
      return
    }

    const controller = new AbortController()
    const rutasParaDibujar =
      capaActiva === 'todos'
        ? rutasHabituales
        : rutaSeleccionadaEfectiva
          ? [rutaSeleccionadaEfectiva]
          : []

    const paleta = ['#38bdf8', '#c084fc', '#10b981', '#f59e0b', '#ec4899', '#06b6d4']

    rutasParaDibujar.forEach((ruta, rIdx) => {
      const paradasRuta =
        ruta.coordenadasParadas && ruta.coordenadasParadas.length >= 2
          ? ruta.coordenadasParadas
          : paradasPorDefectoDeRuta(ruta)

      const color =
        ruta.tipoHorario === 'tarde'
          ? '#c084fc'
          : ruta.tipoHorario === 'manana'
            ? '#38bdf8'
            : ruta.tipoHorario === 'mercado_sabado'
              ? '#10b981'
              : paleta[rIdx % paleta.length]

      const linea = L.polyline(
        paradasRuta.map((p) => [p.lat, p.lng]),
        {
          color,
          weight: 4.5,
          opacity: 0.95,
          dashArray: ruta.tipoHorario === 'tarde' ? '6, 6' : undefined,
        }
      ).bindTooltip(`${escapeHtml(ruta.nombre)} (${ruta.distanciaKm || 0} km)`, { sticky: true })
      group.addLayer(linea)

      void trazarRutaCarreteraGps(paradasRuta, controller.signal)
        .then((resGps) => {
          if (!controller.signal.aborted && resGps && resGps.coordenadas.length > 0) {
            linea.setLatLngs(resGps.coordenadas)
          }
        })
        .catch(() => null)

      if (capaActiva === 'ruta' || ruta.id === rutaSeleccionadaIdEfectiva) {
        paradasRuta.forEach((p, idx) => {
          const esSalida = idx === 0
          const esRetorno = idx === paradasRuta.length - 1
          const badgeBg = esSalida ? '#f59e0b' : esRetorno ? '#10b981' : color
          const label = esSalida ? 'Salida' : esRetorno ? 'Retorno' : `#${idx}`

          const stopIcon = L.divIcon({
            className: 'custom-stop-icon',
            html: `
              <div style="
                background: ${badgeBg};
                color: #04241a;
                font-weight: 900;
                font-size: ${esSalida || esRetorno ? '10px' : '11px'};
                padding: ${esSalida || esRetorno ? '2px 7px' : '0'};
                min-width: ${esSalida || esRetorno ? 'auto' : '24px'};
                height: 24px;
                border-radius: ${esSalida || esRetorno ? '12px' : '50%'};
                display: flex;
                align-items: center;
                justify-content: center;
                border: 2px solid white;
                box-shadow: 0 0 10px ${badgeBg};
                white-space: nowrap;
              ">${label}</div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          })

          const marker = L.marker([p.lat, p.lng], { icon: stopIcon }).bindPopup(`
            <div style="color: #0f172a; font-size: 11px; font-family: sans-serif;">
              <b>🚌 Parada ${label} (${escapeHtml(ruta.nombre)}):</b><br/>
              <span style="font-weight: bold; color: #0284c7;">${escapeHtml(p.nombre)}</span><br/>
              <span style="font-size: 10px; color: #64748b;">${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</span>
            </div>
          `)
          group.addLayer(marker)
        })
      }
    })

    return () => {
      controller.abort()
    }
  }, [rutasHabituales, capaActiva, rutaSeleccionadaEfectiva, rutaSeleccionadaIdEfectiva, modoEdicionRuta])

  // 3. Capa de Eventos del Radar (independiente, nunca oculta San Peregrino)
  useEffect(() => {
    const group = radarLayerGroupRef.current
    if (!group) return
    group.clearLayers()

    if (modoEdicionRuta || (capaActiva !== 'todos' && capaActiva !== 'radar')) {
      return
    }

    let indiceBase = 0
    eventosRadar.forEach((ev) => {
      if (
        typeof ev.lat !== 'number' ||
        !Number.isFinite(ev.lat) ||
        typeof ev.lng !== 'number' ||
        !Number.isFinite(ev.lng)
      ) {
        return
      }

      const pos = coordenadasConJitterBase(ev.lat, ev.lng, indiceBase)
      if (pos.lat !== ev.lat || pos.lng !== ev.lng) {
        indiceBase++
      }

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
          ">${badge}</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      })

      const marker = L.marker([pos.lat, pos.lng], { icon: evIcon })
        .bindPopup(`
          <div style="color: #0f172a; font-family: sans-serif; font-size: 11px; max-width: 220px;">
            <b style="color: ${color}; font-size: 12px;">${ev.esNoticiaWebReal ? '✓ Noticia Web Real' : '📻 Auxilio Comunitario'}</b><br/>
            <b>${escapeHtml(ev.titulo)}</b><br/>
            <span style="color: #475569;">📍 ${escapeHtml(ev.lugar)}</span><br/>
            <p style="margin: 4px 0; font-size: 10px; color: #334155;">${escapeHtml(ev.resumen)}</p>
          </div>
        `)
        .on('click', () => {
          const logistica = estimarLogisticaMisionDesdeBase({
            lat: ev.lat,
            lng: ev.lng,
            lugar: ev.lugar,
            departamento: ev.departamento,
            titulo: ev.titulo,
            esEmergenciaGrave: ev.esEmergenciaGrave,
          })
          setPuntoInspeccionado({
            eventoId: ev.id,
            titulo: ev.titulo,
            lugar: ev.lugar,
            lat: ev.lat!,
            lng: ev.lng!,
            kmIda: logistica.distanciaKmIda,
            kmIdaYVuelta: logistica.distanciaKmTotalIdaYVuelta,
            minutosRodamiento: logistica.minutosRodamientoTotal,
            minutosServicio: logistica.minutosServicioEnSitio,
            duracionTotal: logistica.duracionTotalMinutos,
            categoriaDistancia: logistica.categoriaDistancia,
          })
          if (onSeleccionarEventoRef.current) onSeleccionarEventoRef.current(ev)
        })

      group.addLayer(marker)

      const rutaContingencia = L.polyline(
        [
          [BASE_BEARS_RESERVE.lat, BASE_BEARS_RESERVE.lng],
          [pos.lat, pos.lng],
        ],
        { color, weight: 2.5, opacity: 0.7, dashArray: '4, 4' }
      )
      group.addLayer(rutaContingencia)
    })
  }, [eventosRadar, capaActiva, modoEdicionRuta])

  // 4. Capa de Misiones Activas en Curso (independiente, con marcador de destino y popup)
  useEffect(() => {
    const group = misionesLayerGroupRef.current
    if (!group) return
    group.clearLayers()

    if (modoEdicionRuta) return

    const controller = new AbortController()

    misiones.forEach((mActiva, idx) => {
      if (
        typeof mActiva.latDestino !== 'number' ||
        !Number.isFinite(mActiva.latDestino) ||
        typeof mActiva.lngDestino !== 'number' ||
        !Number.isFinite(mActiva.lngDestino)
      ) {
        return
      }

      const pos = coordenadasConJitterBase(mActiva.latDestino, mActiva.lngDestino, idx + 2)
      const rutaMision = L.polyline(
        [
          [BASE_BEARS_RESERVE.lat, BASE_BEARS_RESERVE.lng],
          [pos.lat, pos.lng],
        ],
        { color: '#10b981', weight: 4.5, opacity: 0.95 }
      ).bindTooltip(`Misión Activa: ${escapeHtml(mActiva.titulo)}`, {
        permanent: false,
        sticky: true,
      })
      group.addLayer(rutaMision)

      const misionIcon = L.divIcon({
        className: 'custom-mision-icon',
        html: `
          <div style="
            background: #10b981;
            color: #04241a;
            font-weight: 900;
            font-size: 12px;
            border-radius: 9999px;
            width: 28px;
            height: 28px;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2px solid #ffffff;
            box-shadow: 0 0 14px #10b981;
          ">🚨</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      })

      const flotaTxt =
        mActiva.vehiculosAsignados?.map((v) => v.nombre).join(', ') || 'Flota en camino'
      const destMarker = L.marker([pos.lat, pos.lng], { icon: misionIcon }).bindPopup(`
        <div style="color: #0f172a; font-family: sans-serif; font-size: 11px; max-width: 220px;">
          <b style="color: #059669; font-size: 12px;">🚨 Misión Activa en Curso</b><br/>
          <b>${escapeHtml(mActiva.titulo)}</b><br/>
          <span style="color: #475569;">📍 ${escapeHtml(mActiva.destino)}</span><br/>
          <span style="color: #334155;">🚚 ${escapeHtml(flotaTxt)}</span><br/>
          <span style="font-size: 10px; color: #64748b;">${mActiva.distanciaKmIdaYVuelta} km · ~${formatearDuracionCorta(mActiva.duracionMinutos)}</span>
        </div>
      `)
      group.addLayer(destMarker)

      void trazarRutaCarreteraGps(
        [BASE_BEARS_RESERVE, { lat: mActiva.latDestino, lng: mActiva.lngDestino }],
        controller.signal
      )
        .then((resGps) => {
          if (!controller.signal.aborted && resGps && resGps.coordenadas.length > 0) {
            rutaMision.setLatLngs(resGps.coordenadas)
          }
        })
        .catch(() => null)
    })

    return () => {
      controller.abort()
    }
  }, [misiones, modoEdicionRuta])

  // 5. Capa de Modo Edición Interactivo (independiente, con debounce ~250ms + AbortController)
  useEffect(() => {
    const group = edicionLayerGroupRef.current
    if (!group) return
    group.clearLayers()

    if (!modoEdicionRuta) return

    const controller = new AbortController()
    const polylineEdicion = L.polyline(
      paradasEditando.map((p) => [p.lat, p.lng]),
      { color: '#38bdf8', weight: 5, opacity: 0.95 }
    )
    group.addLayer(polylineEdicion)

    paradasEditando.forEach((p, idx) => {
      const esBase = idx === 0 || idx === paradasEditando.length - 1
      const badgeColor = esBase ? '#f59e0b' : '#38bdf8'
      const label = esBase ? (idx === 0 ? 'Salida' : 'Retorno') : `#${idx}`

      const dragIcon = L.divIcon({
        className: 'drag-stop-icon',
        html: `
          <div style="
            background: ${badgeColor};
            color: #04241a;
            font-weight: 900;
            font-size: 11px;
            border-radius: 9999px;
            width: 28px;
            height: 28px;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2px solid #ffffff;
            box-shadow: 0 0 14px ${badgeColor};
            cursor: grab;
          ">${label}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      })

      const marker = L.marker([p.lat, p.lng], { icon: dragIcon, draggable: true })

      marker.on('dragend', (event) => {
        const latlng = (event.target as L.Marker).getLatLng()
        const nuevas = [...paradasEditandoRef.current]
        nuevas[idx] = {
          ...nuevas[idx],
          lat: Number(latlng.lat.toFixed(6)),
          lng: Number(latlng.lng.toFixed(6)),
        }
        setCalculandoGps(true)
        setParadasEditando(nuevas)
      })

      const popupContent = document.createElement('div')
      popupContent.style.cssText =
        'color: #0f172a; font-family: sans-serif; font-size: 11px; padding: 2px;'
      popupContent.innerHTML = `
        <b>Parada ${label}:</b><br/>
        <span style="font-weight: 600; color: #0284c7;">${escapeHtml(p.nombre)}</span><br/>
        <span style="font-size: 10px; color: #64748b;">${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</span>
        <div style="margin-top: 6px; font-size: 10px; color: #475569;">
          💡 <i>Arrastra este marcador para mover la parada.</i>
        </div>
      `

      if (!esBase && paradasEditando.length > 2) {
        const btnEliminar = document.createElement('button')
        btnEliminar.textContent = '🗑️ Eliminar parada'
        btnEliminar.style.cssText =
          'margin-top: 8px; width: 100%; background: #fee2e2; color: #b91c1c; border: 1px solid #f87171; border-radius: 6px; padding: 3px 6px; font-size: 10px; font-weight: bold; cursor: pointer;'
        btnEliminar.onclick = () => {
          setCalculandoGps(true)
          setParadasEditando(paradasEditandoRef.current.filter((_, i) => i !== idx))
        }
        popupContent.appendChild(btnEliminar)
      }

      marker.bindPopup(popupContent)
      group.addLayer(marker)
    })

    // Debounce ~250ms antes de consultar OSRM para no saturar al arrastrar/agregar varios pines
    const timerId = window.setTimeout(() => {
      void trazarRutaCarreteraGps(paradasEditando, controller.signal)
        .then((res) => {
          if (controller.signal.aborted) return
          setCalculandoGps(false)
          if (res && res.coordenadas.length > 0) {
            polylineEdicion.setLatLngs(res.coordenadas)
            setDistanciaGpsLive(res.distanciaKm)
            setTiempoGpsLive(res.duracionMinutos)
            setUsoFallbackHaversine(false)
          } else {
            const estimacion = calcularDistanciaRutaParadas(paradasEditando, true)
            setDistanciaGpsLive(estimacion.distanciaKm)
            setTiempoGpsLive(estimacion.minutosRodamiento)
            setUsoFallbackHaversine(true)
          }
        })
        .catch(() => {
          if (controller.signal.aborted) return
          setCalculandoGps(false)
          const estimacion = calcularDistanciaRutaParadas(paradasEditando, true)
          setDistanciaGpsLive(estimacion.distanciaKm)
          setTiempoGpsLive(estimacion.minutosRodamiento)
          setUsoFallbackHaversine(true)
        })
    }, 250)

    return () => {
      window.clearTimeout(timerId)
      controller.abort()
    }
  }, [modoEdicionRuta, paradasEditando])

  const centrarCapa = useCallback(() => {
    const map = mapInstanceRef.current
    if (!map) return
    const puntos: L.LatLngExpression[] = [[BASE_BEARS_RESERVE.lat, BASE_BEARS_RESERVE.lng]]

    const recolectarGrupo = (group: L.LayerGroup | null) => {
      if (!group) return
      group.eachLayer((layer) => {
        if (layer instanceof L.Marker) {
          puntos.push(layer.getLatLng())
        } else if (layer instanceof L.Polyline) {
          const latlngs = layer.getLatLngs()
          const aplanar = (arr: unknown): void => {
            if (Array.isArray(arr)) {
              for (const it of arr) aplanar(it)
            } else if (arr && typeof arr === 'object' && 'lat' in arr && 'lng' in arr) {
              puntos.push(arr as L.LatLng)
            }
          }
          aplanar(latlngs)
        }
      })
    }

    if (modoEdicionRuta) {
      recolectarGrupo(edicionLayerGroupRef.current)
    } else {
      if (capaActiva === 'ruta' || capaActiva === 'todos') {
        recolectarGrupo(rutasLayerGroupRef.current)
      }
      if (capaActiva === 'radar' || capaActiva === 'todos') {
        recolectarGrupo(radarLayerGroupRef.current)
      }
      recolectarGrupo(misionesLayerGroupRef.current)
    }

    if (puntos.length <= 1) {
      map.setView([BASE_BEARS_RESERVE.lat, BASE_BEARS_RESERVE.lng], 12)
      return
    }
    const bounds = L.latLngBounds(puntos)
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 14 })
    }
  }, [capaActiva, modoEdicionRuta])

  const iniciarEdicionRuta = useCallback(
    (rutaId?: string) => {
      const targetId = rutaId || rutaSeleccionadaIdEfectiva
      const ruta = rutasHabituales.find((r) => r.id === targetId) || rutasHabituales[0]
      if (!ruta) return

      const paradasIniciales =
        ruta.coordenadasParadas && ruta.coordenadasParadas.length >= 2
          ? [...ruta.coordenadasParadas]
          : paradasPorDefectoDeRuta(ruta)

      setPuntoInspeccionado(null)
      setRutaIdEditando(ruta.id)
      setRutaSeleccionadaId(ruta.id)
      setParadasEditando(paradasIniciales)
      setDistanciaGpsLive(ruta.distanciaKm || 38.4)
      setTiempoGpsLive(ruta.minutosRodamiento || 55)
      setUsoFallbackHaversine(false)
      setCalculandoGps(true)
      setModoEdicionRuta(true)
    },
    [rutasHabituales, rutaSeleccionadaIdEfectiva]
  )

  const guardarTrazadoEditado = async () => {
    if (calculandoGps || guardando) return
    const ruta = rutasHabituales.find((r) => r.id === rutaIdEditando)
    if (!ruta) return
    if (paradasEditando.length < 2) {
      mostrarFeedback('error', 'La ruta debe tener al menos 2 paradas para guardarse.')
      return
    }

    const fallbackCalc = calcularDistanciaRutaParadas(paradasEditando, true)
    const kmFinal =
      distanciaGpsLive > 0 ? distanciaGpsLive : fallbackCalc.distanciaKm || ruta.distanciaKm
    const tiempoRodamientoFinal =
      tiempoGpsLive > 0
        ? tiempoGpsLive
        : fallbackCalc.minutosRodamiento || ruta.minutosRodamiento || 55
    const ralenti = ruta.minutosRalenti ?? 35

    const rutaGuardada: RutaHabitual = {
      ...ruta,
      coordenadasParadas: [...paradasEditando],
      distanciaKm: kmFinal,
      minutosRodamiento: tiempoRodamientoFinal,
      duracionMinutos: tiempoRodamientoFinal + ralenti,
    }

    setGuardando(true)
    try {
      if (onActualizarRuta) {
        await onActualizarRuta(rutaGuardada)
      }
      setRutaSeleccionadaId(rutaGuardada.id)
      setCapaActiva('ruta')
      mostrarFeedback(
        'ok',
        `✅ Trazado de "${rutaGuardada.nombre}" guardado en Firestore (${paradasEditando.length} paradas · ${kmFinal} km).`
      )
      setModoEdicionRuta(false)
    } catch (e: unknown) {
      mostrarFeedback(
        'error',
        e instanceof Error ? e.message : 'No se pudo guardar el trazado editado.'
      )
    } finally {
      setGuardando(false)
    }
  }

  const restablecerParadasOriginales = () => {
    const ruta = rutasHabituales.find((r) => r.id === rutaIdEditando)
    setCalculandoGps(true)
    setParadasEditando(paradasPorDefectoDeRuta(ruta))
  }

  const eventosConCoordsCount = eventosRadar.filter(
    (e) => typeof e.lat === 'number' && Number.isFinite(e.lat) && typeof e.lng === 'number' && Number.isFinite(e.lng)
  ).length

  return (
    <div className="space-y-3">
      {feedback && (
        <div
          className={`rounded-2xl border p-3 text-xs font-bold flex items-center gap-2 shadow-lg ${
            feedback.tipo === 'error'
              ? 'border-red-400/40 bg-red-500/15 text-red-200'
              : 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
          }`}
        >
          {feedback.tipo === 'error' ? (
            <AlertTriangle className="h-4 w-4 text-red-300 shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          )}
          <span>{feedback.texto}</span>
        </div>
      )}

      {/* Barra de control */}
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
              San Peregrino, Manizales · 5.069750, -75.590521 · Delineado GPS por Carreteras
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {!modoEdicionRuta ? (
            <>
              <div className="flex items-center gap-1.5 rounded-lg border border-sky-400/30 bg-sky-500/10 px-2 py-1">
                <span className="text-[10px] font-bold text-sky-300">Ruta:</span>
                <select
                  value={rutaSeleccionadaIdEfectiva}
                  onChange={(e) => {
                    setRutaSeleccionadaId(e.target.value)
                    cambiarCapa('ruta')
                  }}
                  className="bg-transparent text-[11px] font-bold text-white outline-none cursor-pointer max-w-[210px] truncate"
                >
                  {rutasHabituales.map((r) => (
                    <option key={r.id} value={r.id} className="bg-night-900 text-white">
                      {r.nombre} ({r.distanciaKm || 0} km)
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => cambiarCapa('ruta')}
                className={`cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                  capaActiva === 'ruta'
                    ? 'bg-sky-400/25 text-sky-200 border border-sky-400/40 shadow-sm'
                    : 'bg-white/[0.04] text-mist-400 hover:text-white'
                }`}
              >
                📍 Ver Ruta
              </button>

              <button
                type="button"
                onClick={() => cambiarCapa('todos')}
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
                onClick={() => cambiarCapa('radar')}
                className={`cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                  capaActiva === 'radar'
                    ? 'bg-red-400/20 text-red-200 border border-red-400/30'
                    : 'bg-white/[0.04] text-mist-400 hover:text-white'
                }`}
              >
                <Radio className="h-3 w-3 inline mr-1" />
                Radar
              </button>

              <button
                type="button"
                onClick={centrarCapa}
                title="Ajustar zoom y centro a todos los elementos visibles"
                className="cursor-pointer inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] font-bold text-mist-300 hover:bg-white/10 hover:text-white transition"
              >
                <Crosshair className="h-3 w-3 text-emerald-300" />
                <span>Centrar capa</span>
              </button>

              <button
                type="button"
                onClick={() => iniciarEdicionRuta(rutaSeleccionadaIdEfectiva)}
                className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg border border-sky-400/40 bg-gradient-to-r from-sky-500/20 to-teal-500/20 px-3 py-1 text-[11px] font-black text-sky-200 hover:brightness-125 transition"
              >
                <Move className="h-3.5 w-3.5 text-sky-400" />
                <span>✏️ Arrastrar / Moldear Ruta</span>
              </button>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-extrabold text-sky-300">Editando:</span>
              <select
                value={rutaIdEditando}
                onChange={(e) => iniciarEdicionRuta(e.target.value)}
                className="field-dark h-7 rounded-lg px-2 text-[11px] font-bold text-amber-200"
              >
                {rutasHabituales.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
              </select>

              <button
                type="button"
                disabled={calculandoGps || guardando}
                onClick={() => void guardarTrazadoEditado()}
                className="cursor-pointer inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-400 px-3 py-1 text-[11px] font-black text-[#04241a] hover:brightness-110 disabled:opacity-45"
              >
                <Save className="h-3.5 w-3.5" />
                <span>
                  {guardando ? 'Guardando...' : calculandoGps ? 'Calculando...' : 'Guardar Trazado'}
                </span>
              </button>

              <button
                type="button"
                disabled={guardando}
                onClick={restablecerParadasOriginales}
                className="cursor-pointer rounded-lg bg-white/10 px-2.5 py-1 text-[11px] text-mist-300 hover:text-white disabled:opacity-40"
              >
                Restablecer
              </button>

              <button
                type="button"
                disabled={guardando}
                onClick={() => setModoEdicionRuta(false)}
                className="cursor-pointer inline-flex items-center gap-1 rounded-lg bg-rose-500/20 border border-rose-500/30 px-2.5 py-1 text-[11px] font-bold text-rose-300 hover:bg-rose-500/30 disabled:opacity-40"
              >
                <X className="h-3 w-3" />
                <span>Salir</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Banner informativo adaptado a la capa activa */}
      {modoEdicionRuta ? (
        <div className="rounded-2xl border border-sky-400/40 bg-sky-500/[0.08] p-3 text-xs shadow-xl backdrop-blur-md flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-400/20 text-sky-300">
              <Move className="h-4 w-4" />
            </span>
            <div>
              <div className="font-extrabold text-white text-[11px]">
                Modo Interactivo de Trazado Activo
              </div>
              <div className="text-[10px] text-mist-300">
                🖐️ <b>Arrastra los pines</b> para mover paradas. ➕ <b>Haz clic en el mapa</b> para insertar una parada nueva.
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-xl border border-white/10 bg-black/50 px-2.5 py-1 text-[11px]">
              <span className="text-mist-400">
                {usoFallbackHaversine ? 'Distancia montaña est.: ' : 'Distancia OSRM: '}
              </span>
              <span className="font-mono font-black text-amber-300">{distanciaGpsLive} km</span>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/50 px-2.5 py-1 text-[11px]">
              <span className="text-mist-400">Tiempo Rodando: </span>
              <span className="font-mono font-black text-sky-300">~{tiempoGpsLive} min</span>
            </div>
            {calculandoGps && (
              <span className="text-[10px] text-amber-400 font-bold animate-pulse">
                🔄 Recalculando carretera...
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/[0.08] bg-black/30 px-3 py-2 text-[11px] text-mist-400 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <RouteIcon className="h-3.5 w-3.5 text-sky-400 shrink-0" />
            {capaActiva === 'ruta' && (
              <span>
                <b>Trazado en Pantalla:</b> {rutaSeleccionadaEfectiva?.nombre || 'Ruta'} (
                {rutaSeleccionadaEfectiva?.distanciaKm || 0} km) ·{' '}
                {rutaSeleccionadaEfectiva?.coordenadasParadas?.length || 0} paradas guardadas.
              </span>
            )}
            {capaActiva === 'radar' && (
              <span>
                <b>Capa Radar Activa:</b> {eventosConCoordsCount} alerta(s) geolocalizada(s) y{' '}
                {misiones.length} misión(es) en curso. Haz clic en cualquier marcador para inspeccionar logística.
              </span>
            )}
            {capaActiva === 'todos' && (
              <span>
                <b>Vista Completa:</b> {rutasHabituales.length} ruta(s) habitual(es) ·{' '}
                {eventosConCoordsCount} alerta(s) en radar · {misiones.length} misión(es) en curso.
              </span>
            )}
          </div>
          <span className="text-[10px] text-amber-300 font-bold">
            {errorTiles ? '⚠️ Mapa sin conexión (tiles limitados)' : '✓ Red vial OpenStreetMap OSRM'}
          </span>
        </div>
      )}

      {/* Contenedor Leaflet */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 shadow-2xl">
        <div
          ref={mapContainerRef}
          className="h-[460px] w-full bg-[#0b1320] [&_.leaflet-tile]:brightness-[0.68] [&_.leaflet-tile]:invert [&_.leaflet-tile]:contrast-[2.2] [&_.leaflet-tile]:hue-rotate-[195deg] [&_.leaflet-tile]:saturate-[0.35]"
        />

        <div className="pointer-events-none absolute bottom-3 left-3 z-[400] flex flex-col gap-1 rounded-2xl border border-white/10 bg-black/80 p-2.5 text-[10px] text-mist-300 backdrop-blur-md">
          <div className="flex items-center gap-1.5 font-bold text-white">
            <span className="text-amber-400">🐻</span>
            <span>Base Central Finca El Guadual</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-sky-400" />
            <span>Ruta Escolar Matutina (06:00)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-purple-400" />
            <span>Ruta Escolar Vespertina (15:00)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span>Mercado Campesino / Misión Activa</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-red-400" />
            <span>Contingencias / Radar</span>
          </div>
        </div>

        {puntoInspeccionadoVisible && (
          <div className="absolute top-3 left-3 right-3 z-[400] rounded-2xl border border-amber-400/30 bg-night-950/90 p-3 text-xs shadow-2xl backdrop-blur-md sm:left-auto sm:right-3 sm:w-72">
            <div className="flex items-start justify-between gap-1 border-b border-white/10 pb-2">
              <div className="min-w-0">
                <div className="font-extrabold text-white text-[11px] leading-tight">
                  {puntoInspeccionadoVisible.titulo}
                </div>
                <div className="truncate text-[10px] text-amber-300">
                  {puntoInspeccionadoVisible.lugar}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPuntoInspeccionado(null)}
                className="cursor-pointer text-mist-400 hover:text-white shrink-0"
              >
                ✕
              </button>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
              <div className="rounded-xl border border-white/[0.06] bg-black/40 p-2">
                <div className="text-mist-400 flex items-center gap-1 font-bold">
                  <Navigation className="h-3 w-3 text-emerald-400" />
                  <span>Distancia Est.</span>
                </div>
                <div className="font-mono text-sm font-black text-white mt-0.5">
                  {puntoInspeccionadoVisible.kmIdaYVuelta} km
                </div>
                <div className="text-[9px] text-mist-500">
                  Ida {puntoInspeccionadoVisible.kmIda} km · Ida y vuelta
                </div>
              </div>

              <div className="rounded-xl border border-white/[0.06] bg-black/40 p-2">
                <div className="text-mist-400 flex items-center gap-1 font-bold">
                  <Clock className="h-3 w-3 text-sky-400" />
                  <span>Logística Total</span>
                </div>
                <div className="font-mono text-sm font-black text-white mt-0.5">
                  ~{formatearDuracionCorta(puntoInspeccionadoVisible.duracionTotal)}
                </div>
                <div className="text-[9px] text-mist-500">
                  {formatearDuracionCorta(puntoInspeccionadoVisible.minutosRodamiento)} ruta +{' '}
                  {formatearDuracionCorta(puntoInspeccionadoVisible.minutosServicio)} sitio
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

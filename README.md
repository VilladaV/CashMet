# CashMet

CashMet es una aplicación web/PWA privada para gestión económica personal con IA (**chat-first**) pensada para Colombia (COP), complementada con **Bear's Reserve**, un portal operativo integrado para gestión de flota comunitaria, turnos 24/7 y despacho de misiones.

## Módulos principales

### 1. CashMet (Finanzas personales con IA)
- **Chat IA con Lucía** (`src/ai/gemini.ts` + `src/features/chat/`): contadora personal en lenguaje natural con contexto financiero en vivo, memoria conversacional, detección de múltiples transacciones por mensaje, conversión multidivisa a COP con tasa del día (`src/lib/fx.ts`) y fallback automático al motor NL local (`src/ai/parser/nl.ts` + `src/features/chat/engine.ts`).
- **Gestión financiera integral**: Dashboard con historial completo y exportación compacta, Cuentas bancarias, Transferencias atómicas (`runTransaction`), Deudas con pago de cuotas y cierre automático, Vehículos (garaje, SOAT/TM/STR, mantenimiento e investigación técnica con Gemini), Propiedades, Nómina (salarios, adicional ARL/seguridad social y primas julio/diciembre), Gastos recurrentes, Impuestos, Calendario con sincronización opcional a Google Calendar (OAuth GIS en memoria) y Backup JSON/CSV.
- **Piloto automático** (`src/lib/piloto.ts`): ejecución idempotente al iniciar sesión para recurrentes, salario propio, nóminas, deudas e impuestos automáticos.

### 2. Bear's Reserve (Operaciones de flota y guardia comunitaria)
Accesible desde la barra superior o `#bears` (`src/features/bearsReserve/`):
- **Gestión operativa de flota**: sincronizada con los vehículos de CashMet, control de tanque de combustible, autonomía real por terreno, odómetro y desgaste de llantas.
- **Mapa interactivo con Leaflet + OSRM** (`MapaOperaciones.tsx`, `ruteoGps.ts`, `geo.ts`): visualización de base (Finca El Guadual, Manizales/Caldas), rutas reales por carretera con OSRM, geocodificación y misiones activas.
- **Turnos 24/7**: cuadrante semanal con tope de 42 h por operario, restricciones horarias y rotación automática.
- **Tarjeta de combustible mensual**: precios de corriente/ACPM/extra en Colombia, registro de tanqueos y liquidación vinculada a CashMet.
- **GEMA IA + Radar RSS Colombia** (`gemaAI.ts`, `gemaEngine.ts`): radio conversacional con acciones operativas, selección inteligente de vehículo o convoy (1–3 vehículos), resolución narrativa de misiones y radar de emergencias curado desde 6 feeds RSS de prensa colombiana en vivo (La Patria, El Tiempo CO/Regiones/Antioquia/Valle, Caracol Radio) o Google Search Grounding.

## Stack tecnológico
- **Frontend**: React 19 + TypeScript + Vite 8 (carga diferida con `React.lazy` y chunks separados para `firebase`, `leaflet`, `lucide`, `motion` y `vendor`)
- **Estilos y UI**: Tailwind CSS v4 + `lucide-react` + `motion` (tema oscuro con `ErrorBoundary`, sidebar en escritorio y dock móvil)
- **IA**: Gemini API REST directo (`src/ai/gemini.ts`, `gemini-3.1-flash-lite` con cadena de fallback y grounding opcional; sin dependencia de Genkit)
- **Backend / Datos**: Firebase Auth (Email/Password), Cloud Firestore (transacciones atómicas `runTransaction` y lotes) y Firebase Storage (fotos/PDFs de vehículos)
- **Mapas y ruteo**: Leaflet + OSRM
- **PWA**: `vite-plugin-pwa` con actualización automática (`autoUpdate`) y `favicon.svg`
- **Pruebas y calidad**: Vitest 5 + jsdom + Testing Library + `@vitest/coverage-v8` + `oxlint`

## Inicio rápido
1. Copiar `.env.example` a `.env.local` y completar las credenciales de Firebase (`VITE_FIREBASE_*`).
2. *(Opcional, para IA real con Lucía y GEMA)* Configurar `VITE_GEMINI_API_KEY` (y opcionalmente `VITE_GEMINI_MODEL`). Sin clave, el chat usa el motor NL local.
3. *(Opcional, para sincronización con Google Calendar)* Configurar `VITE_GOOGLE_CALENDAR_CLIENT_ID`.
4. Instalar dependencias y levantar entorno local:
   ```bash
   npm install
   npm run dev
   ```

## Comandos disponibles

| Comando | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo Vite |
| `npm run lint` | Análisis estático con `oxlint` |
| `npm run test` | Ejecuta la suite automatizada de pruebas con Vitest |
| `npm run test:watch` | Ejecuta Vitest en modo observación |
| `npm run coverage` | Genera reporte de cobertura con `@vitest/coverage-v8` |
| `npm run build` | Verifica tipos (`tsc -b`) y construye el bundle de producción + PWA |
| `npm run preview` | Sirve localmente la compilación en `dist/` |

## Arquitectura real

```text
src/
├── ai/
│   ├── gemini.ts              # Cliente REST directo de Gemini (Lucía, grounding, ficha técnica)
│   └── parser/nl.ts           # Parser determinista en español (fechas, montos, conceptos)
├── components/                # UI reutilizable, ErrorBoundary, CrudPage, Contador, marca
├── features/
│   ├── auth/                  # Login privado (solo inicio de sesión)
│   ├── backup/                # Exportación/importación JSON y CSV compacto
│   ├── bearsReserve/          # Portal operativo (flota, Leaflet/OSRM, turnos, combustible, GEMA IA)
│   ├── calendario/            # Cuadrícula mensual, vencimientos y Google Calendar
│   ├── chat/                  # Chat IA con Lucía, snapshot financiero y tarjetas de confirmación
│   ├── cuentas/               # Cuentas bancarias y efectivo
│   ├── dashboard/             # Saldos, resumen mensual e historial completo
│   ├── deudas/                # Créditos, tarjetas y pagos transaccionales
│   ├── impuestos/             # Impuestos y pago automático
│   ├── nomina/                # Empleados, salarios, ARL/seguridad social y primas
│   ├── propiedades/           # Inmuebles y valor patrimonial
│   ├── recurrentes/           # Gastos fijos y autogeneración mensual
│   └── vehiculos/             # Garaje, SOAT/TM/STR, mantenimiento y Storage
└── lib/
    ├── fechas.ts              # Fechas en zona local (sin corrimientos UTC)
    ├── fx.ts                  # Tasas de cambio diarias a COP
    ├── piloto.ts              # Piloto automático mensual idempotente
    ├── google/calendar.ts     # Integración OAuth GIS (token solo en memoria)
    └── firebase/              # Repositorios transaccionales Firestore, Auth, Storage y Backup
```

## Seguridad
- App privada de un único usuario: el registro público está deshabilitado en el cliente.
- Nunca commitear `.env.local` ni credenciales.
- `VITE_GEMINI_API_KEY` viaja en el bundle del cliente: **restringirla en Google AI Studio por HTTP referrer** a los dominios autorizados de Firebase Hosting. Para mantener la clave 100% server-side, migrar el proxy a Cloud Functions (plan Blaze).
- El token OAuth de Google Calendar vive únicamente en memoria (no se persiste en `localStorage`).

## Documentación
- `docs/PLAN_COMPLETO.md` — plan y estado actualizado del proyecto
- `DEPLOY.md` — guía de despliegue a Firebase Hosting y respaldos
- `docs/prompts/SYSTEM_PROMPT.md` — prompts activos de Lucía y GEMA
- `docs/auditoria/INFORME_FINAL.md` — informe y adenda de auditoría técnica

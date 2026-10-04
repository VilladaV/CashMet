# PLAN COMPLETO - CashMet (Gestión Económica Personal con IA)

> **Objetivo Final**: Crear una aplicación web privada (uso propio) para gestionar economía personal mediante un chat con IA. El usuario escribe sus gastos en lenguaje natural, la IA los interpreta, clasifica y actualiza la base de datos automáticamente. Debe gestionar: dinero en banco, deudas, vehículos, propiedades, nómina, gastos recurrentes, impuestos y calendario de vencimientos. Accesible desde móvil fuera de casa, privada, sin publicación/venta.

---

## 1. PRINCIPIOS Y ALCANCE

- **Uso exclusivo**: Aplicación privada (1 único usuario). Sin multiusuario, sin intenciones comerciales.
- **Chat-first**: Interfaz principal es un chat donde el usuario escribe en español ("gasté 30.000 en almuerzo", "pagué cuota de crédito", etc.). IA actualiza BD y responde con confirmación/resumen.
- **Automatización**: Gastos mensuales mínimos, nómina (salarios + primas julio/diciembre), vencimientos (SOAT, tecnomecánica, seguro todo riesgo, impuestos, sueldos, recibo de nómina propio, etc.)
- **Colombia-first**: Todos los valores/investigación para vehículos, seguros e impuestos deben basarse en normativa/valores actuales de Colombia.
- **Cero costo**: Usar únicamente herramientas gratuitas (Genkit + Gemini Free Tier, Firestore en modo gratuito si aplica, hosting gratuito con túnel, PWA).
- **Contexto recuperable**: Este documento es la fuente única de verdad para reiniciar contexto en cualquier momento.

---

## 2. STACK TECNOLÓGICO (RECOMENDADO)

Tras evaluar para chat+IA+Firestore+PWA+móvil fuera de casa (gratis), se recomienda:

| Capa | Tecnología | Motivo |
|---|---|---|
| **Frontend** | [Vite](https://vitejs.dev/) + [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) | Ligero, rápido, PWA fácil, ideal para móvil. |
| **UI** | [Tailwind CSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/) | Consistente, moderno, accesible. |
| **Backend/API** | [Firebase Functions](https://firebase.google.com/products/functions) (Gen 2) o [Next.js API Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers) + [Vercel](https://vercel.com/) alternativa? / **Cloud Functions + Hosting** | Mejor integración con Firestore/Auth. Gratis con límites razonables para uso personal. Alternativa: Node+Express desplegado (Railway/Render/Fly.io) pero Firestore directo desde cliente + Functions para IA segura. |
| **PWA** | [Vite PWA](https://vite-pwa-org.netlify.app/) | Instalable en Android/iOS, offline básico, Web Push. |
| **IA** | [Genkit](https://genkit.dev/) + [Google AI (Gemini)](https://ai.google.dev/gemini-api/docs) Free Tier | Gratis, orquestación de flows, herramientas (tools), esquemas, fácil Colombia. Cumple requisito "IA gratuita con Genkit y Gemini free tier". |
| **BD** | [Cloud Firestore](https://firebase.google.com/products/firestore) | Requisito usuario (guiado con él). Gratis (Spark). Sincronización offline, móvil, escalable, seguro con reglas. |
| **Auth** | [Firebase Authentication](https://firebase.google.com/products/auth) | Email+Password mínimo (único usuario). Simple, gratis. |
| **Calendario** | [Google Calendar API](https://developers.google.com/calendar/api) (OAuth) | Óptimo. Crear/actualizar eventos recurrentes, recordatorios nativos. Fallback: .ICS exportable. |
| **Push** | [Firebase Cloud Messaging (FCM)](https://firebase.google.com/products/cloud-messaging) + Service Worker (Web Push) | Funciona PWA móvil (Android/iOS). Requiere VAPID keys. Ver compatibilidad iOS (PWA+Web Push limitado). |
| **Despliegue** | [Firebase Hosting](https://firebase.google.com/products/hosting) + **Cloudflare Tunnel** (o Tailscale) para acceso fuera de casa / [Pico](https://pico.sh/) opcional? | Firebase Hosting gratis + HTTPS. Para asegurar acceso estable desde fuera (sin abrir puertos) Cloudflare Tunnel (gratis). Alternativa: Tailscale Funnel/Serve o Cloudflare Pages + Functions. |

> **Nota decisión BD**: Firestore es válido. Para uso 100% local sin cloud: PocketBase/Supabase local + Ollama. Pero con Gemini Free Tier + acceso móvil fuera de casa, Firestore + Firebase Hosting + Tunnel es equilibrio óptimo y cumple requisito.

---

## 3. ARQUITECTURA GENERAL

```text
Usuario (Web/PWA móvil)
  ↓
Chat UI (React+Vite+Tailwind+shadcn)
  ↓
Genkit Flows (Actions/Tools) - Firebase Functions (o local dev)
  - Intérprete de lenguaje natural (gastos/ingresos/movimientos)
  - Investigación Colombia (vehículos: SOAT/TM/seguros, impuestos)
  - Calculadoras (patrimonio, intereses, gastos mensuales)
  - Calendar sync (Google Calendar)
  ↓
Firestore (colecciones)
  ↓
Servicios: FCM (Push), Google Calendar API, Gemini
  ↓
Acceso fuera de casa: Firebase Hosting (HTTPS) + Cloudflare Tunnel (DNS/ingreso seguro) o exposición controlada
```

- **IA con Tools**: Genkit usará `tools` (functions) para: leer/escribir Firestore, calcular, buscar información Colombia, crear eventos Calendar, enviar notificaciones.
- **Seguridad**: Solo 1 usuario autenticado. Todo flujo IA pasa por Functions (clave Gemini server-side). Cliente no expone claves sensibles.
- **Offline**: Firestore persistence + PWA cache. Chat puede guardar borrador; sincroniza al reconectar.

---

## 4. MODELO DE DATOS (FIRESTORE)

Estructura por colecciones. Diseño normalizado + campos calculados.

### 4.1 `users` (colección)
```ts
users/{uid}
{
  email: string
  nombre: string
  pais: 'CO'
  moneda: 'COP'
  preferencias: { tema: 'light'|'dark', notificaciones: bool, zonaHoraria: 'America/Bogota' }
  configCalendario: { conectado: bool, calendarId?: string, syncEnabled: bool }
  fcmTokens: string[]  // Web Push
  creado: Timestamp
  actualizado: Timestamp
}
```

### 4.2 `cuentas_banco` (Dinero en el banco)
```ts
cuentas_banco/{id}
{
  nombre: string  // 'Nequi', 'Bancolombia Ahorros', 'Davivienda Corriente'
  tipo: 'ahorros'|'corriente'|'digital'|'efectivo'|'inversion'
  saldoActual: number  // COP
  moneda: 'COP'
  activa: boolean
  orden: number
  actualizado: Timestamp
  historial: Timestamp
}
```

### 4.3 `deudas` (Deudas)
```ts
deudas/{id}
{
  nombre: string  // 'Crédito vivienda', 'Tarjeta', 'Préstamo'
  tipo: 'hipoteca'|'consumo'|'tarjeta'|'vehiculo'|'otro'
  entidad: string
  montoInicial: number
  saldoPendiente: number
  cuotaMensual: number
  tasaInteres: number  // % EA o mensual (especificar)
  tipoTasa: 'nominal_mensual'|'EA'|'nominal_anual'
  fechaInicio: Date|string
  plazoMeses: number
  fechaVencimientoCuota: number  // día del mes (1-31)
  estado: 'activa'|'pagada'|'congelada'
  incluyeSeguro?: boolean
  gastosAsociadosMensuales?: number  // seguros/admin
  amortizacion: 'frances'|'aleman'|'libre'  // útil
  notas: string
  actualizado: Timestamp
}
```

### 4.4 `vehiculos` (Vehículos + gastos asociados)
Crítico Colombia: SOAT, Tecnicomecánica (RTM), Seguro Todo Riesgo.

```ts
vehiculos/{id}
{
  placa: string
  marca: string
  linea: string
  modelo: number  // año
  tipo: 'carro'|'moto'|'camion'|'otro'
  cilindraje?: number
  claseVehiculo?: string  // Colombia (particular, público, carga...)
  valorComercial: number  // COP (estimado/actual)
  valorPatrimonial?: number  // para balance
  propietario: string
  activo: boolean
  soat: {
    vigente: boolean
    aseguradora: string
    numeroPoliza: string
    fechaVencimiento: string  // YYYY-MM-DD
    valorPrimaAnual: number  // COP
    cobertura: string
    fuente: 'investigado_IA'|'manual'
  }
  tecnicomecanica: {
    vigente: boolean
    centroRevision: string
    fechaVencimiento: string  // YYYY-MM-DD
    costoRevision: number  // COP (aprox)
    tipo: 'vigente'
    fuente: 'investigado_IA'|'manual'
  }
  seguroTodoRiesgo: {
    tiene: boolean
    vigente: boolean
    aseguradora: string
    numeroPoliza: string
    fechaVencimiento: string  // YYYY-MM-DD
    valorPrimaAnual: number  // COP (o mensual)
    periodicidad: 'anual'|'mensual'|'semestral'
    deducible?: number
    cobertura: string
    fuente: 'investigado_IA'|'manual'
  }
  otrosGastos: Array<{ concepto: string, periodicidad: 'mensual'|'trimestral'|'anual', valor: number }>
  gastosMensualesCalculados: number  // SOAT/12 + STR/12 + TM + otros (pro-rata)
  notas: string
  actualizado: Timestamp
  investigadoIA: Timestamp  // última investigación
}
```

> **Investigación IA Colombia**: Debe consultar rangos/costos aproximados vigentes (SOAT: tarifa por cilindraje/clase, tecnicomecánica: tarifas centros, STR: según valor comercial/modelo). Usar herramientas con búsqueda/instrucciones + pedir confirmación antes de fijar valores definitivos.

### 4.5 `propiedades` (Propiedades + valor patrimonial + intereses)
```ts
propiedades/{id}
{
  nombre: string  // 'Casa Bogotá', 'Apartamento', 'Lote'
  direccion: string
  tipo: 'vivienda'|'comercial'|'terreno'|'otro'
  valorCatastral?: number  // COP
  valorComercialEstimado: number  // COP (IA puede sugerir)
  valorPatrimonial: number  // COP (base contable)
  avaluoFecha?: string
  hipotecaAsociadaId?: string  // ref deudas
  gastosMensualesFijos: Array<{ concepto: string, valor: number }>  // administración, vigilancia, HOA
  impuestos: {
    predial: {
      vigente: boolean
      fechaVencimiento?: string  // puede ser anual (bimestres/depende municipio) - Colombia varía
      valorAnual?: number
      municipio: string
      fuente: 'investigado_IA'|'manual'
    }
  }
  intereses?: Array<{ concepto: string, tipo: 'mensual'|'anual', valor: number, descripcion: string }>
  gastosMensualesCalculados: number
  notas: string
  actualizado: Timestamp
}
```

### 4.6 `nomina` (Nómina - trabajadores + salarios + primas)
```ts
nomina/{id}
{
  nombreCompleto: string  // Nombres + apellidos
  cargo: string
  activo: boolean
  tipoContrato: 'indefinido'|'fijo'|'obra'|'aprendiz'
  salarioBaseMensual: number  // COP
  moneda: 'COP'
  asignacion: {
    vehiculoId?: string  // ref vehiculos (si usa vehículo empresa)
    propiedadId?: string
    otros?: string
  }
  primaServicios: {
    aplica: boolean
    mitadJulio: boolean  // prima de servicios julio (Colombia)
    mitadDiciembre: boolean  // diciembre
    // cálculo: salario base / 2 (mitades) aprox + reglas
  }
  cesantias?: { aplica: boolean }
  interesesCesantias?: { aplica: boolean }
  vacaciones?: { aplica: boolean }
  seguridadSocial?: { aplica: boolean, porcentajeEmpleadorAprox?: number }  // referencia
  otrosConceptos: Array<{ concepto: string, tipo: 'devengo'|'deduccion', valorMensual: number, periodicidad: 'mensual'|'anual' }>
  salarioTotalMensualEstimado: number  // devengos - deducciones
  fechaPago: { dia: number, tipo: 'mensual'|'quincenal'|'semanal' }  // día de pago
  notas: string
  creado: Timestamp
  actualizado: Timestamp
}
```

> **Colombia nómina**: Prima de Servicios (Ley 50/1990): 2 mitades (30 junio + 20 diciembre aprox fechas). IA debe mantener recordatorio, no calcular complejidad tributaria completa (orientativo para presupuesto).

### 4.7 `gastos_mensuales_minimos_automatizados` (Gastos recurrentes fijos)
```ts
gastos_recurrentes/{id}
{
  concepto: string  // 'Internet', 'Agua', 'Luz', 'Arriendo', 'Celular', 'Gas'
  categoria: 'hogar'|'transporte'|'salud'|'educacion'|'servicios'|'otro'
  valor: number  // COP
  periodicidad: 'diaria'|'semanal'|'quincenal'|'mensual'|'bimestral'|'trimestral'|'semestral'|'anual'
  diaVencimiento?: number  // día del mes (1-31)
  fechaInicio: string
  fechaFin?: string
  activo: boolean
  afectaCuentas: Array<{ cuentaBancoId: string, porcentaje?: number, montoFijo?: number }>
  autoGenerarEnChat: boolean  // sugerir al IA al inicio mes
  notas: string
  actualizado: Timestamp
}
```

### 4.8 `movimientos` (Transacciones/gastos/ingresos)
Registro histórico (crucial para chat + trazabilidad).

```ts
movimientos/{id}
{
  fecha: string  // YYYY-MM-DD
  hora?: string   // HH:mm
  tipo: 'gasto'|'ingreso'|'transferencia'|'pago_deuda'|'pago_nomina'|'impuesto'|'seguro'|'mantenimiento'|'otro'
  concepto: string
  descripcion: string
  monto: number  // COP (positivo/negativo según tipo)
  categoria: string
  subcategoria?: string
  cuentaBancoId?: string
  deudaId?: string
  vehiculoId?: string
  propiedadId?: string
  nominaId?: string
  recurrenteId?: string
  etiquetas: string[]
  fuente: 'chat_IA'|'manual'|'automatico'
  estado: 'confirmado'|'pendiente'|'anulado'
  notasIA?: string  // explicación IA
  creado: Timestamp
  actualizado: Timestamp
}
```

### 4.9 `calendario_eventos` (Sincronizado Google Calendar)
```ts
calendario_eventos/{id}
{
  googleEventId?: string
  titulo: string
  descripcion: string
  tipo: 'pago_sueldo'|'nomina_trabajador'|'prima_julio'|'prima_diciembre'|'soat'|'tecnicomecanica'|'seguro_tr'|'predial'|'impuesto'|'cuota_deuda'|'recurrente'|'personal'
  fechaInicio: string  // YYYY-MM-DD
  fechaFin?: string
  allDay: boolean
  recurrente: boolean
  reglaRecurrencia?: string  // RRULE (RFC 5545)
  recordatorios: Array<{ minutosAntes: number }>  // 1d, 1h, 30m
  relacionado: {
    vehiculoId?: string, deudaId?: string, propiedadId?: string, nominaId?: string, recurrenteId?: string
  }
  sincronizadoGoogle: boolean
  activo: boolean
  creado: Timestamp
  actualizado: Timestamp
}
```

### 4.10 `configuracion_sistema` (Configuración global)
```ts
configuracion_sistema/{docId='app'}
{
  version: string
  pais: 'CO'
  moneda: 'COP'
  fechaUltimaInvestigacionIA: Timestamp
  reglasIA: string  // instrucciones base
  googleCalendarSync: boolean
  fcmEnabled: boolean
  mantenimiento: boolean
  actualizado: Timestamp
}
```

### 4.11 `resumenes_mensuales` (Agregados)
```ts
resumenes_mensuales/{YYYY-MM}
{
  ingresos: number, gastos: number, balance: number
  porCategoria: Record<string,number>
  porCuenta: Record<string,number>
  deudasPagadas: number, deudasNuevas: number
  generadoIA: boolean
  actualizado: Timestamp
}
```

---

## 5. IA - GENKIT + GEMINI FREE TIER

### 5.1 Configuración Genkit

```ts
// genkit.config.ts
import { googleAI } from '@genkit-ai/googleai';
import { genkit } from 'genkit';

export default genkit({
  plugins: [googleAI()],
  model: 'googleai/gemini-2.5-flash', // Free tier estable
  // temperatura baja para operaciones financieras
});
```

> Modelo sugerido: `gemini-2.5-flash` (rápido, cuota free tier suficiente uso personal). `gemini-2.5-flash-lite` opcional. Evitar modelos muy pesados.

### 5.2 System Prompt (Base IA)

Instrucciones obligatorias en `docs/prompts/SYSTEM_PROMPT.md` (crear):

```text
Eres CashMet, asistente de gestión económica personal para Colombia (COP).

REGLAS FUNDAMENTALES:
- ÚNICO USUARIO. Privado. Nunca sugieras publicar/comercializar.
- Responde SIEMPRE en español, conciso, claro.
- FINANZAS: Sé conservador, nunca inventes datos sensibles. Si dudas -> pregunta (no asumas).
- COLOMBIA-FIRST: Para SOAT, tecnicomecánica, seguro todo riesgo, predial, nómina (primas julio/diciembre) usa normativa/valores razonables COLOMBIA 2025–2026. Investiga con fuentes lógicas, indica "estimado", pide confirmación ANTES de guardar valores definitivos.
- CONFIRMACIÓN: Antes de CREAR/ACTUALIZAR registros críticos (deudas, vehículos, nómina, eventos calendario) pide confirmación breve: "¿Confirmo guardar [resumen]? (Sí/No)".
- ACTUALIZA BD: Cuando usuario dice gasto/ingreso/pago -> interpreta, extrae: fecha, monto, concepto, categoría, entidades (cuenta/vehículo/deuda/propiedad). Usa TOOLS (Firestore).
- NO INVENTES: Si no hay datos suficientes para vincular -> pregunta: cuenta, categoría o entidad.
- MONEDA: COP. Formatea números con separadores (1.234.567 COP).
- PRIVACIDAD: Nunca expongas saldos completos innecesarios. Solo lo relevante.
- CALENDARIO: Sincroniza con Google Calendar solo si autorizado. Crea eventos con recordatorios.
- VERIFICABLE: Expón cambios: "+$30.000 almuerzo → Movimientos + Banco Nequi (-30.000)".
```

### 5.3 Tools (Genkit Functions) - IA puede usar

Crear `src/ai/tools/`:

| Tool | Función |
|---|---|
| `createMovimiento` | Crear movimiento (gasto/ingreso) |
| `updateSaldoCuenta` | Actualizar saldo banco |
| `getSaldos` | Consultar estado (banco, deudas, patrimonio) |
| `registrarPagoDeuda` | Aplica pago a deuda (disminuye saldoPendiente) |
| `crearEditarVehiculo` | Crear/editar + guardar investigación IA |
| `investigarVehiculoCO` | **Tool crítico**: Investiga SOAT/TM/STR Colombia (valores estimados + fuentes). Devuelve sugeridos + requiere confirmación. |
| `crearEditarNomina` | CRUD nómina + generar eventos sueldos/primas |
| `generarEventosCalendario` | Crea eventos Google Calendar (RRULE) + Firestore |
| `sincronizarGoogleCalendar` | OAuth + sync bidireccional básico |
| `calcularGastosMensuales` | Calcula gastos mensuales automáticos (recurrentes + vehículos + propiedades + nómina) |
| `obtenerResumen` | Dashboard/resumen mensual |
| `buscarMovimientos` | Búsqueda con filtros |

> `investigarVehiculoCO`: Prompt con búsqueda razonada (año, cilindraje, marca, clase). Debe devolver: SOAT anual estimado (rango COP), Tecnicomecánica (costo aprox), STR anual estimado, vigencia sugerida, **nivelConfianza** (bajo/medio/alto), **requiereConfirmacion: true**, fuentes: "Basado en tarifas referencia Colombia (estimativo)". Nunca tomar como definitivo.

### 5.4 Flujos Genkit

- `flows/chatFlow.ts`: Recibe mensaje usuario → interpreta intención (NLU) → ejecuta tools necesarios → responde con confirmación + resumen cambios.
- `flows/investigacionVehiculoFlow.ts`: Flow investigación Colombia con validación.
- `flows/generarCalendarioFlow.ts`: Genera eventos (sueldos, vencimientos, primas julio/diciembre, recibo sueldo propio).
- `flows/calculoMensualFlow.ts`: Proyección mensual.

---

## 6. INTEGRACIONES

### 6.1 Google Calendar API (OAuth 2.0)
- **Scopes**: `https://www.googleapis.com/auth/calendar.events`, `https://www.googleapis.com/auth/calendar`
- **Flujo**: Conectar 1 cuenta (propia). Botón "Conectar Google Calendar" → OAuth → guardar tokens (Firestore: `googleAuthTokens` por user con cifrado o usar Firebase Auth + Google? Mejor Google Sign-In opcional o OAuth separado). Para 1 usuario, OAuth clásico funciona.
- **Eventos**: Crear all-day o día/hora, RRULE para recurrentes (mensual/anual). Recordatorios: email/popup (nativos Calendar).
- **Sincronización**: Unidireccional preferida (CashMet → Calendar) para evitar loops. Marcar `sincronizadoGoogle`.

### 6.2 Firebase Cloud Messaging (Web Push)
- **VAPID**: Generar claves VAPID (web-push). Guardar server-side (Functions env).
- **Permisos**: Solicitar "recibir notificaciones" en PWA (Android OK, iOS: requiere PWA instalado + iOS 16.4+ Web Push soportado parcialmente; fallback: notificaciones en-app + recordatorios Calendar nativos).
- **Tipos**: Vencimientos (SOAT/TM 30/7/1 día antes), pagos nómina, cuotas deudas, recordatorios personalizados.
- **Estrategia**: Priorizar Google Calendar (recordatorios nativos) + FCM complementario.

### 6.3 Investigación Colombia (vehículos/impuestos)
IA debe usar razonamiento + sugerencias estructuradas:
- **SOAT**: Referencia cilindraje/clase (particular). Tarifa estimada por rango.
- **Tecnicomecánica**: Costo revisión centros autorizados (variable ciudad). Estimativo.
- **Seguro Todo Riesgo**: % valor comercial (0.8%–2.5% anual aprox) según modelo/año. **SIEMPRE requiere confirmación + fuente="estimado IA CO"**.
- **Predial**: Varía municipio (ICA, UVT referencias). Anual, bimestres? Sugerir verificar municipio.

**Regla crítica**: `investigadoIA` + flag `fuente: 'investigado_IA'` + `nivelConfianza` + NO auto-guardar valores sin confirmación explícita usuario.

---

## 7. AUTENTICACIÓN Y SEGURIDAD

- **Auth**: Firebase Authentication Email/Password. **Único usuario** (crear cuenta única tú). Sin registro público.
- **Reglas Firestore**: Estrictas (solo `auth.uid` propio lee/escribe). Validar schemas básicos.
- **Server-side**: IA en Cloud Functions (Genkit on Functions) → nunca expone API keys cliente.
- **Cifrado**: Tokens Google (si guardados) sensibles. Firestore en tránsito/descanso (Firebase). Datos económicos personales.
- **Sin tracking**: Sin analytics/comercial. Privado 100%.
- **Backups**: Exportar Firestore (manual/Firestore backups programados pago) o **export JSON/CSV** desde app (botón "Exportar backup completo"). Gratis: gcloud firestore export a Cloud Storage (límite/posible costo pequeño) o mejor export manual periódico (JSON).

---

## 8. DESPLIEGUE Y ACCESO DESDE MÓVIL FUERA DE CASA

Objetivo: Usar app fuera de red local (trabajo/viaje) de forma privada.

### Opción A: Firebase Hosting + Cloudflare Tunnel (Recomendada, gratis + estable)
1. `firebase deploy --only hosting,functions` → app en `https://proyecto.web.app` (o custom domain)
2. **Cloudflare Tunnel** (cloudflared): expone localhost o Firebase Hosting vía túnel, dominio propio en Cloudflare (gratis), HTTPS, sin abrir puertos router. Control acceso (Zero Trust opcional).
3. PWA instalable Android/iOS.

### Opción B: Tailscale Funnel/Tailscale Serve (privado, VPN-based)
- Acceso vía tailnet. Funnel HTTPS público controlado (o auth). Gratis.

### Opción C: Self-host (Raspberry + Cloudflare Tunnel)
- Funciona. Firebase (Firestore/Auth/FCM) sigue cloud (gratis Spark). App + Functions puedes self-host (Firebase Emulators+hosting estático) + Tunnel.

**Recomendación A**: Firebase + Cloudflare Tunnel (menos mantenimiento).

---

## 9. COSTOS (0€ ESPERADO)

| Servicio | Plan | Costo estimado (uso personal) |
|---|---|---|
| Gemini (Google AI) | Free Tier | **0€** (límites amplios uso personal) |
| Genkit | Open Source | **0€** |
| Firestore | Spark (Free) | **0€** (límites: 50k lect/20k esc/day suficientes) |
| Firebase Auth | Free | **0€** |
| Firebase Hosting | Free | **0€** (10GB, 360MB/día) |
| Cloud Functions | Spark | **0€** (invocaciones bajas) |
| FCM | Free | **0€** |
| Cloudflare Tunnel | Free | **0€** |
| Dominio (opcional) | Cloudflare | **0€** (usar web.app o subdominio propio) |

**Alerta**: Firestore export/Functions alto tráfico raro uso personal. Monitorear Spark quotas.

---

## 10. ROADMAP POR FASES (MVP → COMPLETO)

### FASE 0 - Setup + Documento (1-2h) ✓ (este doc)
- [x] Crear PLAN_COMPLETO.md
- [ ] Inicializar repo (Vite+React+TS, Tailwind, shadcn)
- [ ] Firebase project + Firestore + Auth + Functions + Hosting
- [ ] Genkit init + config Gemini

### FASE 1 - Base + Datos (2-4h)
- [x] Modelos TypeScript (tipos Firestore)
- [x] Reglas Firestore (solo user)
- [x] CRUD básico: Cuentas, Movimientos, Deudas
- [x] Dashboard inicial (saldos + últimos movimientos)

### FASE 2 - MVP Chat IA (Core) (4-6h)
- [x] Genkit flows + chat UI (shadcn)
- [x] Tools: createMovimiento, updateSaldo, getSaldos
- [x] Parser NL español (gastos/ingresos)
- [x] Confirmaciones IA antes guardar crítico
- [x] Tests manuales chat

### FASE 3 - Vehículos + Investigación Colombia (3-5h)
- [x] CRUD Vehículos (SOAT/TM/STR)
- [ ] Tool `investigarVehiculoCO` (estimados + requiereConfirmacion)
- [x] UI confirmación sugeridos
- [x] Cálculo gastos mensuales vehículos

### FASE 4 - Propiedades + Nómina + Recurrentes (3-5h)
- [x] Propiedades (valor patrimonial, predial)
- [x] Nómina: trabajadores, salarios, primas julio/diciembre
- [x] Gastos recurrentes automáticos
- [x] Cálculo mensual consolidado

### FASE 5 - Calendario + Google Calendar (2-4h)
- [x] Modelo eventos + UI calendario (mini/mes)
- [x] Google OAuth + Calendar API
- [x] Generación automática vencimientos (SOAT/TM/STR, sueldos, primas, deudas)
- [x] RRULE + recordatorios

### FASE 6 - PWA + Notificaciones (Push) (1-2h)
- [x] Vite PWA (manifest, SW)
- [x] FCM Web Push + VAPID
- [x] Notificaciones vencimientos (30/7/1 día)
- [x] Instalable móvil

### FASE 7 - Despliegue + Acceso fuera casa (1-2h)
- [ ] Firebase Hosting + Functions deploy
- [ ] Cloudflare Tunnel (o Tailscale) setup
- [ ] Backup export JSON/CSV
- [ ] Hardening reglas + pruebas

### FASE 8 - Pulido + Documentación uso (1-2h)
- [ ] README.md (uso diario, ejemplos chat)
- [ ] Guía ejemplos lenguaje natural
- [ ] QA básico

**Total estimado**: ~20–30h desarrollo.

---

## 11. EJEMPLOS DE USO CHAT (IA)

| Entrada usuario | Acción IA esperada |
|---|---|
| `Gasté 30.000 COP en almuerzo hoy` | Crear movimiento gasto, categoría alimentación, confirmar: "Guardado gasto $30.000 COP almuerzo (hoy) → Nequi -30.000". |
| `Pagué 450000 de cuota crédito vivienda` | Vincular deuda 'Crédito vivienda', disminuir saldoPendiente, crear movimiento pago_deuda, actualizar calendario si aplica. |
| `Ingresé 2800000 de nómina` | Ingreso → cuenta banco + movimiento. |
| `Recibí luz 180000 vence 25` | Crear/actualizar gasto recurrente o movimiento + evento calendario 25. |
| `Agrega vehículo Mazda 3 2019 placa ABC123 cilindraje 1500` | Crear vehículo. Sugerir SOAT/TM/STR Colombia (estimados) → **pedir confirmación** antes guardar. |
| `Investiga SOAT Mazda 3 2019 1500cc Colombia` | Flow investigación → sugiere valores + nivelConfianza + requiere confirmación. |
| `Pagar sueldo a Juan Pérez 1500000 COP hoy` | Crear movimiento pago_nomina, vincular nómina Juan. |
| `Genera calendario vencimientos este año` | Crear eventos: SOAT/TM/STR, primas julio/diciembre, sueldos, predial, cuotas deudas. |
| `Muéstrame resumen octubre 2026` | Resumen mensual: ingresos/gastos/balance + categorías. |

---

## 12. REGLAS DE DESARROLLO (OBLIGATORIAS)

- **TypeScript estricto** en todo.
- **Nunca commits secretos** (.env, serviceAccount). Usar Firebase Functions config/env.
- **Comentarios 0** (según instrucción usuario). Código limpio/autodocumentado.
- **Colombia-first SIEMPRE** en investigación.
- **Confirmación obligatoria** antes guardar datos críticos investigados por IA.
- **No asumir valores definitivos** (marcar `fuente: 'investigado_IA'` + estimado).
- **Privacidad ante todo**: app 1 usuario, sin telemetría.
- **Verificación**: Tras cambios, tests manuales + lint/typecheck (cuando existan scripts).
- **Preservar este PLAN_COMPLETO.md**: Fuente de verdad. Actualizar si hay cambios relevantes.

---

## 13. PRIMEROS PASOS (EJECUTAR AHORA)

Orden sugerido para iniciar FASE 0:

```powershell
# 1. Inicializar Vite + React + TS
npm create vite@latest . -- --template react-ts
# 2. Tailwind + shadcn
npx shadcn@latest init
# 3. Firebase
npm i firebase @genkit-ai/googleai genkit
npm i -D @types/node typescript
# 4. Estructura carpetas
mkdir src\ai,src\ai\flows,src\ai\tools,src\components,src\lib,src\types,src\hooks,docs\prompts
# 5. Crear SYSTEM_PROMPT.md
# (escribir en docs/prompts/SYSTEM_PROMPT.md)
```

> **Nota**: Proyecto en `C:\Users\johan\orca\workspaces\GlobalBerrs\CashMet` (vacío). Iniciar scaffold.

---

**FIN PLAN COMPLETO**. Este documento contiene toda la información necesaria para desarrollar CashMet desde cero, sin perder contexto.## 14. GIT, GITHUB Y GITFLOW (RESPONSABLEMENTE)

> **Principio**: El repositorio debe mantenerse actualizado en GitHub **con cada cosa**. Cada cambio l�gico, funcional o de documentaci�n debe commitearse y subirse de forma at�mica, siguiendo GitFlow de manera responsable.

### 14.1 Estructura de ramas (GitFlow)

Se sigue **GitFlow** con ramas principales y de soporte:

| Rama | Proposito |
|---|---|
| main | Rama estable de produccion. Solo recibe merges desde release/* o hotfix/*. **Nunca** commits directos. |
| develop | Rama de integracion. Recibe todos los cambios desarrollados (features). Base para proximas releases. |
| feature/* | Ramas por funcionalidad/paso logico. Desde develop a develop. |
| release/* | Preparacion de version estable. Desde develop a main + backmerge a develop. |
| hotfix/* | Correcciones criticas en main. Desde main a main y develop. |

### 14.2 Politica de commits

- **Actualizar con cada cosa**: Al completar un bloque l�gico (no por cada l�nea). Commit + push frecuente.
- **Atomicos y descriptivos**: Un commit = un cambio conceptual claro.
- **Convencional Commits (obligatorio)**: feat:, fix:, docs:, chore:, refactor:, style:, test:, perf:, build:, ci:, revert:.

### 14.3 Flujo de trabajo (responsable)

1. Crear rama feature desde develop: git checkout develop && git pull && git checkout -b feature/nombre-descriptivo
2. Desarrollar paso a paso. **Commit + push frecuente** al cerrar subpaso.
3. Mantener actualizada (rebase/merge con develop).
4. PR a develop recomendado (repo propio).
5. Release: release/vX.Y.Z desde develop -> test -> merge a main (tag) + backmerge a develop.
6. Nunca pushear directo a main/develop con cambios no revisados.

### 14.4 Repositorio GitHub

- **Privado**: Repositorio privado (uso propio). No sera publico/venta.
- **Siempre sincronizado**: Push tras cada commit logico. origin a GitHub.
- **Tags**: Versionado semantico (v0.1.0, v1.0.0) en main.
- **Proteccion (recomendado)**: Branch protection main (requiere PR, no force-push).
- **Backups**: GitHub como respaldo adicional.

### 14.5 Buenas practicas seguridad Git

- **NUNCA commitear secretos**: .env, .env.*, serviceAccount*.json, claves, VAPID keys, tokens.
- **Revisar git status/diff** antes de commit (staged solo archivos intencionados).
- **Commits limpios**: Evitar temporales/builds (dist/, .firebase/, .genkit/).
- **Historial responsable**: No reescribir historia compartida innecesariamente.

### 14.6 Integracion con fases

Roadmap ejecutado **rama por fase**: feature/phase-0-setup, feature/phase-1-base-datos, etc. Commit+push al completar cada item logico. Garantiza trazabilidad y recuperacion de contexto.

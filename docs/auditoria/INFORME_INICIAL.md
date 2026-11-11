# Informe inicial de auditoría — CashMet

- **Proyecto:** CashMet (`cashmet@0.1.0`)
- **Rama de auditoría:** `auditoria/2026-11` (creada desde `develop`, base `e8605f1`)
- **Fecha de corte:** 11 de noviembre de 2026
- **Alcance:** auditoría técnica integral (arquitectura, funcionalidad, seguridad, rendimiento, accesibilidad e integridad de datos), diseño y ejecución de pruebas, y corrección controlada de causas raíz.
- **Restricción respetada:** esta fase **no modificó código de producto**; solo se levantó evidencia, se creó el arnés de pruebas y se documentaron hallazgos.

---

## 1. Contexto y objetivo

CashMet es una aplicación personal de finanzas en pesos colombianos (COP) con una interfaz conversacional (Lucía), módulos CRUD (cuentas, movimientos, deudas, nómina, impuestos, recurrentes, vehículos, propiedades, calendario) y un módulo operativo local llamado **Bear's Reserve** (rutas rurales, flota, combustible, misiones).

Objetivo de la auditoría:

1. Entender la arquitectura real y el flujo de datos.
2. Diseñar un catálogo verificable de al menos 200 casos de prueba.
3. Ejecutar todo lo ejecutable sin una cuenta/Proyecto Firebase de pruebas ni navegador E2E.
4. Identificar causas raíz (no solo síntomas) y corregirlas en una rama independiente.
5. Dejar pruebas de regresión y un informe final con deuda técnica residual.

---

## 2. Arquitectura observada

### 2.1 Stack

| Capa | Tecnología |
|---|---|
| Build/dev | Vite 8 + TypeScript ~6.0 |
| UI | React 19, Tailwind CSS 4, Radix Slot, motion, lucide-react |
| Estado | React local + Zustand (puntual) |
| Persistencia | Firebase 12: Auth, Firestore, Storage |
| IA | Gemini vía `@genkit-ai/googleai` (cliente, clave `VITE_GEMINI_API_KEY`) |
| PWA | `vite-plugin-pwa` (Workbox) |
| Pruebas añadidas | Vitest 5 + jsdom + Testing Library + cobertura v8 |

### 2.2 Inventario

- 86 archivos `.ts/.tsx` en `src/`, ~19.151 líneas.
- Directorios: `ai/`, `components/`, `features/`, `hooks/`, `lib/`, `store/`, `types/`, `utils/`.
- 11 colecciones de Firestore usadas por la app: `cuentas_banco`, `deudas`, `vehiculos`, `propiedades`, `nomina`, `gastos_recurrentes`, `impuestos`, `movimientos`, `calendario_eventos`, `configuracion_sistema`, `resumenes_mensuales` (más `users/{uid}`).

### 2.3 Flujo de datos principal

1. `ChatPage` recibe texto libre y llama a `interpretar()` (`src/features/chat/interpretar.ts`).
2. Gemini (si hay clave) o el motor local (`engine.ts` + `parser/nl.ts`) produce una acción y/o un borrador.
3. Las acciones se ejecutan en `ChatPage.ejecutarAccion()` contra repositorios (`src/lib/firebase/*Repo.ts`).
4. Los repositorios escriben en Firestore y, en varios casos, ajustan saldos de cuentas.
5. `snapshot.ts` arma un resumen financiero que se envía a Gemini como contexto.
6. `piloto.ts` ejecuta automatizaciones al abrir el chat (salario, nómina, deudas, impuestos, recurrentes).

### 2.4 Modelo de datos y multi-usuario

Los documentos financieros **no tienen `userId`**: son colecciones globales. `firestore.rules` permite lectura/escritura a cualquier usuario autenticado en esas colecciones. `storage.rules` sí aísla imágenes/documentos por `userId`. En la práctica el producto asume un único usuario, pero las reglas actuales no lo garantizan si el proyecto Firebase tiene más de una cuenta.

### 2.5 Bear's Reserve

Módulo grande, casi completamente local (`localStorage`), con datos demo de respaldo cuando no hay vehículos/nómina en Firestore. Ejecuta rutas automáticas al montar el portal y liquida combustible contra CashMet mediante `crearMovimiento`.

---

## 3. Método

### 3.1 Fases

| Fase | Actividad | Evidencia |
|---|---|---|
| F1 | Reconocimiento y mapa de arquitectura | inventario, lectura de repositorios y reglas |
| F2 | Diseño del catálogo (≥200 casos) | `docs/auditoria/CATALOGO_PRUEBAS.md` |
| F3 | Ejecución automatizada | `tests/` (15 suites) + baseline |
| F4 | Auditoría técnica y de seguridad | hallazgos con archivo/línea |
| F5 | Corrección de causas raíz | rama `auditoria/2026-11` |
| F6 | Re-ejecución y cierre | informe final + regresión |

### 3.2 Estrategia de pruebas sin Firebase real

No se dispone de un proyecto Firebase de pruebas ni de credenciales, y estaba prohibido tocar producción. Por eso:

- Se implementó un **Firestore falso en memoria** (`tests/helpers/fakeFirestore.ts`) que soporta `collection/doc/getDoc/getDocs/query/where/orderBy/limit/setDoc/updateDoc/deleteDoc/addDoc`, `increment`, `deleteField`, `writeBatch`, `runTransaction` (serializado) y rutas con punto.
- Los repositorios se prueban mockeando `@/lib/firebase/config` y `firebase/firestore`; nunca se conectan a la nube.
- Zona horaria de pruebas: `America/Bogota`, para exponer errores de fechas UTC.
- Casos de UI/E2E y accesibilidad real quedan **BLOCKED** con motivo explícito (no hay navegador E2E ni backend autorizado).

### 3.3 Línea base (antes de corregir)

```
Test Files  14 failed | 1 passed (15)
Tests       49 failed | 81 passed (130)
```

Los 49 fallos reproducían defectos reales de lógica, no problemas del arnés. El detalle completo quedó en `%TEMP%\cashmet-baseline.txt`.

Comandos que ya pasaban en `develop` sin cambios:

```
npm run lint      → OK (oxlint)
npx tsc -b        → OK
```

---

## 4. Hallazgos iniciales (causa raíz)

Severidad: **S1** crítica (pérdida/duplicación de dinero o datos), **S2** alta (resultado incorrecto frecuente), **S3** media (borde/UX/seguridad), **S4** baja (higiene).

### 4.1 Integridad financiera

| ID | Sev | Hallazgo | Causa raíz | Archivo |
|---|---|---|---|---|
| H-01 | S1 | Un gasto/ingreso podía escribirse sin actualizar el saldo (o al revés) | Escrituras separadas sin transacción | `lib/firebase/movimientosRepo.ts` |
| H-02 | S1 | Editar/eliminar un movimiento dejaba saldos descuadrados | Reverso y aplicación en pasos independientes, sin atomicidad; transferencias actualizaban un solo lado | idem |
| H-03 | S1 | Dos transferencias simultáneas podían sobregirar la cuenta | `getDoc` + `writeBatch` (check-then-act, TOCTOU) | idem |
| H-04 | S1 | Pago de deuda permitía sobrepago/saldo negativo y nunca marcaba la deuda como pagada | `increment(-monto)` sin validación ni transacción | `deudasRepo.ts` |
| H-05 | S1 | Dos pagos concurrentes de nómina/impuesto podían duplicar el descuento | Lectura y escritura en lote no atómicas | `nominaRepo.ts`, `impuestosRepo.ts` |
| H-06 | S2 | `actualizarNomina` recalculaba el total desde un input parcial y ponía el salario en 0 | No leía el documento existente | `nominaRepo.ts` |
| H-07 | S2 | Montos cero/negativos/NaN creaban movimientos inválidos | Falta de validación de entrada | `movimientosRepo.ts` |
| H-08 | S2 | Se podía crear un movimiento contra una cuenta inexistente | Sin verificación de existencia | idem |
| H-09 | S2 | Recurrentes ignoraban `fechaFin` y generaban valor 0 | `tocaMes` no comparaba fin; `Number(valor) || 0` | `recurrentesRepo.ts` |
| H-10 | S3 | `piloto.ts` anunciaba “cuota descontada” aunque el pago hubiera fallado | Resultado de `registrarPagoDeuda` ignorado | `lib/piloto.ts` |

### 4.2 Fechas y calendario

| ID | Sev | Hallazgo | Causa raíz | Archivo |
|---|---|---|---|---|
| H-11 | S2 | `31/02/2026` se convertía en `2026-03-03` | `new Date(a, m, d)` desborda; no se validaba el día real | `ai/parser/nl.ts` |
| H-12 | S2 | “15 de marzo de 2025” usaba el año actual | Regex sin grupo de año | idem |
| H-13 | S2 | Fechas ISO explícitas no se reconocían | Faltaba patrón ISO | idem |
| H-14 | S2 | “recibí …” se clasificaba como gasto | `\brecib\b` no coincide con “recibi” | idem |
| H-15 | S3 | Recordatorio “vence el 31” en febrero caía el 3 de marzo | Construcción de fecha sin recorte | `chat/engine.ts` |
| H-16 | S2 | Nómina/deuda con día 29–31 generaba eventos en el mes siguiente | `new Date(y, m, dia)` desborda | `firebase/calendarioRepo.ts` |
| H-17 | S2 | Fechas por defecto y filtros usaban UTC (`toISOString`) → día equivocado en Bogotá de noche | Uso de UTC para fechas de negocio | 7 archivos |
| H-18 | S3 | `fechaExiste` no existía; `sumarMeses` no recortaba | Falta de utilidad central | `lib/fechas.ts` |

### 4.3 Seguridad y privacidad

| ID | Sev | Hallazgo | Causa raíz | Archivo |
|---|---|---|---|---|
| H-19 | S2 | Token OAuth de Google persistido en `localStorage` | `localStorage.setItem(CLAVE, …)` | `lib/google/calendar.ts` |
| H-20 | S2 | Importación de backup escribía **cualquier** colección indicada en el JSON | Iteración de `Object.keys(copia)` sin lista blanca | `firebase/backup.ts` |
| H-21 | S2 | Backup sin validación de estructura ni límite → escrituras parciales/abusivas | Sin validación previa | idem |
| H-22 | S2 | Reglas Firestore: cualquier usuario autenticado lee/escribe todas las finanzas | Colecciones globales sin `userId` ni validación de campos | `firestore.rules` |
| H-23 | S3 | Clave Gemini expuesta en el bundle cliente y snapshot financiero completo enviado a Google | Diseño cliente-only | `ai/gemini.ts`, `features/chat/snapshot.ts` |
| H-24 | S3 | Historial de chat con datos financieros guardado en `localStorage` | `CLAVE_CHAT` | `features/chat/ChatPage.tsx` |
| H-25 | S3 | 92 vulnerabilidades de dependencias (17 high, 71 moderate, 4 low) | Árbol npm | `npm audit` |

### 4.4 Funcionalidad / UX

| ID | Sev | Hallazgo | Causa raíz | Archivo |
|---|---|---|---|---|
| H-26 | S2 | El resumen del mes contaba transferencias como gasto | `else gastos += val` | `ChatPage.tsx` |
| H-27 | S2 | El chat mostraba saldo de deuda calculado con datos viejos y ocultaba rechazos | Resultado de pago ignorado | idem |
| H-28 | S2 | Mantenimiento guardaba la tarea aunque faltara la cuenta para el costo | Validación después de escribir | idem |
| H-29 | S2 | Pregunta “¿cuánto son 100 dólares en pesos?” creaba un movimiento | Sin guarda de intención de conversión | `chat/engine.ts` |
| H-30 | S3 | Editar vehículo perdía bloques anidados (SOAT, mantenimiento…) | Se escribía `...v` en vez del objeto mezclado | `vehiculosRepo.ts` |
| H-31 | S3 | `null` en un bloque anidado se guardaba como `null` en vez de borrarlo | Falta de `deleteField()` | `vehiculosRepo.ts`, `propiedadesRepo.ts` |
| H-32 | S3 | Ralentí negativo generaba galones negativos | Sin recorte a 0 | `bearsReserve/geo.ts` |
| H-33 | S3 | Rutas Bear's Reserve podían ejecutarse dos veces al montar el portal | Sin mutex/idempotencia | `bearsReserve/repo.ts` |
| H-34 | S3 | `lang="en"` en un producto en español | Plantilla Vite | `index.html` |
| H-35 | S3 | `listarTodosLosMovimientos(max)` ignoraba el límite | Parámetro sin usar | `movimientosRepo.ts` |

> Nota: los identificadores H-xx se mantienen estables para trazabilidad con el catálogo y el informe final.

---

## 5. Cobertura de pruebas diseñada

El catálogo (`CATALOGO_PRUEBAS.md`) contiene **238 casos** distribuidos así:

| Área | Casos |
|---|---|
| Autenticación y sesión | 10 |
| Cuentas bancarias | 12 |
| Movimientos | 25 |
| Transferencias | 10 |
| Deudas | 14 |
| Nómina | 14 |
| Gastos recurrentes | 12 |
| Impuestos | 12 |
| Vehículos y mantenimiento | 16 |
| Propiedades | 8 |
| Calendario | 12 |
| Backup | 10 |
| Chat / parser / motor | 25 |
| Bear's Reserve | 18 |
| Seguridad | 12 |
| Accesibilidad | 10 |
| Rendimiento | 8 |
| Integridad de datos | 10 |
| **Total** | **238** |

Estados posibles: `PASS` (verificado por prueba automatizada o inspección reproducible), `PASS (corregido)` (falló antes del fix y hoy tiene regresión), `BLOCKED` (requiere Firebase/navegador autorizado) y `NOT TESTED` (no ejecutado por falta de entorno o ser manual).

---

## 6. Limitaciones conocidas de esta auditoría

1. **Sin proyecto Firebase de pruebas**: no se ejecutaron reglas reales, Auth, Storage ni consultas con índices reales. Los repos se validaron contra un doble en memoria fiel al subconjunto usado.
2. **Sin E2E de navegador**: no hay Playwright ni navegador gestionado en el entorno; los casos de UI, teclado, foco, contraste y PWA quedan BLOCKED.
3. **Sin datos de producción**: no se inspeccionaron documentos reales; los datos de prueba son sintéticos.
4. **Bear's Reserve depende de `localStorage` y datos demo**: se probó la lógica pura (geo/combustible) y se corrigió concurrencia por inspección; no hay suite de integración de ese módulo.
5. **Cobertura de código agregada baja** (13,65 % de sentencias) porque incluye toda la UI; la cobertura de los módulos críticos de lógica/repositorios es la relevante y se detalla en el informe final.

---

## 7. Conclusión de la fase inicial

La app compila y pasa lint, pero la línea base mostró **49 fallos reales** concentrados en integridad de saldos, validación de entrada, fechas y pagos. Los riesgos S1 permitían descuadres y sobregiros; los S2 afectaban resultados visibles al usuario; los S3 incluían persistencia de tokens y escritura arbitraria de colecciones desde un backup.

Se procedió a corregir causas raíz en la rama `auditoria/2026-11`, con una prueba de regresión por cada defecto reproducible. El resultado se documenta en `INFORME_FINAL.md`.

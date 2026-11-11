# Informe final de auditoría — CashMet

- **Proyecto:** CashMet (`cashmet@0.1.0`)
- **Rama de trabajo:** `auditoria/2026-11` (creada desde `develop` @ `e8605f1`)
- **Fecha de cierre:** 11 de noviembre de 2026
- **Documentos relacionados:** `INFORME_INICIAL.md`, `CATALOGO_PRUEBAS.md`
- **Estado:** correcciones aplicadas y verificadas localmente; **sin push ni despliegue** (pendiente de aprobación).

---

## 1. Resumen ejecutivo

La app partía de una base que compilaba y pasaba lint, pero con **49 de 130 pruebas de regresión en rojo** sobre defectos reales: escrituras de saldo no atómicas, transferencias con condiciones de carrera, pagos de deuda que permitían sobregiro, fechas UTC que movían operaciones de día, y pérdida de campos anidados al editar. También se identificaron riesgos de seguridad estructurales (reglas Firestore globales, token OAuth persistido, importación de backups sin lista blanca).

Resultado de esta auditoría:

| Indicador | Antes (`develop`) | Después (`auditoria/2026-11`) |
|---|---|---|
| Suites de prueba | 14 fallidas / 1 aprobada (15) | **15 aprobadas (15)** |
| Pruebas | 49 fallidas / 81 aprobadas (130) | **130 aprobadas (130)** |
| Lint (`oxlint`) | Limpio | **Limpio** |
| TypeScript (`tsc -b`) | Limpio | **Limpio** |
| Build (`vite build` + PWA) | Exitoso | **Exitoso** (advertencia de tamaño de chunk) |
| Casos de catálogo | — | **238 diseñados; 86 PASS, 72 PASS (corregido), 5 FAIL, 36 BLOCKED, 39 NOT TESTED** |
| Vulnerabilidades npm | 92 (17 high) | 92 (17 high) — **no remediadas** |
| Reglas Firestore | Globales por autenticación | **Sin cambios** (requiere proyecto de pruebas) |

**Conclusión:** se corrigieron las causas raíz de **31 de los 35 hallazgos iniciales** (H-01…H-21 y H-26…H-35). Permanecen **cinco riesgos residuales principales**: aislamiento multiusuario en Firestore (H-22), doble pago manual de nómina (H-36), clave Gemini/datos financieros en cliente (H-23), historial del chat en `localStorage` (H-24) y dependencias vulnerables (H-25). Los casos de UI, accesibilidad real, Auth, PWA y reglas desplegadas quedaron **BLOCKED**, no aprobados.

---

## 2. Alcance y método

Se ejecutaron las fases F1–F6 del informe inicial:

1. **Reconocimiento:** 86 archivos `.ts/.tsx`, ~19.151 líneas, 11 colecciones de Firestore, módulo local Bear's Reserve.
2. **Catálogo:** 238 casos en 18 áreas (`CATALOGO_PRUEBAS.md`), con ID, objetivo, prioridad, precondiciones/datos, pasos, resultado esperado/criterio y estado.
3. **Ejecución:** 130 pruebas automatizadas con Vitest 5 + jsdom y un Firestore falso en memoria que soporta transacciones, lotes, `increment`, `deleteField`, rutas con punto y consultas.
4. **Auditoría técnica:** revisión de repositorios, parser, motor del chat, reglas, backup, PWA y configuración.
5. **Corrección:** cambios mínimos orientados a causa raíz, sin migraciones de esquema ni rediseño de arquitectura.
6. **Re-verificación:** suite completa, lint, TypeScript, build, cobertura y auditoría de dependencias.

Zona horaria de pruebas: `America/Bogota`, para exponer los errores de fecha UTC. No se usaron credenciales ni datos de producción.

---

## 3. Correcciones aplicadas

### 3.1 Integridad financiera

| ID | Corrección | Archivo | Evidencia |
|---|---|---|---|
| H-01 | Crear movimiento y ajustar saldo dentro de `runTransaction`; validación previa de monto, fecha, concepto, tipo y cuenta. | `src/lib/firebase/movimientosRepo.ts` | MOV-01/02, INT-01 |
| H-02 | Editar/eliminar revierte el efecto anterior y aplica el nuevo en la misma transacción; transferencias ajustan ambos lados. | idem | MOV-10…16, INT-02/03 |
| H-03 | Transferencias con lectura y escritura transaccionales; validación de misma cuenta, existencia de destino y fondos. | idem | TRF-02…06, INT-04/05 |
| H-04 | `registrarPagoDeuda` transaccional con resultado tipado (`ok`, `error`, `saldoPendiente`, `cerrada`); rechaza sobrepago, deuda cerrada, cuenta inexistente y fondos insuficientes; marca `estado = pagada`. | `src/lib/firebase/deudasRepo.ts` | DEU-01…08, INT-06 |
| H-05 | Pago de nómina e impuesto transaccionales, con verificación de estado y saldo dentro de la transacción. | `src/lib/firebase/nominaRepo.ts`, `impuestosRepo.ts` | NOM-03, IMP-05, INT-07/08 |
| H-06 | `actualizarNomina` lee el documento, mezcla el cambio parcial y recalcula el total; rechaza salarios negativos. | `src/lib/firebase/nominaRepo.ts` | NOM-04/05/06 |
| H-07 | Validación de monto finito y > 0 en movimientos, transferencias, deudas, nómina e impuestos. | repositorios citados | MOV-03…05, TRF-06, DEU-06 |
| H-08 | Verificación de existencia de cuenta antes de escribir. | `movimientosRepo.ts` | MOV-08, CTA-12 |
| H-09 | Recurrentes respetan `fechaFin`; valores no positivos o no finitos se omiten en vez de crear movimientos en cero. | `src/lib/firebase/recurrentesRepo.ts` | REC-02/07 |
| H-10 | `piloto.ts` consume el resultado del pago de deuda y reporta fallos/sobrepago en vez de anunciar éxito falso. | `src/lib/piloto.ts` | DEU-09/10 |

### 3.2 Fechas y calendario

| ID | Corrección | Archivo | Evidencia |
|---|---|---|---|
| H-11…H-14 | Validación de fecha real (incluido 29/02), año explícito, fechas ISO, detección de “recibí/ingres*” y limpieza de preposiciones iniciales. | `src/ai/parser/nl.ts` | CHT-15…21/24 |
| H-15 | Recorte del día al último día real del mes al construir recordatorios. | `src/features/chat/engine.ts` | CHT-06 |
| H-16 | `fechaEnMes` recorta días 29–31 al último día real; no genera eventos de fechas ya pasadas del mes. | `src/lib/firebase/calendarioRepo.ts` | CAL-01/03/04, NOM-09/11 |
| H-17 | Se reemplazó `toISOString()` por `hoyISO()`/helpers locales en fechas de negocio, filtros y exportaciones (7 archivos). | `lib/fechas.ts`, `ChatPage.tsx`, `DeudasPage.tsx`, `RecurrentesPage.tsx`, `CalendarioPage.tsx`, `chat/interpretar.ts`, `backup.ts`, `nominaRepo.ts`, `preciosCombustible.ts`, `google/calendar.ts` | MOV-21, INT-10 |
| H-18 | `fechaExiste`, `diasEnMes`, validación de fecha real y recorte de meses/años en utilidades centrales. | `src/lib/fechas.ts` | CHT-17…19 |

### 3.3 Seguridad y privacidad

| ID | Corrección | Archivo | Evidencia |
|---|---|---|---|
| H-19 | Token OAuth de Google solo en memoria; se eliminó la clave heredada de `localStorage`; el corte de sincronización usa fecha local. | `src/lib/google/calendar.ts` | AUT-08, SEG-06, CAL-11 |
| H-20 | Lista blanca estricta de colecciones al importar backups. | `src/lib/firebase/backup.ts` | BAK-03, SEG-07 |
| H-21 | Validación completa de estructura e IDs antes de escribir, límite de 20.000 documentos y escrituras en lotes de 400. | idem | BAK-04/05/07, REN-08 |
| H-25 | Documentado; no se actualizaron dependencias para no ampliar el alcance del cambio. | `package.json` | SEG-10 |

> H-22, H-23 y H-24 son riesgos estructurales/aceptados: no se corrigieron en código. Ver §6.

### 3.4 Funcionalidad y UX

| ID | Corrección | Archivo | Evidencia |
|---|---|---|---|
| H-26 | El resumen mensual excluye transferencias de gastos/ingresos. | `src/features/chat/ChatPage.tsx` | MOV-25, TRF-07 |
| H-27 | El chat usa el saldo restante y el estado de cierre devueltos por el pago de deuda; muestra rechazos. | idem | DEU-09/10 |
| H-28 | La tarea de mantenimiento se valida (cuenta para el costo) antes de escribir. | idem | VEH-13 |
| H-29 | Guarda de intención de conversión de moneda: no genera borrador ni movimiento. | `src/features/chat/engine.ts` | CHT-03 |
| H-30 | La edición de vehículo mezcla bloques anidados en vez de reemplazarlos. | `src/lib/firebase/vehiculosRepo.ts` | VEH-03/04 |
| H-31 | `null` en bloques anidados se traduce a `deleteField()`. | `vehiculosRepo.ts`, `propiedadesRepo.ts` | VEH-06, PRO-02 |
| H-32 | Ralentí recortado a cero; nunca galones negativos. | `src/features/bearsReserve/geo.ts` | BRS-04 |
| H-33 | Rutas automáticas serializadas con cola de promesas; misión comunitaria idempotente. | `src/features/bearsReserve/repo.ts` | BRS-09/10 |
| H-34 | `lang="es"` en el documento. | `index.html` | ACC-01 |
| H-35 | `listarTodosLosMovimientos(max)` usa `orderBy('fecha','desc')` + `limit(max)`. | `movimientosRepo.ts` | MOV-17, REN-02 |

### 3.5 Hallazgos nuevos

| ID | Sev | Hallazgo | Estado |
|---|---|---|---|
| H-36 | S2 | `registrarPagoNomina` no es idempotente por periodo. El piloto automático verifica que no exista un movimiento `pago_nomina` del mes, pero dos pagos manuales desde el chat sí descuentan dos veces. | **Pendiente**; requiere definir el periodo de pago y una marca idempotente. |
| H-37 | S3 | `fechaFin` de un recurrente anterior a `fechaInicio` no se valida; simplemente no genera. | Pendiente, bajo impacto. |
| H-38 | S3 | Una importación de backup puede quedar parcial si falla un lote intermedio (la validación previa evita errores de estructura, no fallos de red). | Pendiente; requiere transacción multi-lote o marca de importación. |

---

## 4. Verificación final

Comandos ejecutados el 11/11/2026 sobre `auditoria/2026-11`:

```text
npm run test
  Test Files  15 passed (15)
       Tests  130 passed (130)
    Duration  17.64s

npm run lint        → sin errores
npx tsc -b          → sin errores
npm run build       → ✓ built; PWA 13 entradas (1516,48 KiB)
npm run coverage    → OK
  Statements 13,65 % (797/5837)
  Branches    9,58 % (545/5685)
  Functions   8,44 % (115/1361)
  Lines      14,22 % (740/5201)

npm audit
  92 vulnerabilidades: 0 critical, 17 high, 71 moderate, 4 low
```

### 4.1 Suites de regresión

| Suite | Pruebas |
|---|---:|
| `tests/movimientosRepo.test.ts` | 20 |
| `tests/parser.test.ts` | 16 |
| `tests/fechas.test.ts` | 11 |
| `tests/engine.test.ts` | 10 |
| `tests/vehiculosRepo.test.ts` | 10 |
| `tests/bearsReserve-logic.test.ts` | 8 |
| `tests/deudasRepo.test.ts` | 8 |
| `tests/backup.test.ts` | 7 |
| `tests/calendarioRepo.test.ts` | 7 |
| `tests/recurrentesRepo.test.ts` | 7 |
| `tests/impuestosRepo.test.ts` | 6 |
| `tests/nominaRepo.test.ts` | 6 |
| `tests/static.test.ts` | 6 |
| `tests/repoUtils.test.ts` | 5 |
| `tests/propiedadesRepo.test.ts` | 3 |
| **Total** | **130** |

Infraestructura añadida: `vitest.config.ts`, `tests/setup.ts`, `tests/helpers/fakeFirestore.ts`, scripts `test`, `test:watch`, `coverage` y dependencias de desarrollo (`vitest`, `jsdom`, Testing Library, `@vitest/coverage-v8`).

### 4.2 Cobertura de los módulos críticos

La cobertura agregada (13,65 %) incluye toda la UI, que no se ejecuta en jsdom. La cobertura relevante es la de lógica y repositorios:

| Módulo | Sentencias | Líneas |
|---|---:|---:|
| `ai/parser/nl.ts` | 95,87 % | 98,80 % |
| `lib/fechas.ts` | 91,11 % | 100 % |
| `lib/firebase/backup.ts` | 93,61 % | 93,33 % |
| `lib/firebase/deudasRepo.ts` | 79,06 % | 83,78 % |
| `lib/firebase/impuestosRepo.ts` | 75,60 % | 82,85 % |
| `lib/firebase/nominaRepo.ts` | 72,72 % | 81,63 % |
| `lib/firebase/recurrentesRepo.ts` | 67,14 % | 66,10 % |
| `features/chat/engine.ts` | 64,00 % | 68,38 % |
| `lib/firebase/movimientosRepo.ts` | 58,03 % | 62,00 % |
| `lib/firebase/vehiculosRepo.ts` | 55,11 % | 60,90 % |
| `lib/firebase/calendarioRepo.ts` | 52,77 % | 53,76 % |
| `lib/firebase/propiedadesRepo.ts` | 48,48 % | 51,72 % |
| `features/bearsReserve/geo.ts` | 100 % | 100 % |
| `features/bearsReserve/preciosCombustible.ts` | 100 % | 100 % |
| `lib/firebase/repoUtils.ts` | 100 % | 100 % |

Las ramas no cubiertas corresponden principalmente a rutas de UI, manejo de errores de red y combinaciones de acciones del chat.

---

## 5. Evaluación de seguridad (ASVS 5.0 / WSTG)

No se ejecutó una certificación ASVS; se evaluaron las áreas aplicables con evidencia local. Los controles que requieren backend real se marcan como no verificados.

| Área | Resultado | Evidencia / brecha |
|---|---|---|
| Autenticación | **No verificado** | Sin proyecto Auth de pruebas; casos AUT-01…07/09 BLOCKED. |
| Sesión y tokens | **Mejorado** | Token OAuth en memoria (AUT-08, SEG-06); persistencia de sesión Firebase no probada. |
| Control de acceso | **FAIL (riesgo residual)** | Colecciones financieras globales; cualquier usuario autenticado lee/escribe (H-22). Storage sí aísla por `uid`. |
| Validación de entrada | **Mejorado** | Montos, fechas, conceptos, cuentas y backups validados en repositorios. |
| Manejo de errores | **Parcial** | Pagos devuelven resultados tipados; quedan rutas de UI sin probar. |
| Protección de datos | **FAIL (riesgo aceptado)** | Clave Gemini en bundle y snapshot financiero completo a Google (H-23); historial del chat en `localStorage` (H-24). |
| Inyección / XSS | **PASS (estático)** | Sin `dangerouslySetInnerHTML`, `eval` ni `new Function` (SEG-04/05). |
| Dependencias | **FAIL** | 17 high, 71 moderate, 4 low; corrección disponible, no aplicada (H-25). |
| Configuración / cabeceras | **No verificado** | Sin hosting de pruebas para CSP/HSTS/XFO (SEG-11). |
| Backups | **Mejorado** | Lista blanca, validación previa, límite y lotes (H-20/H-21). |

**Riesgo más alto:** H-22. Si el proyecto Firebase llega a tener más de una cuenta, cualquier usuario autenticado puede leer y modificar todas las finanzas. La corrección requiere añadir `userId` a los documentos (o subcolecciones por usuario), reglas de validación de campos y un proyecto de pruebas para verificar. **No se desplegó** para no romper datos existentes sin migración.

---

## 6. Riesgos residuales y deuda técnica

| ID | Sev | Riesgo | Impacto | Mitigación recomendada |
|---|---|---|---|---|
| R-01 (H-22) | **S1** | Reglas Firestore sin aislamiento por usuario ni validación de campos | Fuga/alteración de finanzas entre cuentas | Migrar a `users/{uid}/...` o añadir `userId` + reglas; validar con emulador y proyecto de pruebas; migración de datos. |
| R-02 (H-36) | **S2** | Doble pago manual de nómina en el mismo mes | Descuento duplicado | Marca `ultimoPagoMes` o consulta idempotente dentro de la transacción; prueba de regresión. |
| R-03 (H-23) | **S2** | Clave Gemini en el cliente y snapshot financiero completo enviado a Google | Exposición de clave y datos | Proxy backend/serverless; no enviar saldos/deudas si no son necesarios; rotar clave. |
| R-04 (H-24) | **S3** | Historial del chat con montos en `localStorage` | Exposición en equipo compartido | No persistir, cifrar o permitir borrado; aviso de privacidad. |
| R-05 (H-25) | **S2** | 17 vulnerabilidades high en dependencias (firebase, firebase-tools, vite, zod, transitivas) | Superficie de ataque y mantenimiento | Actualizar por oleadas con build+tests; priorizar runtime (`firebase`, `vite`, `zod`). |
| R-06 (H-38) | **S3** | Backup potencialmente parcial si falla un lote | Restauración incompleta | Importación con marca de progreso o rollback; validar checksum. |
| R-07 (H-37) | **S3** | `fechaFin` < `fechaInicio` en recurrentes | Configuración silenciosamente inactiva | Validación en formulario y repo. |
| R-08 | **S2** | Sin E2E ni verificación de reglas/Auth/Storage reales | Defectos de integración no detectados | Playwright + proyecto Firebase de pruebas + emulador. |
| R-09 | **S3** | Cobertura agregada baja (13,65 %) | Regresiones en UI | Pruebas de componentes y E2E; objetivos por módulo. |
| R-10 | **S3** | Bundle principal > 500 kB | Carga inicial lenta en móvil | Code splitting por ruta y carga diferida de Gemini/Bear's Reserve. |
| R-11 | **S4** | Bear's Reserve sin suite de integración | Regresiones en flujo local | Pruebas de repositorio con `localStorage` simulado. |
| R-12 | **S4** | Casos manuales de accesibilidad sin ejecutar | Barreras para usuarios | Auditoría con axe + lector de pantalla + teclado. |

---

## 7. Accesibilidad (WCAG 2.2 AA)

- **Corregido:** `lang="es"` (ACC-01, H-34).
- **No ejecutado:** contraste, teclado, foco, etiquetas, `aria-live` del chat, zoom 200 %, errores asociados, nombres accesibles y movimiento reducido (ACC-02…10, BLOCKED).
- No se declara conformidad WCAG. La app usa componentes Radix y Tailwind, lo que facilita la base, pero **falta verificación real con navegador y lector de pantalla**.

---

## 8. Rendimiento

- `listarTodosLosMovimientos` ahora usa consulta acotada (`orderBy` + `limit`), evitando descargar todo el historial.
- Backup escribe en lotes de 400 y limita a 20.000 documentos.
- Build de producción exitoso; PWA precachea 13 entradas (1.516,48 KiB).
- **Pendiente:** presupuesto de bundle, code splitting, índices reales de Firestore, medición de latencia del chat y comportamiento con listas largas (REN-03/04/06/07).

---

## 9. Integridad de datos

Las operaciones que afectan dinero quedaron atómicas y probadas contra concurrencia:

- Movimiento + saldo (crear, editar, eliminar).
- Transferencia en ambos lados, incluida la carrera por fondos.
- Pago de deuda con cierre automático y rechazo de sobrepago.
- Pago de nómina e impuesto sin doble descuento concurrente.
- Reversos completos al eliminar, sin dinero perdido al convertir una transferencia en gasto.
- Fechas de negocio en zona local, no UTC.

Los pagos son transaccionales, pero **la idempotencia por periodo de nómina sigue pendiente** (R-02).

---

## 10. Limitaciones de la auditoría

1. **Sin proyecto Firebase de pruebas:** no se ejecutaron reglas reales, Auth, Storage ni consultas con índices. Los repositorios se probaron contra un doble en memoria fiel al subconjunto usado.
2. **Sin E2E de navegador:** UI, accesibilidad, PWA y flujos completos quedan BLOCKED.
3. **Sin datos de producción:** todos los datos de prueba son sintéticos.
4. **Bear's Reserve** se validó en lógica pura (geo, combustible) y por inspección en concurrencia; no hay suite de integración del módulo.
5. **Cobertura agregada** incluye UI no ejecutada; se reporta la cobertura de módulos críticos por separado.
6. **No se desplegó nada**: las correcciones están solo en la rama local `auditoria/2026-11`.

---

## 11. Recomendaciones priorizadas

1. **Inmediato (antes de multiusuario):** corregir H-22 con aislamiento por `userId`, reglas de validación y migración; probar con emulador.
2. **Corto plazo:** idempotencia de nómina (H-36), proxy para Gemini y rotación de clave (H-23), política de retención del chat (H-24).
3. **Corto plazo:** actualizar dependencias high (`firebase`, `vite`, `zod`, `firebase-tools`) con la suite como red de seguridad.
4. **Mediano plazo:** Playwright + Firebase Emulator Suite para Auth, reglas, Storage y flujos críticos; auditoría axe/teclado.
5. **Mediano plazo:** importación de backup con rollback/marca de progreso (H-38) y validación `fechaFin` (H-37).
6. **Continuo:** presupuesto de bundle, code splitting y pruebas de componentes para elevar la cobertura de UI.

---

## 12. Conclusión

La auditoría encontró y corrigió defectos reales de integridad financiera, fechas y persistencia que la compilación y el lint no detectaban. La app queda con **130 pruebas de regresión en verde**, build y tipos limpios, y un catálogo de 238 casos que separa explícitamente lo verificado de lo bloqueado.

No es correcto afirmar que CashMet está “listo para producción” sin resolver R-01 (aislamiento Firestore), R-02 (idempotencia de nómina) y R-05 (dependencias), y sin ejecutar E2E/Auth/reglas reales. Con esas salvedades, el núcleo financiero es hoy sustancialmente más seguro y consistente que en `develop`.
